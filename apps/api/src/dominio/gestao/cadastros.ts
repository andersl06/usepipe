import { and, asc, count, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  dentroDoExpediente,
  duracaoTotalSeg,
  intervalosUteis,
  proximaAbertura,
  type HorarioAtendimento as ExpedienteDoCore,
} from '@pipe/core';
import {
  conversa,
  fila,
  filaAtendente,
  horarioAtendimento,
  horarioExcecao,
  horarioFaixa,
  inbox,
  motivoPausa,
  pausa,
  regraFila,
  regraFilaCondicao,
  statusAtendente,
  usuario,
} from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { corValida } from './cores-de-fila.js';
import { minutosDoRelogio, relogio, relogioValido } from './formato.js';
import { campoValido, operadorValido, type OperadorDeRegra, type RegraDeFila } from './regra-fila.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/** Do catálogo (`packages/db/src/semente.ts`): "Criar, editar e desativar fila". */
export const FILA_GERENCIAR = 'fila.gerenciar';
/** "Gerenciar regras de fila, prioridade e SLA" — as três também moram aqui. */
export const REGRA_GERENCIAR = 'regra.gerenciar';
/** "Gerenciar horário de atendimento e feriado". */
export const HORARIO_GERENCIAR = 'horario.gerenciar';
/** Novo — migração 0030: nenhuma permissão do catálogo cobria motivo de pausa. */
export const PAUSA_GERENCIAR = 'pausa.gerenciar';

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/**
 * Leitura das três telas de cadastro: filas, motivos de pausa e horários.
 *
 * Diferente de `configuracoes.ts`, que é o retrato somente-leitura do tenant,
 * aqui a leitura existe para alimentar um formulário que escreve. O limite que
 * este comentário registrava — "cadastra-se, mas não se edita nem se apaga,
 * porque a auditoria não existe" — caiu: `registrarAuditoria` do `@pipe/db`
 * grava autor, valor anterior e horário na MESMA transação da mudança, e é isso
 * que destrava o interruptor da regra de entrada aqui embaixo.
 *
 * Nada neste arquivo sabe que o Next existe: sem `revalidatePath`, sem JSX. A
 * consulta recebe parâmetro e devolve dado, para virar endpoint da `apps/api`
 * por movimentação e não por reescrita (README, "Quem fala com o banco").
 *
 * Toda consulta abaixo roda EM SÉRIE dentro de um único `comTenant`. Nada de
 * `Promise.all` aqui: consulta paralela na mesma conexão apaga o
 * `set_config('pipe.tenant_id')` da transação e a RLS passa a não filtrar nada
 * (README, "Como o isolamento entre clientes funciona").
 */

// ------------------------------------------------------------------- filas

export interface AtendenteDaFila {
  id: string;
  nome: string;
  estado: string | null;
  /** `fila_atendente.capacidade_override` ou a capacidade padrão da fila. */
  capacidade: number;
  /** O atendente tem limite próprio, diferente do padrão da fila. */
  temOverride: boolean;
}

export interface FilaCadastrada {
  id: string;
  nome: string;
  cor: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
  horarioId: string | null;
  horarioNome: string | null;
  atendentes: AtendenteDaFila[];
}

export interface HorarioParaEscolher {
  id: string;
  nome: string;
}

export async function carregarFilas(tx: TransacaoPipe): Promise<{
  filas: FilaCadastrada[];
  horarios: HorarioParaEscolher[];
}> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: fila.id,
        nome: fila.nome,
        cor: fila.cor,
        capacidadePadrao: fila.capacidadePadrao,
        ordem: fila.ordem,
        ativa: fila.ativa,
        horarioId: fila.horarioId,
        horarioNome: horarioAtendimento.nome,
      })
      .from(fila)
      .leftJoin(horarioAtendimento, eq(horarioAtendimento.id, fila.horarioId))
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const membros = await tx
      .select({
        filaId: filaAtendente.filaId,
        usuarioId: filaAtendente.usuarioId,
        nome: usuario.nome,
        override: filaAtendente.capacidadeOverride,
        estado: statusAtendente.estado,
      })
      .from(filaAtendente)
      .innerJoin(usuario, eq(usuario.id, filaAtendente.usuarioId))
      .leftJoin(statusAtendente, eq(statusAtendente.usuarioId, filaAtendente.usuarioId))
      .orderBy(asc(usuario.nome));

    const horarios = await tx
      .select({ id: horarioAtendimento.id, nome: horarioAtendimento.nome })
      .from(horarioAtendimento)
      .orderBy(asc(horarioAtendimento.nome));

    const porFila = new Map<string, AtendenteDaFila[]>();
    for (const m of membros) {
      const padrao = linhas.find((l) => l.id === m.filaId)?.capacidadePadrao ?? 0;
      const atendente: AtendenteDaFila = {
        id: m.usuarioId,
        nome: m.nome,
        estado: m.estado,
        capacidade: m.override ?? padrao,
        temOverride: m.override !== null,
      };
      const atual = porFila.get(m.filaId);
      if (atual) atual.push(atendente);
      else porFila.set(m.filaId, [atendente]);
    }

    return {
      filas: linhas.map((l) => ({ ...l, atendentes: porFila.get(l.id) ?? [] })),
      horarios,
    };
  });
}

// ------------------------------------------------------------------ pausas

export interface MotivoDePausa {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
  /** Pausas encerradas no período. */
  pausas: number;
  /** Duração média observada, em segundos. `null` quando ninguém usou. */
  mediaSeg: number | null;
}

export interface UsoDePausas {
  motivos: MotivoDePausa[];
  /** Início da janela de observação. */
  desde: Date;
  dias: number;
  /** Pausas encerradas no período cujo motivo foi apagado ou nunca informado. */
  semMotivo: number;
  /** Pausas em aberto agora — fora da média, porque ainda não terminaram. */
  abertas: number;
}

/**
 * Motivos com o uso real ao lado da duração sugerida.
 *
 * A média sai do banco, e não do `@pipe/core`: `packages/core/src/esforco/` mede
 * esforço de conversa e tempo em sessão, e só conhece pausa como o INTERVALO
 * entre duas mensagens do atendente (`calcularTempoEmSessao`, corte em 10
 * minutos). Nenhuma função de lá recebe `pausa` nem `motivo_pausa` — não havia o
 * que reaproveitar, e agregação por motivo é `avg` de SQL mesmo.
 *
 * Janela móvel de `dias` corridos, e não o mês do calendário: a pergunta da tela
 * é "o almoço de 30 minutos está durando 47?", e para essa o recorte honesto é o
 * passado recente.
 */
export async function carregarPausas(tx: TransacaoPipe, dias = 30): Promise<UsoDePausas> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  return consultar(tx, async (tx) => {
    const motivos = await tx
      .select({
        id: motivoPausa.id,
        nome: motivoPausa.nome,
        duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
        contaComoProdutivo: motivoPausa.contaComoProdutivo,
        ativo: motivoPausa.ativo,
      })
      .from(motivoPausa)
      .orderBy(asc(motivoPausa.nome));

    const uso = await tx
      .select({
        motivoId: pausa.motivoId,
        pausas: count(),
        mediaSeg: sql<
          number | null
        >`avg(extract(epoch from (${pausa.encerradaEm} - ${pausa.iniciadaEm})))`,
      })
      .from(pausa)
      .where(and(isNotNull(pausa.encerradaEm), gte(pausa.iniciadaEm, desde)))
      .groupBy(pausa.motivoId);

    const [emAberto] = await tx
      .select({ total: count() })
      .from(pausa)
      .where(isNull(pausa.encerradaEm));

    const porMotivo = new Map(uso.map((u) => [u.motivoId, u]));
    const orfas = porMotivo.get(null);

    return {
      motivos: motivos.map((m) => {
        const u = porMotivo.get(m.id);
        return {
          ...m,
          pausas: u?.pausas ?? 0,
          mediaSeg: u && u.mediaSeg !== null ? Number(u.mediaSeg) : null,
        };
      }),
      desde,
      dias,
      semMotivo: orfas?.pausas ?? 0,
      abertas: emAberto?.total ?? 0,
    };
  });
}

// ---------------------------------------------------------------- horários

export interface FaixaDoHorario {
  id: string;
  diaSemana: number;
  inicio: string;
  fim: string;
}

export interface ExcecaoDoHorario {
  id: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

export interface HorarioCadastrado {
  id: string;
  nome: string;
  fuso: string;
  faixas: FaixaDoHorario[];
  excecoes: ExcecaoDoHorario[];
  /** Nomes das filas que apontam para este horário. Vazio = horário sem uso. */
  filas: string[];
  abertoAgora: boolean;
  /** `null` = nenhuma abertura no horizonte do core — horário sem faixa nenhuma. */
  proximaAberturaEm: Date | null;
  /** Expediente dos próximos sete dias, com feriado já descontado. */
  seteDiasSeg: number;
}

export interface Horarios {
  horarios: HorarioCadastrado[];
  /** Filas ativas sem horário: nelas o relógio do SLA corre 24×7. */
  filasSemHorario: string[];
  agora: Date;
}

const SETE_DIAS_MS = 7 * 86_400_000;

/**
 * Horários com faixas, exceções, quem os usa, e o que o `@pipe/core` diz deles.
 *
 * "Aberto agora", "próxima abertura" e "expediente dos próximos sete dias" NÃO
 * são somados aqui: saem de `dentroDoExpediente`, `proximaAbertura` e
 * `duracaoTotalSeg(intervalosUteis(...))` de
 * `packages/core/src/sla/expediente.ts` — as mesmas funções com que o SLA decide
 * se uma conversa estourou. Somar as faixas à mão nesta tela é exatamente como o
 * número da tela e o número do relatório passam a divergir.
 */
export async function carregarHorarios(tx: TransacaoPipe): Promise<Horarios> {
  const agora = new Date();

  return consultar(tx, async (tx) => {
    const cabecas = await tx
      .select({
        id: horarioAtendimento.id,
        nome: horarioAtendimento.nome,
        fuso: horarioAtendimento.fuso,
      })
      .from(horarioAtendimento)
      .orderBy(asc(horarioAtendimento.nome));

    const faixas = await tx
      .select({
        id: horarioFaixa.id,
        horarioId: horarioFaixa.horarioId,
        diaSemana: horarioFaixa.diaSemana,
        inicio: horarioFaixa.inicio,
        fim: horarioFaixa.fim,
      })
      .from(horarioFaixa)
      .orderBy(asc(horarioFaixa.diaSemana), asc(horarioFaixa.inicio));

    const excecoes = await tx
      .select({
        id: horarioExcecao.id,
        horarioId: horarioExcecao.horarioId,
        data: horarioExcecao.data,
        fechado: horarioExcecao.fechado,
        inicio: horarioExcecao.inicio,
        fim: horarioExcecao.fim,
        motivo: horarioExcecao.motivo,
      })
      .from(horarioExcecao)
      .orderBy(asc(horarioExcecao.data));

    const filas = await tx
      .select({ nome: fila.nome, horarioId: fila.horarioId, ativa: fila.ativa })
      .from(fila)
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const horarios = cabecas.map((h) => {
      const minhasFaixas: FaixaDoHorario[] = faixas
        .filter((f) => f.horarioId === h.id)
        .map((f) => ({
          id: f.id,
          diaSemana: f.diaSemana,
          inicio: relogio(f.inicio),
          fim: relogio(f.fim),
        }));

      const minhasExcecoes: ExcecaoDoHorario[] = excecoes
        .filter((e) => e.horarioId === h.id)
        .map((e) => ({
          id: e.id,
          data: e.data,
          fechado: e.fechado,
          inicio: e.inicio === null ? null : relogio(e.inicio),
          fim: e.fim === null ? null : relogio(e.fim),
          motivo: e.motivo,
        }));

      const paraOCore: ExpedienteDoCore = {
        fuso: h.fuso,
        faixas: minhasFaixas,
        excecoes: minhasExcecoes,
      };

      return {
        ...h,
        faixas: minhasFaixas,
        excecoes: minhasExcecoes,
        filas: filas.filter((f) => f.horarioId === h.id).map((f) => f.nome),
        abertoAgora: dentroDoExpediente(agora, paraOCore),
        proximaAberturaEm: proximaAbertura(agora, paraOCore),
        seteDiasSeg: duracaoTotalSeg(
          intervalosUteis(agora, new Date(agora.getTime() + SETE_DIAS_MS), paraOCore),
        ),
      };
    });

    return {
      horarios,
      filasSemHorario: filas.filter((f) => f.ativa && f.horarioId === null).map((f) => f.nome),
      agora,
    };
  });
}

/* ============================================ escrita — faixa e exceção
   Item 3 da tarefa de cadastros do Atendimento: `acoes/regras.ts` já grava
   faixa e exceção (`salvarFaixa`/`salvarExcecao`, criação incremental); aqui
   entram editar e excluir de cada uma, no padrão REST (`ErroPipe`, status de
   verdade) — os dois gestos que ainda não existiam.

   `horarioId` não muda na edição: mover uma faixa para outro horário é
   excluir e recriar, não editar — o mesmo limite que `editarFila` aplica ao
   não deixar a fila trocar de tenant. */

export interface PedidoDeEdicaoDeFaixa {
  diaSemana?: number;
  inicio?: string;
  fim?: string;
}

export interface FaixaGravada {
  id: string;
  horarioId: string;
  diaSemana: number;
  inicio: string;
  fim: string;
}

async function faixaViva(tx: TransacaoPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({
      id: horarioFaixa.id,
      horarioId: horarioFaixa.horarioId,
      diaSemana: horarioFaixa.diaSemana,
      inicio: horarioFaixa.inicio,
      fim: horarioFaixa.fim,
    })
    .from(horarioFaixa)
    .where(and(eq(horarioFaixa.tenantId, tid), eq(horarioFaixa.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('faixa de horário');
  return atual;
}

function diaSemanaConferido(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    throw ErroPipe.requisicao('dia_semana_invalido', 'Dia da semana inválido.');
  }
  return n;
}

function relogioConferido(bruto: unknown, campo: string): string {
  const valor = String(bruto ?? '').trim();
  if (!relogioValido(valor)) {
    throw ErroPipe.requisicao(`${campo}_invalido`, `"${campo}" inválido. Use HH:MM.`);
  }
  return valor;
}

/**
 * `update`: dia, início e fim são o mesmo gesto.
 *
 * Recusa (409) início ≥ fim e recusa (409) sobreposição no mesmo dia do
 * mesmo horário — pedido explícito da tarefa. **Decisão Pipe**, registrada
 * porque diverge da CRIAÇÃO: `salvarFaixaInterna` (`acoes/regras.ts`) deixa
 * faixas do mesmo dia se sobrepor de propósito, porque `faixasDoDia` do
 * `@pipe/core` funde intervalos sozinho e duas faixas sobrepostas nunca
 * abriram menos do que uma só. Aqui a regra é mais estrita porque é o que a
 * tarefa pediu; a criação antiga não muda, para não alterar comportamento já
 * testado.
 */
export async function editarFaixaHorario(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeFaixa,
): Promise<FaixaGravada> {
  const atual = await faixaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, HORARIO_GERENCIAR);

  // `relogio()` normaliza o `HH:MM:SS` que o Postgres devolve para o `HH:MM`
  // que a API recebe e devolve — sem isso, reenviar o mesmo horário parecia
  // uma mudança (formato diferente, valor igual) e sujava a auditoria.
  const antes = { diaSemana: atual.diaSemana, inicio: relogio(atual.inicio), fim: relogio(atual.fim) };
  const depois = { ...antes };

  if (pedido.diaSemana !== undefined) depois.diaSemana = diaSemanaConferido(pedido.diaSemana);
  if (pedido.inicio !== undefined) depois.inicio = relogioConferido(pedido.inicio, 'início');
  if (pedido.fim !== undefined) depois.fim = relogioConferido(pedido.fim, 'fim');

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (minutosDoRelogio(depois.fim) <= minutosDoRelogio(depois.inicio)) {
    throw ErroPipe.conflito(
      'fim_antes_do_inicio',
      'O fim tem de ser depois do início. Expediente que vira o dia são duas faixas, uma em cada dia.',
    );
  }

  const irmas = await tx
    .select({ id: horarioFaixa.id, inicio: horarioFaixa.inicio, fim: horarioFaixa.fim })
    .from(horarioFaixa)
    .where(and(eq(horarioFaixa.horarioId, atual.horarioId), eq(horarioFaixa.diaSemana, depois.diaSemana), ne(horarioFaixa.id, id)));
  const inicioMin = minutosDoRelogio(depois.inicio);
  const fimMin = minutosDoRelogio(depois.fim);
  const sobrepoe = irmas.some(
    (f) => inicioMin < minutosDoRelogio(f.fim) && minutosDoRelogio(f.inicio) < fimMin,
  );
  if (sobrepoe) {
    throw ErroPipe.conflito('faixa_sobreposta', 'Esta faixa se sobrepõe a outra já cadastrada neste dia.');
  }

  await tx
    .update(horarioFaixa)
    .set({ diaSemana: depois.diaSemana, inicio: depois.inicio, fim: depois.fim })
    .where(and(eq(horarioFaixa.tenantId, tid), eq(horarioFaixa.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'horario_faixa',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });

  return { ...atual, ...depois };
}

export async function excluirFaixaHorario(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await faixaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, HORARIO_GERENCIAR);

  await tx.delete(horarioFaixa).where(and(eq(horarioFaixa.tenantId, tid), eq(horarioFaixa.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'horario_faixa',
    objetoId: id,
    antes: { horarioId: atual.horarioId, diaSemana: atual.diaSemana, inicio: atual.inicio, fim: atual.fim },
  });
}

export interface PedidoDeEdicaoDeExcecao {
  data?: string;
  fechado?: boolean;
  inicio?: string | null;
  fim?: string | null;
  motivo?: string | null;
}

export interface ExcecaoGravada {
  id: string;
  horarioId: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

async function excecaoViva(tx: TransacaoPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({
      id: horarioExcecao.id,
      horarioId: horarioExcecao.horarioId,
      data: horarioExcecao.data,
      fechado: horarioExcecao.fechado,
      inicio: horarioExcecao.inicio,
      fim: horarioExcecao.fim,
      motivo: horarioExcecao.motivo,
    })
    .from(horarioExcecao)
    .where(and(eq(horarioExcecao.tenantId, tid), eq(horarioExcecao.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('exceção de horário');
  return atual;
}

/**
 * `update`: mesmas regras da criação (`salvarExcecaoInterna`) — fechado não
 * tem horário próprio, aberto precisa dos dois, início < fim, e a data não
 * pode colidir com outra exceção do mesmo horário (`horario_excecao_uk`).
 */
export async function editarExcecaoHorario(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeExcecao,
): Promise<ExcecaoGravada> {
  const atual = await excecaoViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, HORARIO_GERENCIAR);

  const antes = {
    data: atual.data,
    fechado: atual.fechado,
    inicio: atual.inicio === null ? null : relogio(atual.inicio),
    fim: atual.fim === null ? null : relogio(atual.fim),
    motivo: atual.motivo,
  };
  const depois = { ...antes };

  if (pedido.data !== undefined) {
    const data = String(pedido.data).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw ErroPipe.requisicao('data_invalida', 'Informe a data.');
    depois.data = data;
  }
  if (pedido.fechado !== undefined) depois.fechado = pedido.fechado;
  if (pedido.inicio !== undefined) depois.inicio = pedido.inicio === null ? null : relogioConferido(pedido.inicio, 'início');
  if (pedido.fim !== undefined) depois.fim = pedido.fim === null ? null : relogioConferido(pedido.fim, 'fim');
  if (pedido.motivo !== undefined) depois.motivo = pedido.motivo?.trim() || null;

  if (depois.fechado) {
    if (depois.inicio || depois.fim) {
      throw ErroPipe.requisicao(
        'excecao_fechada_com_horario',
        'Dia fechado não tem horário. Desmarque "fechado" para abrir em horário especial.',
      );
    }
  } else {
    if (!depois.inicio || !depois.fim) {
      throw ErroPipe.requisicao(
        'excecao_sem_horario',
        'Exceção que abre precisa de horário próprio; sem ele o dia cai no expediente normal e a exceção não faz nada.',
      );
    }
    if (minutosDoRelogio(depois.fim) <= minutosDoRelogio(depois.inicio)) {
      throw ErroPipe.conflito('fim_antes_do_inicio', 'O fim tem de ser depois do início.');
    }
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.data !== antes.data) {
    const [conflito] = await tx
      .select({ id: horarioExcecao.id })
      .from(horarioExcecao)
      .where(and(eq(horarioExcecao.horarioId, atual.horarioId), eq(horarioExcecao.data, depois.data), ne(horarioExcecao.id, id)))
      .limit(1);
    if (conflito) {
      throw ErroPipe.conflito('data_em_uso', `Já existe uma exceção em ${depois.data} para este horário.`);
    }
  }

  await tx
    .update(horarioExcecao)
    .set({
      data: depois.data,
      fechado: depois.fechado,
      inicio: depois.fechado ? null : depois.inicio,
      fim: depois.fechado ? null : depois.fim,
      motivo: depois.motivo,
    })
    .where(and(eq(horarioExcecao.tenantId, tid), eq(horarioExcecao.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'horario_excecao',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });

  return { ...atual, ...depois, inicio: depois.fechado ? null : depois.inicio, fim: depois.fechado ? null : depois.fim };
}

export async function excluirExcecaoHorario(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await excecaoViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, HORARIO_GERENCIAR);

  await tx.delete(horarioExcecao).where(and(eq(horarioExcecao.tenantId, tid), eq(horarioExcecao.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'horario_excecao',
    objetoId: id,
    antes: { horarioId: atual.horarioId, data: atual.data, fechado: atual.fechado },
  });
}

// ------------------------------------------------------- regras de entrada

/**
 * As regras de entrada, com as condições de cada uma — §8 da spec de métricas.
 *
 * Ordenadas por `ordem` e depois por id, que é a MESMA ordem que
 * `ordenarRegras` de `regra-fila.ts` aplica: a tela não pode listar numa ordem
 * e o motor avaliar noutra, senão o gestor testa a regra pela lista e conclui
 * que o produto está quebrado.
 *
 * As filas vêm juntas porque o formulário precisa delas, e porque a tela avisa
 * quando a regra aponta para uma fila desativada — regra que manda conversa
 * para fila desativada é regra que engole conversa.
 */
export interface FilaParaEscolher {
  id: string;
  nome: string;
  ativa: boolean;
}

/** A regra do banco carrega uma coisa a mais que o motor: se a fila de destino está de pé. */
export interface RegraDeFilaCadastrada extends RegraDeFila {
  filaDestinoAtiva: boolean;
}

export async function carregarRegrasDeFila(tx: TransacaoPipe): Promise<{
  regras: RegraDeFilaCadastrada[];
  filas: FilaParaEscolher[];
  /** Nomes das caixas de entrada e a fila padrão delas: o destino de quem não casa nenhuma regra. */
  padroes: { inbox: string; fila: string | null }[];
}> {
  return consultar(tx, async (tx) => {
    const cabecas = await tx
      .select({
        id: regraFila.id,
        nome: regraFila.nome,
        ordem: regraFila.ordem,
        combinador: regraFila.combinador,
        filaDestinoId: regraFila.filaDestinoId,
        filaDestinoNome: fila.nome,
        filaDestinoAtiva: fila.ativa,
        ativa: regraFila.ativa,
      })
      .from(regraFila)
      .innerJoin(fila, eq(fila.id, regraFila.filaDestinoId))
      .orderBy(asc(regraFila.ordem), asc(regraFila.id));

    const condicoes = await tx
      .select({
        regraId: regraFilaCondicao.regraId,
        campo: regraFilaCondicao.campo,
        operador: regraFilaCondicao.operador,
        valor: regraFilaCondicao.valor,
      })
      .from(regraFilaCondicao)
      .orderBy(asc(regraFilaCondicao.campo), asc(regraFilaCondicao.id));

    const filas = await tx
      .select({ id: fila.id, nome: fila.nome, ativa: fila.ativa })
      .from(fila)
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const caixas = await tx
      .select({ inbox: inbox.nome, fila: fila.nome })
      .from(inbox)
      .leftJoin(fila, eq(fila.id, inbox.filaPadraoId))
      .orderBy(asc(inbox.nome));

    return {
      regras: cabecas.map((c) => ({
        id: c.id,
        nome: c.nome,
        ordem: c.ordem,
        combinador: c.combinador as 'e' | 'ou',
        filaDestinoId: c.filaDestinoId,
        filaDestinoNome: c.filaDestinoNome,
        filaDestinoAtiva: c.filaDestinoAtiva,
        ativa: c.ativa,
        condicoes: condicoes
          .filter((cond) => cond.regraId === c.id)
          .map((cond) => ({
            campo: cond.campo,
            operador: cond.operador as OperadorDeRegra,
            valor: cond.valor ?? '',
          })),
      })),
      filas,
      padroes: caixas,
    };
  });
}

/**
 * Escrita da regra de entrada.
 *
 * Mora aqui, e não na Server Action, porque **front é front e banco é da
 * `api`** (README, "Quem fala com o banco — a fronteira"): esta função recebe
 * parâmetro e devolve dado, sem `revalidatePath`, sem JSX, sem saber que o Next
 * existe. Quando a `apps/api` virar a única porta do Postgres, ela é MOVIDA, não
 * reescrita.
 *
 * A auditoria é gravada na MESMA transação (`registrarAuditoria` do `@pipe/db`):
 * log em transação separada some quando a mudança falha e sobra quando ela é
 * desfeita, e nos dois casos passa a mentir.
 */
export interface NovaRegraDeFila {
  nome: string;
  ordem: number;
  combinador: 'e' | 'ou';
  filaDestinoId: string;
  condicoes: readonly { campo: string; operador: OperadorDeRegra; valor: string }[];
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

export async function gravarRegraFila(
  tx: TransacaoPipe,
  tid: string,
  quemGrava: Ator,
  entrada: NovaRegraDeFila,
): Promise<Gravacao> {
  if (quemGrava.tipo === 'usuario' && quemGrava.id) await exigirPermissao(tx, quemGrava.id, REGRA_GERENCIAR);
  return consultar(tx, async (tx) => {
    // `regra_fila` não tem índice único de nome; a unicidade é regra desta
    // tela. Duas "Cobrança" fazem o gestor editar a que não está valendo.
    const [conflito] = await tx
      .select({ id: regraFila.id })
      .from(regraFila)
      .where(and(eq(regraFila.tenantId, tid), eq(regraFila.nome, entrada.nome)))
      .limit(1);
    if (conflito) return { ok: false, erro: `Já existe uma regra chamada "${entrada.nome}".` };

    const [destino] = await tx
      .select({ id: fila.id })
      .from(fila)
      .where(and(eq(fila.tenantId, tid), eq(fila.id, entrada.filaDestinoId)))
      .limit(1);
    if (!destino) return { ok: false, erro: 'Fila de destino não encontrada.' };

    const [criada] = await tx
      .insert(regraFila)
      .values({
        tenantId: tid,
        nome: entrada.nome,
        ordem: entrada.ordem,
        combinador: entrada.combinador,
        filaDestinoId: entrada.filaDestinoId,
        ativa: true,
      })
      .returning({ id: regraFila.id });
    if (!criada) return { ok: false, erro: 'Não consegui gravar a regra.' };

    await tx
      .insert(regraFilaCondicao)
      .values(entrada.condicoes.map((c) => ({ tenantId: tid, regraId: criada.id, ...c })));

    await registrarAuditoria(tx, tid, {
      ator: quemGrava,
      acao: 'criou',
      objetoTipo: 'regra_fila',
      objetoId: criada.id,
      depois: { ...entrada, ativa: true, condicoes: entrada.condicoes.length },
    });

    return { ok: true };
  });
}

/** O interruptor do cartão-linha: liga e desliga a regra na própria lista. */
export async function alternarAtivaDaRegraFila(
  tx: TransacaoPipe,
  tid: string,
  quemAlterna: Ator,
  id: string,
): Promise<Gravacao> {
  if (quemAlterna.tipo === 'usuario' && quemAlterna.id) await exigirPermissao(tx, quemAlterna.id, REGRA_GERENCIAR);
  return consultar(tx, async (tx) => {
    const [atual] = await tx
      .select({ nome: regraFila.nome, ativa: regraFila.ativa })
      .from(regraFila)
      .where(and(eq(regraFila.tenantId, tid), eq(regraFila.id, id)))
      .limit(1);
    if (!atual) return { ok: false, erro: 'Regra não encontrada.' };

    await tx.update(regraFila).set({ ativa: !atual.ativa }).where(eq(regraFila.id, id));

    await registrarAuditoria(tx, tid, {
      ator: quemAlterna,
      acao: atual.ativa ? 'desativou' : 'ativou',
      objetoTipo: 'regra_fila',
      objetoId: id,
      antes: { nome: atual.nome, ativa: atual.ativa },
      depois: { nome: atual.nome, ativa: !atual.ativa },
    });

    return { ok: true };
  });
}

/* ============================================== escrita — regra de entrada
   Item 1 (segunda parte) da tarefa de cadastros do Atendimento: editar
   (nome, fila destino, combinador, condições e ORDEM) e excluir. Criar e o
   interruptor já existiam (`gravarRegraFila`/`alternarAtivaDaRegraFila`,
   acima) — REST de verdade a partir daqui, no padrão de `editarFila`/
   `excluirFila` (ErroPipe com status real, não `Resultado` em 200).

   Decisão Pipe — REORDENAR não ganha rota própria: `ordem` já é só mais um
   campo do PATCH, exatamente como em `editarFila`. Duas regras trocando de
   posição são dois PATCH (um por regra), cada um com a nova `ordem` — a
   tela manda um por vez ao mover uma linha para cima/baixo. Quem decide o
   que "avaliar antes" significa é `ordenarRegras`/`filaDeDestino` em
   `regra-fila.ts` (comentário de lá: "a primeira que casa vence"); este
   arquivo só grava o número, nunca reordena por conta própria. */

export interface CondicaoDeEdicao {
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
}

/** Só o que veio muda — igual a `PedidoDeEdicaoDeFila`. `condicoes`, quando vem, SUBSTITUI todas as anteriores. */
export interface PedidoDeEdicaoDeRegraFila {
  nome?: string;
  ordem?: number;
  combinador?: 'e' | 'ou';
  filaDestinoId?: string;
  condicoes?: readonly CondicaoDeEdicao[];
}

export interface RegraFilaGravada {
  id: string;
  nome: string;
  ordem: number;
  combinador: 'e' | 'ou';
  filaDestinoId: string;
  ativa: boolean;
  condicoes: CondicaoDeEdicao[];
}

/** A regra viva do tenant, com as condições — ou 404. */
async function regraFilaViva(tx: TransacaoPipe, tid: string, id: string): Promise<RegraFilaGravada> {
  const [atual] = await tx
    .select({
      id: regraFila.id,
      nome: regraFila.nome,
      ordem: regraFila.ordem,
      combinador: regraFila.combinador,
      filaDestinoId: regraFila.filaDestinoId,
      ativa: regraFila.ativa,
    })
    .from(regraFila)
    .where(and(eq(regraFila.tenantId, tid), eq(regraFila.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('regra');

  const condicoes = await tx
    .select({ campo: regraFilaCondicao.campo, operador: regraFilaCondicao.operador, valor: regraFilaCondicao.valor })
    .from(regraFilaCondicao)
    .where(eq(regraFilaCondicao.regraId, id))
    .orderBy(asc(regraFilaCondicao.campo), asc(regraFilaCondicao.id));

  return {
    ...atual,
    combinador: atual.combinador as 'e' | 'ou',
    condicoes: condicoes.map((c) => ({
      campo: c.campo,
      operador: c.operador as OperadorDeRegra,
      valor: c.valor ?? '',
    })),
  };
}

function condicoesConferidas(bruto: readonly CondicaoDeEdicao[]): CondicaoDeEdicao[] {
  if (bruto.length === 0) {
    throw ErroPipe.requisicao(
      'sem_condicao',
      'Uma regra sem condição nunca casa. Preencha pelo menos uma.',
    );
  }
  return bruto.map((c) => {
    const campo = String(c.campo ?? '').trim();
    const valor = String(c.valor ?? '').trim();
    if (!campoValido(campo)) {
      throw ErroPipe.requisicao(
        'campo_invalido',
        `"${campo}" não é um campo válido. Use um dos fixos ou um campo extra como contato.atributos.plano.`,
      );
    }
    if (!operadorValido(c.operador)) throw ErroPipe.requisicao('operador_invalido', 'Operador inválido.');
    if (!valor) throw ErroPipe.requisicao('valor_obrigatorio', `A condição sobre "${campo}" ficou sem valor.`);
    return { campo, operador: c.operador, valor };
  });
}

/** `update`: renomear, trocar fila/combinador/ordem e substituir as condições são o mesmo gesto. */
export async function editarRegraFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeRegraFila,
): Promise<RegraFilaGravada> {
  const atual = await regraFilaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  const antes = { nome: atual.nome, ordem: atual.ordem, combinador: atual.combinador, filaDestinoId: atual.filaDestinoId };
  const depois = { ...antes };

  if (pedido.nome !== undefined) {
    const nome = String(pedido.nome).trim();
    if (!nome) throw ErroPipe.requisicao('nome_obrigatorio', 'Informe o nome da regra.');
    depois.nome = nome;
  }
  if (pedido.ordem !== undefined) depois.ordem = ordemConferida(pedido.ordem);
  if (pedido.combinador !== undefined) {
    if (pedido.combinador !== 'e' && pedido.combinador !== 'ou') {
      throw ErroPipe.requisicao('combinador_invalido', 'Combinador inválido.');
    }
    depois.combinador = pedido.combinador;
  }
  if (pedido.filaDestinoId !== undefined) {
    const [destino] = await tx
      .select({ id: fila.id })
      .from(fila)
      .where(and(eq(fila.tenantId, tid), eq(fila.id, pedido.filaDestinoId)))
      .limit(1);
    if (!destino) throw ErroPipe.requisicao('fila_nao_encontrada', 'Fila de destino não encontrada.');
    depois.filaDestinoId = pedido.filaDestinoId;
  }

  if (depois.nome !== antes.nome) {
    const [conflito] = await tx
      .select({ id: regraFila.id })
      .from(regraFila)
      .where(and(eq(regraFila.tenantId, tid), eq(regraFila.nome, depois.nome), ne(regraFila.id, id)))
      .limit(1);
    if (conflito) throw ErroPipe.conflito('nome_em_uso', `Já existe uma regra chamada "${depois.nome}".`);
  }

  const mudanca = diferenca(antes, depois);
  const condicoesNovas = pedido.condicoes !== undefined ? condicoesConferidas(pedido.condicoes) : undefined;
  if (Object.keys(mudanca.depois).length === 0 && condicoesNovas === undefined) return atual;

  if (Object.keys(mudanca.depois).length > 0) {
    await tx
      .update(regraFila)
      .set({
        nome: depois.nome,
        ordem: depois.ordem,
        combinador: depois.combinador,
        filaDestinoId: depois.filaDestinoId,
        atualizadoEm: new Date(),
      })
      .where(and(eq(regraFila.tenantId, tid), eq(regraFila.id, id)));
  }

  if (condicoesNovas !== undefined) {
    await tx.delete(regraFilaCondicao).where(eq(regraFilaCondicao.regraId, id));
    await tx
      .insert(regraFilaCondicao)
      .values(condicoesNovas.map((c) => ({ tenantId: tid, regraId: id, ...c })));
  }

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'regra_fila',
    objetoId: id,
    antes: { ...mudanca.antes, ...(condicoesNovas !== undefined ? { condicoes: atual.condicoes.length } : {}) },
    depois: { ...mudanca.depois, ...(condicoesNovas !== undefined ? { condicoes: condicoesNovas.length } : {}) },
  });

  return regraFilaViva(tx, tid, id);
}

/** `destroy`: `regra_fila_condicao.regra_id` é `ON DELETE CASCADE` — excluir a regra leva as condições junto. */
export async function excluirRegraFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await regraFilaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  await tx.delete(regraFila).where(and(eq(regraFila.tenantId, tid), eq(regraFila.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'regra_fila',
    objetoId: id,
    antes: { nome: atual.nome, ativa: atual.ativa },
  });
}

// ------------------------------------------------------- gestão de atendentes

export interface AtendenteCadastrado {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** `null` quando a pessoa nunca conectou: não é "offline", é "nunca esteve". */
  estado: string | null;
  filas: string[];
  /**
   * Teto de conversas simultâneas. `null` quando a pessoa não está em fila
   * nenhuma — aí não há teto porque não há de onde receber.
   */
  limiteSimultaneo: number | null;
}

/**
 * Gestão de atendentes: quem atende, por onde, e quantas conversas aguenta ao
 * mesmo tempo.
 *
 * As quatro colunas são as deles (`blip-gestao-medidas.md` §8.3): atendente,
 * e-mail, filas e tickets simultâneos. As duas nossas — status agora e situação
 * — vinham da tela de Operação, que esta substitui.
 *
 * **O teto é o MAIOR entre as filas da pessoa, e não a soma.** É a mesma regra
 * que o Monitoramento já usa para a coluna "Limite"
 * (`monitoramento.ts`, `limitePorAtendente`), e a razão é que o teto é do
 * ATENDENTE: quem está em duas filas não pode atender o dobro por estar em
 * duas. Somar transformaria entrar numa fila a mais em ganhar capacidade.
 *
 * Divergência registrada: na plataforma deles o teto é um número por pessoa,
 * com um padrão global e um override individual. Aqui ele nasce da fila
 * (`fila.capacidade_padrao`) com override por participação
 * (`fila_atendente.capacidade_override`), então uma pessoa em duas filas de
 * capacidades diferentes tem dois números, e este é o que vale.
 */
export async function carregarAtendentes(tx: TransacaoPipe): Promise<AtendenteCadastrado[]> {
  return consultar(tx, async (tx) => {
    const pessoas = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        ativo: usuario.ativo,
        estado: statusAtendente.estado,
      })
      .from(usuario)
      .leftJoin(statusAtendente, eq(statusAtendente.usuarioId, usuario.id))
      .orderBy(asc(usuario.nome));

    const membros = await tx
      .select({
        usuarioId: filaAtendente.usuarioId,
        filaNome: fila.nome,
        override: filaAtendente.capacidadeOverride,
        padrao: fila.capacidadePadrao,
      })
      .from(filaAtendente)
      .innerJoin(fila, eq(fila.id, filaAtendente.filaId))
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const porPessoa = new Map<string, { filas: string[]; limite: number }>();
    for (const m of membros) {
      const atual = porPessoa.get(m.usuarioId) ?? { filas: [], limite: 0 };
      atual.filas.push(m.filaNome);
      atual.limite = Math.max(atual.limite, m.override ?? m.padrao);
      porPessoa.set(m.usuarioId, atual);
    }

    return pessoas.map((p) => {
      const dela = porPessoa.get(p.id);
      return {
        ...p,
        filas: dela?.filas ?? [],
        limiteSimultaneo: dela ? dela.limite : null,
      };
    });
  });
}

/* ===================================================== escrita — filas
   Item 1 da tarefa de cadastros do Atendimento: criar, renomear, ativar/
   desativar, excluir (com as duas recusas que a tela precisa entender) e
   vincular/desvincular atendente. Ao contrário das `acoes/*` (Resultado em
   200, para o `useActionState` de formulário), estas usam o padrão REST de
   `ciclo-de-vida-do-fluxo.ts`: `ErroPipe` com status de verdade, porque são
   gestos com efeito de segurança (permissão, tenant, id) e não só validação
   de formulário. */

export interface PedidoDeFila {
  nome: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao: number;
  ordem?: number;
  ativa?: boolean;
}

/** Só o que veio muda — igual a `PedidoDeEdicao` de `ciclo-de-vida-do-fluxo.ts`. */
export interface PedidoDeEdicaoDeFila {
  nome?: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao?: number;
  ordem?: number;
  ativa?: boolean;
}

export interface FilaGravada {
  id: string;
  nome: string;
  cor: string | null;
  horarioId: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
}

function nomeDeFilaConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw ErroPipe.requisicao('nome_obrigatorio', 'Informe o nome da fila.');
  return nome;
}

function corDeFilaConferida(bruto: unknown): string | null {
  if (bruto === undefined || bruto === null) return null;
  const cor = String(bruto).trim();
  if (!cor) return null;
  if (!corValida(cor)) throw ErroPipe.requisicao('cor_invalida', 'Cor fora da paleta.');
  return cor;
}

/** Mesmo teto de `acoes/atendentes.ts::salvarFila` — reaproveitado também para o override do atendente. */
function capacidadeConferida(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 200) {
    throw ErroPipe.requisicao(
      'capacidade_invalida',
      'A capacidade padrão é um inteiro de 1 a 200 — é quantas conversas simultâneas cada atendente da fila aguenta.',
    );
  }
  return n;
}

function ordemConferida(bruto: unknown): number {
  const n = Number(bruto ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 999) {
    throw ErroPipe.requisicao('ordem_invalida', 'A ordem é um inteiro de 0 a 999.');
  }
  return n;
}

async function horarioExiste(tx: TransacaoPipe, tid: string, horarioId: string): Promise<boolean> {
  const [achado] = await tx
    .select({ id: horarioAtendimento.id })
    .from(horarioAtendimento)
    .where(and(eq(horarioAtendimento.tenantId, tid), eq(horarioAtendimento.id, horarioId)))
    .limit(1);
  return achado !== undefined;
}

async function nomeDeFilaEmUso(
  tx: TransacaoPipe,
  tid: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: fila.id })
    .from(fila)
    .where(
      and(eq(fila.tenantId, tid), eq(fila.nome, nome), excetoId ? ne(fila.id, excetoId) : undefined),
    )
    .limit(1);
  return conflito !== undefined;
}

function conflitoDeNomeDeFila(nome: string): ErroPipe {
  return ErroPipe.conflito('nome_em_uso', `Já existe uma fila chamada "${nome}".`);
}

/** A fila viva do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function filaViva(tx: TransacaoPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({
      id: fila.id,
      nome: fila.nome,
      cor: fila.cor,
      horarioId: fila.horarioId,
      capacidadePadrao: fila.capacidadePadrao,
      ordem: fila.ordem,
      ativa: fila.ativa,
    })
    .from(fila)
    .where(and(eq(fila.tenantId, tid), eq(fila.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fila');
  return atual;
}

export async function criarFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeFila,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, FILA_GERENCIAR);

  const nome = nomeDeFilaConferido(pedido.nome);
  const cor = corDeFilaConferida(pedido.cor);
  const capacidadePadrao = capacidadeConferida(pedido.capacidadePadrao);
  const ordem = ordemConferida(pedido.ordem);
  const horarioId = pedido.horarioId ? String(pedido.horarioId) : null;
  const ativa = pedido.ativa ?? true;

  if (await nomeDeFilaEmUso(tx, tid, nome)) throw conflitoDeNomeDeFila(nome);
  if (horarioId && !(await horarioExiste(tx, tid, horarioId))) {
    throw ErroPipe.requisicao('horario_nao_encontrado', 'Horário de atendimento não encontrado.');
  }

  const [criada] = await tx
    .insert(fila)
    .values({ tenantId: tid, nome, cor, horarioId, capacidadePadrao, ordem, ativa })
    .returning({ id: fila.id });
  if (!criada) throw ErroPipe.requisicao('fila_nao_criada', 'Não consegui gravar a fila.');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'fila',
    objetoId: criada.id,
    depois: { nome, cor, horarioId, capacidadePadrao, ordem, ativa },
  });
  return { id: criada.id };
}

/** `update`: renomear, trocar cor/horário/capacidade/ordem e ativar/desativar são o mesmo gesto. */
export async function editarFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeFila,
): Promise<FilaGravada> {
  const atual = await filaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, FILA_GERENCIAR);

  // `antes`/`depois` de propósito SEM anotação de tipo: literal inferido carrega
  // índice implícito e é o que deixa `diferenca` (que pede `Record<string,
  // unknown>`) aceitar o objeto — a mesma escolha de `editarFluxo`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.nome !== undefined) depois.nome = nomeDeFilaConferido(pedido.nome);
  if (pedido.cor !== undefined) depois.cor = corDeFilaConferida(pedido.cor);
  if (pedido.capacidadePadrao !== undefined) {
    depois.capacidadePadrao = capacidadeConferida(pedido.capacidadePadrao);
  }
  if (pedido.ordem !== undefined) depois.ordem = ordemConferida(pedido.ordem);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;
  if (pedido.horarioId !== undefined) {
    const horarioId = pedido.horarioId ? String(pedido.horarioId) : null;
    if (horarioId && !(await horarioExiste(tx, tid, horarioId))) {
      throw ErroPipe.requisicao('horario_nao_encontrado', 'Horário de atendimento não encontrado.');
    }
    depois.horarioId = horarioId;
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.nome !== antes.nome && (await nomeDeFilaEmUso(tx, tid, depois.nome, id))) {
    throw conflitoDeNomeDeFila(depois.nome);
  }

  const [gravada] = await tx
    .update(fila)
    .set({
      nome: depois.nome,
      cor: depois.cor,
      horarioId: depois.horarioId,
      capacidadePadrao: depois.capacidadePadrao,
      ordem: depois.ordem,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(fila.tenantId, tid), eq(fila.id, id)))
    .returning({
      id: fila.id,
      nome: fila.nome,
      cor: fila.cor,
      horarioId: fila.horarioId,
      capacidadePadrao: fila.capacidadePadrao,
      ordem: fila.ordem,
      ativa: fila.ativa,
    });
  if (!gravada) throw ErroPipe.naoEncontrado('fila');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fila',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravada;
}

/**
 * `destroy`: excluir de verdade — `fila` não carrega histórico próprio (quem
 * carrega é `conversa`/`evento_atendimento`, por isso as duas recusas
 * abaixo). Diferente do fluxo, aqui não há razão para "arquivar": não existe
 * FK que impeça o `DELETE` de uma fila livre de uso.
 */
export async function excluirFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await filaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, FILA_GERENCIAR);

  const [comConversa] = await tx
    .select({ id: conversa.id })
    .from(conversa)
    .where(and(eq(conversa.filaId, id), isNull(conversa.encerradaEm)))
    .limit(1);
  if (comConversa) {
    throw ErroPipe.conflito(
      'fila_com_conversa_aberta',
      'Esta fila tem conversa em aberto e não pode ser excluída. Transfira ou encerre as conversas primeiro.',
    );
  }

  const [comoPadrao] = await tx
    .select({ nome: inbox.nome })
    .from(inbox)
    .where(and(eq(inbox.tenantId, tid), eq(inbox.filaPadraoId, id)))
    .limit(1);
  if (comoPadrao) {
    throw ErroPipe.conflito(
      'fila_padrao_de_inbox',
      `Esta fila é a fila padrão da caixa de entrada "${comoPadrao.nome}" e não pode ser excluída.`,
    );
  }

  // `regra_fila.fila_destino_id` é `ON DELETE CASCADE`: sem esta recusa, excluir a fila
  // apagaria a regra de entrada em silêncio, sem quem a cadastrou ter pedido isso.
  const [comoDestinoDeRegra] = await tx
    .select({ nome: regraFila.nome })
    .from(regraFila)
    .where(eq(regraFila.filaDestinoId, id))
    .limit(1);
  if (comoDestinoDeRegra) {
    throw ErroPipe.conflito(
      'fila_usada_em_regra',
      `A regra de entrada "${comoDestinoDeRegra.nome}" manda conversa para esta fila. Edite ou exclua a regra antes.`,
    );
  }

  await tx.delete(fila).where(and(eq(fila.tenantId, tid), eq(fila.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'fila',
    objetoId: id,
    antes: { nome: atual.nome, ativa: atual.ativa },
  });
}

/** Vincular: cria a participação, ou troca o `capacidadeOverride` de quem já está na fila. */
export async function vincularAtendenteNaFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  filaId: string,
  atendenteId: string,
  capacidadeOverride?: number | null,
): Promise<void> {
  await filaViva(tx, tid, filaId);
  await exigirPermissao(tx, usuarioId, FILA_GERENCIAR);

  const [pessoa] = await tx
    .select({ id: usuario.id })
    .from(usuario)
    .where(and(eq(usuario.tenantId, tid), eq(usuario.id, atendenteId)))
    .limit(1);
  if (!pessoa) throw ErroPipe.naoEncontrado('atendente');

  const override =
    capacidadeOverride === undefined || capacidadeOverride === null
      ? null
      : capacidadeConferida(capacidadeOverride);

  await tx
    .insert(filaAtendente)
    .values({ tenantId: tid, filaId, usuarioId: atendenteId, capacidadeOverride: override })
    .onConflictDoUpdate({
      target: [filaAtendente.filaId, filaAtendente.usuarioId],
      set: { capacidadeOverride: override },
    });

  // `Acao` de `@pipe/db` é fechado ('criou'/'alterou'/'excluiu'/'ativou'/'desativou');
  // vincular/desvincular é uma alteração da COMPOSIÇÃO da fila, não um gesto à parte.
  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fila_atendente',
    objetoId: filaId,
    depois: { atendenteId, capacidadeOverride: override, vinculo: 'criado' },
  });
}

export async function desvincularAtendenteDaFila(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  filaId: string,
  atendenteId: string,
): Promise<void> {
  await filaViva(tx, tid, filaId);
  await exigirPermissao(tx, usuarioId, FILA_GERENCIAR);

  const apagados = await tx
    .delete(filaAtendente)
    .where(
      and(
        eq(filaAtendente.tenantId, tid),
        eq(filaAtendente.filaId, filaId),
        eq(filaAtendente.usuarioId, atendenteId),
      ),
    )
    .returning({ usuarioId: filaAtendente.usuarioId });
  if (apagados.length === 0) throw ErroPipe.naoEncontrado('vínculo de atendente com a fila');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fila_atendente',
    objetoId: filaId,
    antes: { atendenteId, vinculo: 'criado' },
    depois: { atendenteId, vinculo: 'removido' },
  });
}

/* =================================================== escrita — motivo de pausa
   Item 3: criar, editar, ativar/desativar e excluir. `motivo_pausa.id` é
   `ON DELETE SET NULL` em `pausa.motivo_id` — a mesma regra que já faz
   `carregarPausas` separar as pausas "sem motivo"; excluir um motivo em uso
   não corrompe pausa nenhuma, só historia ela como órfã, então não há recusa
   de "está em uso" aqui como há em fila. */

/** `maxlength 30` do `<input>` de "Nome da pausa" — `FICHA-personalizedbreaks.md` §3. */
export const NOME_DA_PAUSA_MAX = 30;

export interface PedidoDeMotivoPausa {
  nome: string;
  duracaoSugeridaMin?: number | null;
  contaComoProdutivo?: boolean;
  ativo?: boolean;
}

export interface PedidoDeEdicaoDeMotivoPausa {
  nome?: string;
  duracaoSugeridaMin?: number | null;
  contaComoProdutivo?: boolean;
  ativo?: boolean;
}

export interface MotivoPausaGravado {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
}

function nomeDeMotivoConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw ErroPipe.requisicao('nome_obrigatorio', 'Informe o nome do motivo.');
  if (nome.length > NOME_DA_PAUSA_MAX) {
    throw ErroPipe.requisicao(
      'nome_tamanho',
      `O nome da pausa tem até ${NOME_DA_PAUSA_MAX} caracteres.`,
    );
  }
  return nome;
}

/** `null` é "sem sugestão"; `undefined` (edição) é "não mexa" — conferidos por quem chama. */
function duracaoSugeridaConferida(bruto: unknown): number | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 480) {
    throw ErroPipe.requisicao(
      'duracao_invalida',
      'A duração sugerida é um inteiro de 1 a 480 minutos.',
    );
  }
  return n;
}

async function nomeDeMotivoEmUso(
  tx: TransacaoPipe,
  tid: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: motivoPausa.id })
    .from(motivoPausa)
    .where(
      and(
        eq(motivoPausa.tenantId, tid),
        eq(motivoPausa.nome, nome),
        excetoId ? ne(motivoPausa.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito !== undefined;
}

async function motivoVivo(tx: TransacaoPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({
      id: motivoPausa.id,
      nome: motivoPausa.nome,
      duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
      contaComoProdutivo: motivoPausa.contaComoProdutivo,
      ativo: motivoPausa.ativo,
    })
    .from(motivoPausa)
    .where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('motivo de pausa');
  return atual;
}

export async function criarMotivoPausa(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeMotivoPausa,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, PAUSA_GERENCIAR);

  const nome = nomeDeMotivoConferido(pedido.nome);
  const duracaoSugeridaMin = duracaoSugeridaConferida(pedido.duracaoSugeridaMin);
  const contaComoProdutivo = pedido.contaComoProdutivo ?? false;
  const ativo = pedido.ativo ?? true;

  if (await nomeDeMotivoEmUso(tx, tid, nome)) {
    throw ErroPipe.conflito('nome_em_uso', `Já existe um motivo chamado "${nome}".`);
  }

  const [criado] = await tx
    .insert(motivoPausa)
    .values({ tenantId: tid, nome, duracaoSugeridaMin, contaComoProdutivo, ativo })
    .returning({ id: motivoPausa.id });
  if (!criado) throw ErroPipe.requisicao('motivo_nao_criado', 'Não consegui gravar o motivo.');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'motivo_pausa',
    objetoId: criado.id,
    depois: { nome, duracaoSugeridaMin, contaComoProdutivo, ativo },
  });
  return { id: criado.id };
}

export async function editarMotivoPausa(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeMotivoPausa,
): Promise<MotivoPausaGravado> {
  const atual = await motivoVivo(tx, tid, id);
  await exigirPermissao(tx, usuarioId, PAUSA_GERENCIAR);

  // Sem anotação de tipo — ver o comentário equivalente em `editarFila`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.nome !== undefined) depois.nome = nomeDeMotivoConferido(pedido.nome);
  if (pedido.duracaoSugeridaMin !== undefined) {
    depois.duracaoSugeridaMin = duracaoSugeridaConferida(pedido.duracaoSugeridaMin);
  }
  if (pedido.contaComoProdutivo !== undefined) depois.contaComoProdutivo = pedido.contaComoProdutivo;
  if (pedido.ativo !== undefined) depois.ativo = pedido.ativo;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.nome !== antes.nome && (await nomeDeMotivoEmUso(tx, tid, depois.nome, id))) {
    throw ErroPipe.conflito('nome_em_uso', `Já existe um motivo chamado "${depois.nome}".`);
  }

  const [gravado] = await tx
    .update(motivoPausa)
    .set({
      nome: depois.nome,
      duracaoSugeridaMin: depois.duracaoSugeridaMin,
      contaComoProdutivo: depois.contaComoProdutivo,
      ativo: depois.ativo,
    })
    .where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)))
    .returning({
      id: motivoPausa.id,
      nome: motivoPausa.nome,
      duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
      contaComoProdutivo: motivoPausa.contaComoProdutivo,
      ativo: motivoPausa.ativo,
    });
  if (!gravado) throw ErroPipe.naoEncontrado('motivo de pausa');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'motivo_pausa',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravado;
}

export async function excluirMotivoPausa(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await motivoVivo(tx, tid, id);
  await exigirPermissao(tx, usuarioId, PAUSA_GERENCIAR);

  await tx.delete(motivoPausa).where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'motivo_pausa',
    objetoId: id,
    antes: { nome: atual.nome, ativo: atual.ativo },
  });
}
