import { and, asc, count, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  dentroDoExpediente,
  duracaoTotalSeg,
  intervalosUteis,
  proximaAbertura,
  type HorarioAtendimento as ExpedienteDoCore,
} from '@pipe/core';
import {
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
import { registrarAuditoria } from '@pipe/db';
import { ATOR_DA_GESTAO, consultar, tenantId } from './banco';
import { relogio } from './formato';
import type { OperadorDeRegra, RegraDeFila } from './regra-fila';

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

export async function carregarFilas(): Promise<{
  filas: FilaCadastrada[];
  horarios: HorarioParaEscolher[];
}> {
  return consultar(async (tx) => {
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
export async function carregarPausas(dias = 30): Promise<UsoDePausas> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  return consultar(async (tx) => {
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
export async function carregarHorarios(): Promise<Horarios> {
  const agora = new Date();

  return consultar(async (tx) => {
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

export async function carregarRegrasDeFila(): Promise<{
  regras: RegraDeFilaCadastrada[];
  filas: FilaParaEscolher[];
  /** Nomes das caixas de entrada e a fila padrão delas: o destino de quem não casa nenhuma regra. */
  padroes: { inbox: string; fila: string | null }[];
}> {
  return consultar(async (tx) => {
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

export async function gravarRegraFila(entrada: NovaRegraDeFila): Promise<Gravacao> {
  const tid = await tenantId();

  return consultar(async (tx) => {
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
      ator: ATOR_DA_GESTAO,
      acao: 'criou',
      objetoTipo: 'regra_fila',
      objetoId: criada.id,
      depois: { ...entrada, ativa: true, condicoes: entrada.condicoes.length },
    });

    return { ok: true };
  });
}

/** O interruptor do cartão-linha: liga e desliga a regra na própria lista. */
export async function alternarAtivaDaRegraFila(id: string): Promise<Gravacao> {
  const tid = await tenantId();

  return consultar(async (tx) => {
    const [atual] = await tx
      .select({ nome: regraFila.nome, ativa: regraFila.ativa })
      .from(regraFila)
      .where(and(eq(regraFila.tenantId, tid), eq(regraFila.id, id)))
      .limit(1);
    if (!atual) return { ok: false, erro: 'Regra não encontrada.' };

    await tx.update(regraFila).set({ ativa: !atual.ativa }).where(eq(regraFila.id, id));

    await registrarAuditoria(tx, tid, {
      ator: ATOR_DA_GESTAO,
      acao: atual.ativa ? 'desativou' : 'ativou',
      objetoTipo: 'regra_fila',
      objetoId: id,
      antes: { nome: atual.nome, ativa: atual.ativa },
      depois: { nome: atual.nome, ativa: !atual.ativa },
    });

    return { ok: true };
  });
}
