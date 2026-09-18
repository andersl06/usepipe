import type { Campos, Resultado } from './campos.js';
import { and, eq } from 'drizzle-orm';
import { horarioAtendimento, horarioExcecao, horarioFaixa } from '@pipe/db/schema';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { alternarAtivaDaRegraFila, gravarRegraFila } from '../cadastros.js';
import { campoValido, operadorValido, type OperadorDeRegra } from '../regra-fila.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Server Actions de Regras — horário de atendimento, suas faixas e exceções.
 *
 * Mesmo formato `Resultado` de `app/comunicacao/acoes.ts`. Uma transação por
 * ação, consultas em série: `Promise.all` dentro do `comTenant` apaga o
 * `set_config('pipe.tenant_id')` e a RLS para de filtrar sem avisar.
 *
 * São três ações e não uma só porque o cadastro é incremental: cria-se o
 * horário, depois acrescenta-se faixa por faixa e feriado por feriado. Um
 * formulário único de "semana inteira" obrigaria a reenviar tudo a cada
 * correção, e sem `update` (que a auditoria ainda não permite) isso viraria
 * horário duplicado.
 */

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/**
 * O fuso, na grafia canônica do runtime, ou `null` se o IANA não conhece.
 *
 * A validação é o próprio `Intl`, que é exatamente o que
 * `packages/core/src/sla/expediente.ts` usa para converter instante em hora
 * local. Fuso que passa aqui é fuso que o cálculo de SLA vai aceitar.
 */
function normalizarFuso(fuso: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** `HH:MM`, com `24:00` aceito porque o core trata meia-noite do dia seguinte. */
function relogioValido(valor: string): boolean {
  return valor === '24:00' || /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

function minutos(relogio: string): number {
  const [h, m] = relogio.split(':');
  return Number(h) * 60 + Number(m);
}

// ------------------------------------------------------------------ horário

export async function salvarHorario(
  tx: TransacaoPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const fusoBruto = String(dados.get('fuso') ?? '').trim();

  if (!nome) return falha('Informe o nome do horário.');
  if (!fusoBruto) return falha('Informe o fuso.');

  const fuso = normalizarFuso(fusoBruto);
  if (fuso === null) {
    return falha(`"${fusoBruto}" não é um fuso IANA conhecido. Exemplo: America/Sao_Paulo.`);
  }

  return consultar(tx, async (tx) => {
    // `horario_atendimento` não tem índice único de nome; a unicidade é regra
    // desta tela. Dois "Comercial" fariam o gestor ligar a fila no errado.
    const [conflito] = await tx
      .select({ id: horarioAtendimento.id })
      .from(horarioAtendimento)
      .where(and(eq(horarioAtendimento.tenantId, tid), eq(horarioAtendimento.nome, nome)))
      .limit(1);
    if (conflito) return falha(`Já existe um horário chamado "${nome}".`);

    await tx.insert(horarioAtendimento).values({ tenantId: tid, nome, fuso });
    return OK;
  });
}

// -------------------------------------------------------------------- faixa

export async function salvarFaixa(
  tx: TransacaoPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const horarioId = String(dados.get('horarioId') ?? '').trim();
  const diaBruto = String(dados.get('diaSemana') ?? '').trim();
  const inicio = String(dados.get('inicio') ?? '').trim();
  const fim = String(dados.get('fim') ?? '').trim();

  if (!horarioId) return falha('Escolha o horário.');
  const diaSemana = Number(diaBruto);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return falha('Dia da semana inválido.');
  }
  if (!relogioValido(inicio) || !relogioValido(fim)) return falha('Horário inválido. Use HH:MM.');
  if (minutos(fim) <= minutos(inicio)) {
    return falha(
      'O fim tem de ser depois do início. Expediente que vira o dia são duas faixas, uma em cada dia.',
    );
  }

  return consultar(tx, async (tx) => {
    const [horario] = await tx
      .select({ id: horarioAtendimento.id })
      .from(horarioAtendimento)
      .where(and(eq(horarioAtendimento.tenantId, tid), eq(horarioAtendimento.id, horarioId)))
      .limit(1);
    if (!horario) return falha('Horário não encontrado.');

    // Faixas que se sobrepõem o core mescla sozinho (`faixasDoDia`), então
    // sobreposição não é erro. Faixa idêntica é: só polui a lista.
    const [igual] = await tx
      .select({ id: horarioFaixa.id })
      .from(horarioFaixa)
      .where(
        and(
          eq(horarioFaixa.horarioId, horarioId),
          eq(horarioFaixa.diaSemana, diaSemana),
          eq(horarioFaixa.inicio, inicio),
          eq(horarioFaixa.fim, fim),
        ),
      )
      .limit(1);
    if (igual) return falha('Esta faixa já está cadastrada neste dia.');

    await tx.insert(horarioFaixa).values({ tenantId: tid, horarioId, diaSemana, inicio, fim });
    return OK;
  });
}

// ------------------------------------------------------------------ exceção

export async function salvarExcecao(
  tx: TransacaoPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const horarioId = String(dados.get('horarioId') ?? '').trim();
  const data = String(dados.get('data') ?? '').trim();
  const fechado = dados.get('fechado') !== null;
  const inicio = String(dados.get('inicio') ?? '').trim();
  const fim = String(dados.get('fim') ?? '').trim();
  const motivo = String(dados.get('motivo') ?? '').trim();

  if (!horarioId) return falha('Escolha o horário.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha('Informe a data.');

  if (fechado) {
    if (inicio || fim)
      return falha(
        'Dia fechado não tem horário. Desmarque “fechado” para abrir em horário especial.',
      );
  } else {
    // Exceção aberta sem horário próprio o core devolve ao expediente normal do
    // dia (`faixasDoDia`) — ou seja, ela não faria nada. Melhor recusar do que
    // gravar uma linha que não muda nada.
    if (!inicio || !fim) {
      return falha(
        'Exceção que abre precisa de horário próprio; sem ele o dia cai no expediente normal e a exceção não faz nada.',
      );
    }
    if (!relogioValido(inicio) || !relogioValido(fim)) return falha('Horário inválido. Use HH:MM.');
    if (minutos(fim) <= minutos(inicio)) return falha('O fim tem de ser depois do início.');
  }

  return consultar(tx, async (tx) => {
    const [horario] = await tx
      .select({ id: horarioAtendimento.id })
      .from(horarioAtendimento)
      .where(and(eq(horarioAtendimento.tenantId, tid), eq(horarioAtendimento.id, horarioId)))
      .limit(1);
    if (!horario) return falha('Horário não encontrado.');

    // `horario_excecao_uk` é único de verdade em (horário, data). O `select`
    // existe para a mensagem: erro de constraint chega como 500 sem contexto.
    const [conflito] = await tx
      .select({ id: horarioExcecao.id })
      .from(horarioExcecao)
      .where(and(eq(horarioExcecao.horarioId, horarioId), eq(horarioExcecao.data, data)))
      .limit(1);
    if (conflito) return falha(`Já existe uma exceção em ${data} para este horário.`);

    await tx.insert(horarioExcecao).values({
      tenantId: tid,
      horarioId,
      data,
      fechado,
      inicio: fechado ? null : inicio,
      fim: fechado ? null : fim,
      motivo: motivo || null,
    });
    return OK;
  });
}

// ---------------------------------------------------------- regra de entrada

/**
 * A regra de entrada — §8 da spec de métricas.
 *
 * A ação faz só o que é da tela: lê o `FormData`, valida, chama a função de
 * `lib/cadastros.ts` e revalida a rota. A conversa com o Postgres mora lá, sem
 * saber que o Next existe — quando a `apps/api` virar a única porta do banco, é
 * um arquivo que muda de lugar (README, "Quem fala com o banco").
 *
 * O formulário manda de uma vez o cabeçalho da regra e as condições dela:
 * diferente do horário, aqui o cadastro incremental não serve. Regra sem
 * condição nunca casa (`filaDeDestino`), então salvar a cabeça e depois as
 * condições deixaria, entre os dois passos, uma regra ativa que não faz nada.
 *
 * As condições chegam como três listas paralelas (`campo[]`, `operador[]`,
 * `valor[]`), que é como o `FormData` devolve campos repetidos.
 */
export async function salvarRegraFila(
  tx: TransacaoPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const filaDestinoId = String(dados.get('filaDestinoId') ?? '').trim();
  const combinador = String(dados.get('combinador') ?? 'e').trim();
  const ordemBruta = String(dados.get('ordem') ?? '').trim();

  if (!nome) return falha('Informe o nome da regra.');
  if (!filaDestinoId) return falha('Escolha a fila de destino.');
  if (combinador !== 'e' && combinador !== 'ou') return falha('Combinador inválido.');

  const ordem = Number(ordemBruta || '0');
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 999) {
    return falha('A ordem é um inteiro de 0 a 999 — é ela que decide qual regra é avaliada antes.');
  }

  const campos = dados.getAll('campo').map((v) => String(v).trim());
  const operadores = dados.getAll('operador').map((v) => String(v).trim());
  const valores = dados.getAll('valor').map((v) => String(v).trim());

  const condicoes: { campo: string; operador: OperadorDeRegra; valor: string }[] = [];
  for (let i = 0; i < campos.length; i += 1) {
    const campo = campos[i] ?? '';
    const operador = operadores[i] ?? '';
    const valor = valores[i] ?? '';
    // Linha em branco é linha que a pessoa não preencheu, não erro: o
    // formulário nasce com uma e ninguém é obrigado a usar as que acrescentou.
    if (!campo && !valor) continue;
    if (!campoValido(campo)) {
      return falha(
        `"${campo}" não é um campo válido. Use um dos fixos ou um campo extra como contato.atributos.plano.`,
      );
    }
    if (!operadorValido(operador)) return falha('Operador inválido.');
    if (!valor) return falha(`A condição sobre "${campo}" ficou sem valor.`);
    condicoes.push({ campo, operador, valor });
  }

  if (condicoes.length === 0) {
    return falha('Uma regra sem condição nunca casa. Preencha pelo menos uma.');
  }

  const gravado = await gravarRegraFila(tx, tid, ator, {
    nome,
    ordem,
    combinador,
    filaDestinoId,
    condicoes,
  });
  if (!gravado.ok) return falha(gravado.erro);
  return OK;
}

/**
 * O interruptor da própria lista, sem abrir formulário — o controle do
 * cartão-linha deles (`blip-telas-cadastro.md` §2).
 *
 * Ele existe agora porque a auditoria existe agora: é exatamente a condição que
 * o comentário de `componentes/lista-regras.tsx` registrou.
 */
export async function alternarRegraFila(
  tx: TransacaoPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const id = String(dados.get('id') ?? '').trim();
  if (!id) return falha('Regra não informada.');
  const gravacao = await alternarAtivaDaRegraFila(tx, tid, ator, id);
  return gravacao.ok ? OK : falha(gravacao.erro);
}
