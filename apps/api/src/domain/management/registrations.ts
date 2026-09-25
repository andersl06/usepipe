import { and, asc, count, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  dentroDoExpediente,
  durationTotalSeg,
  intervalosUteis,
  proximaAbertura,
  type HourAttendance as ExpedienteDoCore,
} from '@pipe/core';
import {
  conversation,
  queue,
  queueAgent,
  scheduleAttendance,
  scheduleException,
  horarioFaixa,
  inbox,
  motivoPausa,
  pausa,
  ruleQueue,
  ruleQueueCondition,
  statusAgent,
  user,
} from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';
import { corValida } from './colors-of-queue.js';
import { minutosDoRelogio, relogio, relogioValido } from './format.js';
import { campoValido, operadorValido, type OperadorDeRegra, type RuleOfQueue } from './rule-queue.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/** Do catálogo (`packages/db/src/semente.ts`): "Criar, editar e desativar fila". */
export const QUEUE_MANAGE = 'fila.gerenciar';
/** "Gerenciar regras de fila, prioridade e SLA" — as três também moram aqui. */
export const RULE_MANAGE = 'regra.gerenciar';
/** "Gerenciar horário de atendimento e feriado". */
export const SCHEDULE_MANAGE = 'horario.gerenciar';
/** Novo — migração 0030: nenhuma permissão do catálogo cobria motivo de pausa. */
export const PAUSE_MANAGE = 'pausa.gerenciar';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

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

export interface AgentOfQueue {
  id: string;
  name: string;
  state: string | null;
  /** `fila_atendente.capacidade_override` ou a capacidade padrão da fila. */
  capacity: number;
  /** O atendente tem limite próprio, diferente do padrão da fila. */
  temOverride: boolean;
}

export interface QueueRegistered {
  id: string;
  name: string;
  color: string | null;
  capacityDefault: number;
  order: number;
  ativa: boolean;
  scheduleId: string | null;
  horarioNome: string | null;
  agents: AgentOfQueue[];
}

export interface HorarioParaEscolher {
  id: string;
  name: string;
}

export async function loadQueues(tx: TransactionPipe): Promise<{
  queues: QueueRegistered[];
  horarios: HorarioParaEscolher[];
}> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: queue.id,
        name: queue.nome,
        color: queue.cor,
        capacityDefault: queue.capacityDefault,
        order: queue.order,
        ativa: queue.ativa,
        scheduleId: queue.horarioId,
        horarioNome: scheduleAttendance.nome,
      })
      .from(queue)
      .leftJoin(scheduleAttendance, eq(scheduleAttendance.id, queue.horarioId))
      .orderBy(asc(queue.order), asc(queue.nome));

    const membros = await tx
      .select({
        filaId: queueAgent.queueId,
        usuarioId: queueAgent.userId,
        nome: user.nome,
        override: queueAgent.capacityOverride,
        estado: statusAgent.estado,
      })
      .from(queueAgent)
      .innerJoin(user, eq(user.id, queueAgent.userId))
      .leftJoin(statusAgent, eq(statusAgent.usuarioId, queueAgent.userId))
      .orderBy(asc(user.nome));

    const horarios = await tx
      .select({ id: scheduleAttendance.id, name: scheduleAttendance.nome })
      .from(scheduleAttendance)
      .orderBy(asc(scheduleAttendance.nome));

    const byQueue = new Map<string, AgentOfQueue[]>();
    for (const m of membros) {
      const padrao = linhas.find((l) => l.id === m.filaId)?.capacityDefault ?? 0;
      const agent: AgentOfQueue = {
        id: m.usuarioId,
        name: m.nome,
        state: m.estado,
        capacity: m.override ?? padrao,
        temOverride: m.override !== null,
      };
      const atual = byQueue.get(m.filaId);
      if (atual) atual.push(agent);
      else byQueue.set(m.filaId, [agent]);
    }

    return {
      queues: linhas.map((l) => ({ ...l, agents: byQueue.get(l.id) ?? [] })),
      horarios,
    };
  });
}

// ------------------------------------------------------------------ pausas

export interface MotivoDePausa {
  id: string;
  name: string;
  durationSuggestedMin: number | null;
  countsAsProductive: boolean;
  active: boolean;
  /** Pausas encerradas no período. */
  pauses: number;
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
export async function carregarPausas(tx: TransactionPipe, dias = 30): Promise<UsoDePausas> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  return consultar(tx, async (tx) => {
    const motivos = await tx
      .select({
        id: motivoPausa.id,
        name: motivoPausa.nome,
        durationSuggestedMin: motivoPausa.durationSuggestedMin,
        countsAsProductive: motivoPausa.accountAsProductive,
        active: motivoPausa.ativo,
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

    const byReason = new Map(uso.map((u) => [u.motivoId, u]));
    const orfas = byReason.get(null);

    return {
      motivos: motivos.map((m) => {
        const u = byReason.get(m.id);
        return {
          ...m,
          pauses: u?.pausas ?? 0,
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
  dayWeek: number;
  start: string;
  end: string;
}

export interface ExceptionOfSchedule {
  id: string;
  data: string;
  closed: boolean;
  start: string | null;
  end: string | null;
  reason: string | null;
}

export interface HorarioCadastrado {
  id: string;
  name: string;
  fuso: string;
  faixas: FaixaDoHorario[];
  exceptions: ExceptionOfSchedule[];
  /** Nomes das filas que apontam para este horário. Vazio = horário sem uso. */
  queues: string[];
  abertoAgora: boolean;
  /** `null` = nenhuma abertura no horizonte do core — horário sem faixa nenhuma. */
  proximaAberturaEm: Date | null;
  /** Expediente dos próximos sete dias, com feriado já descontado. */
  seteDiasSeg: number;
}

export interface Horarios {
  horarios: HorarioCadastrado[];
  /** Filas ativas sem horário: nelas o relógio do SLA corre 24×7. */
  queuesWithoutSchedule: string[];
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
export async function carregarHorarios(tx: TransactionPipe): Promise<Horarios> {
  const agora = new Date();

  return consultar(tx, async (tx) => {
    const cabecas = await tx
      .select({
        id: scheduleAttendance.id,
        name: scheduleAttendance.nome,
        fuso: scheduleAttendance.fuso,
      })
      .from(scheduleAttendance)
      .orderBy(asc(scheduleAttendance.nome));

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

    const exceptions = await tx
      .select({
        id: scheduleException.id,
        horarioId: scheduleException.horarioId,
        data: scheduleException.data,
        fechado: scheduleException.fechado,
        inicio: scheduleException.inicio,
        fim: scheduleException.fim,
        motivo: scheduleException.motivo,
      })
      .from(scheduleException)
      .orderBy(asc(scheduleException.data));

    const queues = await tx
      .select({ nome: queue.nome, horarioId: queue.horarioId, ativa: queue.ativa })
      .from(queue)
      .orderBy(asc(queue.order), asc(queue.nome));

    const horarios = cabecas.map((h) => {
      const minhasFaixasCore = faixas.filter((f) => f.horarioId === h.id);
      const myExceptionsCore = exceptions.filter((e) => e.horarioId === h.id);

      const minhasFaixas: FaixaDoHorario[] = minhasFaixasCore.map((f) => ({
        id: f.id,
        dayWeek: f.diaSemana,
        start: relogio(f.inicio),
        end: relogio(f.fim),
      }));

      const myExceptions: ExceptionOfSchedule[] = myExceptionsCore.map((e) => ({
        id: e.id,
        data: e.data,
        closed: e.fechado,
        start: e.inicio === null ? null : relogio(e.inicio),
        end: e.fim === null ? null : relogio(e.fim),
        reason: e.motivo,
      }));

      const paraOCore: ExpedienteDoCore = {
        fuso: h.fuso,
        faixas: minhasFaixasCore,
        exceptions: myExceptionsCore,
      };

      return {
        ...h,
        faixas: minhasFaixas,
        exceptions: myExceptions,
        queues: queues.filter((f) => f.horarioId === h.id).map((f) => f.nome),
        abertoAgora: dentroDoExpediente(agora, paraOCore),
        proximaAberturaEm: proximaAbertura(agora, paraOCore),
        seteDiasSeg: durationTotalSeg(
          intervalosUteis(agora, new Date(agora.getTime() + SETE_DIAS_MS), paraOCore),
        ),
      };
    });

    return {
      horarios,
      queuesWithoutSchedule: queues.filter((f) => f.ativa && f.horarioId === null).map((f) => f.nome),
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

export interface RequestOfEditOfRange {
  dayWeek?: number;
  start?: string;
  end?: string;
}

export interface FaixaGravada {
  id: string;
  scheduleId: string;
  dayWeek: number;
  start: string;
  end: string;
}

async function faixaViva(tx: TransactionPipe, tid: string, id: string) {
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
  if (!atual) throw PipeError.naoEncontrado('faixa de horário');
  return atual;
}

function diaSemanaConferido(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    throw PipeError.request('day_week_invalid', 'Dia da semana inválido.');
  }
  return n;
}

function relogioConferido(bruto: unknown, campo: string): string {
  const value = String(bruto ?? '').trim();
  if (!relogioValido(value)) {
    throw PipeError.request(`${campo}_invalido`, `"${campo}" inválido. Use HH:MM.`);
  }
  return value;
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
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfRange,
): Promise<FaixaGravada> {
  const atual = await faixaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, SCHEDULE_MANAGE);

  // `relogio()` normaliza o `HH:MM:SS` que o Postgres devolve para o `HH:MM`
  // que a API recebe e devolve — sem isso, reenviar o mesmo horário parecia
  // uma mudança (formato diferente, valor igual) e sujava a auditoria.
  const antes = { diaSemana: atual.diaSemana, inicio: relogio(atual.inicio), fim: relogio(atual.fim) };
  const depois = { ...antes };

  if (pedido.dayWeek !== undefined) depois.diaSemana = diaSemanaConferido(pedido.dayWeek);
  if (pedido.start !== undefined) depois.inicio = relogioConferido(pedido.start, 'início');
  if (pedido.end !== undefined) depois.fim = relogioConferido(pedido.end, 'fim');

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) {
    return { id: atual.id, scheduleId: atual.horarioId, dayWeek: antes.diaSemana, start: antes.inicio, end: antes.fim };
  }

  if (minutosDoRelogio(depois.fim) <= minutosDoRelogio(depois.inicio)) {
    throw PipeError.conflito(
      'end_before_of_start',
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
    throw PipeError.conflito('range_overlapping', 'Esta faixa se sobrepõe a outra já cadastrada neste dia.');
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

  return { id: atual.id, scheduleId: atual.horarioId, dayWeek: depois.diaSemana, start: depois.inicio, end: depois.fim };
}

export async function excluirFaixaHorario(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await faixaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, SCHEDULE_MANAGE);

  await tx.delete(horarioFaixa).where(and(eq(horarioFaixa.tenantId, tid), eq(horarioFaixa.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'horario_faixa',
    objetoId: id,
    antes: { horarioId: atual.horarioId, diaSemana: atual.diaSemana, inicio: atual.inicio, fim: atual.fim },
  });
}

export interface RequestOfEditOfException {
  data?: string;
  closed?: boolean;
  start?: string | null;
  end?: string | null;
  reason?: string | null;
}

export interface ExceptionWritten {
  id: string;
  scheduleId: string;
  data: string;
  closed: boolean;
  start: string | null;
  end: string | null;
  reason: string | null;
}

async function exceptionViva(tx: TransactionPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({
      id: scheduleException.id,
      horarioId: scheduleException.horarioId,
      data: scheduleException.data,
      fechado: scheduleException.fechado,
      inicio: scheduleException.inicio,
      fim: scheduleException.fim,
      motivo: scheduleException.motivo,
    })
    .from(scheduleException)
    .where(and(eq(scheduleException.tenantId, tid), eq(scheduleException.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('exceção de horário');
  return atual;
}

/**
 * `update`: mesmas regras da criação (`salvarExcecaoInterna`) — fechado não
 * tem horário próprio, aberto precisa dos dois, início < fim, e a data não
 * pode colidir com outra exceção do mesmo horário (`horario_excecao_uk`).
 */
export async function editarExceptionSchedule(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfException,
): Promise<ExceptionWritten> {
  const atual = await exceptionViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, SCHEDULE_MANAGE);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw PipeError.request('data_invalid', 'Informe a data.');
    depois.data = data;
  }
  if (pedido.closed !== undefined) depois.fechado = pedido.closed;
  if (pedido.start !== undefined) depois.inicio = pedido.start === null ? null : relogioConferido(pedido.start, 'início');
  if (pedido.end !== undefined) depois.fim = pedido.end === null ? null : relogioConferido(pedido.end, 'fim');
  if (pedido.reason !== undefined) depois.motivo = pedido.reason?.trim() || null;

  if (depois.fechado) {
    if (depois.inicio || depois.fim) {
      throw PipeError.request(
        'exception_closed_with_schedule',
        'Dia fechado não tem horário. Desmarque "fechado" para abrir em horário especial.',
      );
    }
  } else {
    if (!depois.inicio || !depois.fim) {
      throw PipeError.request(
        'exception_without_schedule',
        'Exceção que abre precisa de horário próprio; sem ele o dia cai no expediente normal e a exceção não faz nada.',
      );
    }
    if (minutosDoRelogio(depois.fim) <= minutosDoRelogio(depois.inicio)) {
      throw PipeError.conflito('end_before_of_start', 'O fim tem de ser depois do início.');
    }
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) {
    return {
      id: atual.id,
      scheduleId: atual.horarioId,
      data: antes.data,
      closed: antes.fechado,
      start: antes.inicio,
      end: antes.fim,
      reason: antes.motivo,
    };
  }

  if (depois.data !== antes.data) {
    const [conflito] = await tx
      .select({ id: scheduleException.id })
      .from(scheduleException)
      .where(and(eq(scheduleException.horarioId, atual.horarioId), eq(scheduleException.data, depois.data), ne(scheduleException.id, id)))
      .limit(1);
    if (conflito) {
      throw PipeError.conflito('data_in_use', `Já existe uma exceção em ${depois.data} para este horário.`);
    }
  }

  await tx
    .update(scheduleException)
    .set({
      data: depois.data,
      fechado: depois.fechado,
      inicio: depois.fechado ? null : depois.inicio,
      fim: depois.fechado ? null : depois.fim,
      motivo: depois.motivo,
    })
    .where(and(eq(scheduleException.tenantId, tid), eq(scheduleException.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'horario_excecao',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });

  return {
    id: atual.id,
    scheduleId: atual.horarioId,
    data: depois.data,
    closed: depois.fechado,
    start: depois.fechado ? null : depois.inicio,
    end: depois.fechado ? null : depois.fim,
    reason: depois.motivo,
  };
}

export async function deleteExceptionSchedule(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await exceptionViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, SCHEDULE_MANAGE);

  await tx.delete(scheduleException).where(and(eq(scheduleException.tenantId, tid), eq(scheduleException.id, id)));

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
export interface QueueForEscolher {
  id: string;
  name: string;
  ativa: boolean;
}

/** A regra do banco carrega uma coisa a mais que o motor: se a fila de destino está de pé. */
export interface RuleOfQueueRegistered extends RuleOfQueue {
  queueDestinationActive: boolean;
}

export async function loadRulesOfQueue(tx: TransactionPipe): Promise<{
  regras: RuleOfQueueRegistered[];
  queues: QueueForEscolher[];
  /** Nomes das caixas de entrada e a fila padrão delas: o destino de quem não casa nenhuma regra. */
  defaults: { inbox: string; queue: string | null }[];
}> {
  return consultar(tx, async (tx) => {
    const cabecas = await tx
      .select({
        id: ruleQueue.id,
        name: ruleQueue.nome,
        order: ruleQueue.order,
        combiner: ruleQueue.combinador,
        queueDestinationId: ruleQueue.queueDestinationId,
        queueDestinationName: queue.nome,
        queueDestinationActive: queue.ativa,
        active: ruleQueue.active,
      })
      .from(ruleQueue)
      .innerJoin(queue, eq(queue.id, ruleQueue.queueDestinationId))
      .orderBy(asc(ruleQueue.order), asc(ruleQueue.id));

    const conditions = await tx
      .select({
        regraId: ruleQueueCondition.regraId,
        campo: ruleQueueCondition.campo,
        operador: ruleQueueCondition.operador,
        valor: ruleQueueCondition.value,
      })
      .from(ruleQueueCondition)
      .orderBy(asc(ruleQueueCondition.campo), asc(ruleQueueCondition.id));

    const filas = await tx
      .select({ id: queue.id, name: queue.nome, ativa: queue.ativa })
      .from(queue)
      .orderBy(asc(queue.order), asc(queue.nome));

    const caixas = await tx
      .select({ inbox: inbox.nome, queue: queue.nome })
      .from(inbox)
      .leftJoin(queue, eq(queue.id, inbox.queueDefaultId))
      .orderBy(asc(inbox.nome));

    return {
      regras: cabecas.map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        combiner: c.combiner as 'e' | 'ou',
        queueDestinationId: c.queueDestinationId,
        queueDestinationName: c.queueDestinationName,
        queueDestinationActive: c.queueDestinationActive,
        active: c.active,
        conditions: conditions
          .filter((cond) => cond.regraId === c.id)
          .map((cond) => ({
            field: cond.campo,
            operator: cond.operador as OperadorDeRegra,
            value: cond.valor ?? '',
          })),
      })),
      queues: filas,
      defaults: caixas,
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
export interface NewRuleOfQueue {
  name: string;
  order: number;
  combiner: 'e' | 'ou';
  queueDestinationId: string;
  conditions: readonly { field: string; operator: OperadorDeRegra; value: string }[];
}

export type Recording = { ok: true } | { ok: false; error: string };

export async function writeRuleQueue(
  tx: TransactionPipe,
  tid: string,
  quemGrava: Ator,
  inbound: NewRuleOfQueue,
): Promise<Recording> {
  if (quemGrava.type === 'usuario' && quemGrava.id) await exigirPermission(tx, quemGrava.id, RULE_MANAGE);
  return consultar(tx, async (tx) => {
    // `regra_fila` não tem índice único de nome; a unicidade é regra desta
    // tela. Duas "Cobrança" fazem o gestor editar a que não está valendo.
    const [conflito] = await tx
      .select({ id: ruleQueue.id })
      .from(ruleQueue)
      .where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.nome, inbound.name)))
      .limit(1);
    if (conflito) return { ok: false, error: `Já existe uma regra chamada "${inbound.name}".` };

    const [destino] = await tx
      .select({ id: queue.id })
      .from(queue)
      .where(and(eq(queue.tenantId, tid), eq(queue.id, inbound.queueDestinationId)))
      .limit(1);
    if (!destino) return { ok: false, error: 'Fila de destino não encontrada.' };

    const [criada] = await tx
      .insert(ruleQueue)
      .values({
        tenantId: tid,
        nome: inbound.name,
        order: inbound.order,
        combinador: inbound.combiner,
        queueDestinationId: inbound.queueDestinationId,
        active: true,
      })
      .returning({ id: ruleQueue.id });
    if (!criada) return { ok: false, error: 'Não consegui gravar a regra.' };

    await tx.insert(ruleQueueCondition).values(
      inbound.conditions.map((c) => ({
        tenantId: tid,
        regraId: criada.id,
        campo: c.field,
        operador: c.operator,
        value: c.value,
      })),
    );

    await registrarAuditoria(tx, tid, {
      ator: quemGrava,
      acao: 'criou',
      objetoTipo: 'regra_fila',
      objetoId: criada.id,
      depois: { ...inbound, ativa: true, condicoes: inbound.conditions.length },
    });

    return { ok: true };
  });
}

/** O interruptor do cartão-linha: liga e desliga a regra na própria lista. */
export async function toggleActiveOfRuleQueue(
  tx: TransactionPipe,
  tid: string,
  quemAlterna: Ator,
  id: string,
): Promise<Recording> {
  if (quemAlterna.type === 'usuario' && quemAlterna.id) await exigirPermission(tx, quemAlterna.id, RULE_MANAGE);
  return consultar(tx, async (tx) => {
    const [atual] = await tx
      .select({ nome: ruleQueue.nome, ativa: ruleQueue.active })
      .from(ruleQueue)
      .where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.id, id)))
      .limit(1);
    if (!atual) return { ok: false, error: 'Regra não encontrada.' };

    await tx.update(ruleQueue).set({ active: !atual.ativa }).where(eq(ruleQueue.id, id));

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

export interface ConditionOfEdit {
  field: string;
  operator: OperadorDeRegra;
  value: string;
}

/** Só o que veio muda — igual a `PedidoDeEdicaoDeFila`. `condicoes`, quando vem, SUBSTITUI todas as anteriores. */
export interface RequestOfEditOfRuleQueue {
  name?: string;
  order?: number;
  combiner?: 'e' | 'ou';
  queueDestinationId?: string;
  condicoes?: readonly ConditionOfEdit[];
}

export interface RuleQueueWritten {
  id: string;
  name: string;
  order: number;
  combiner: 'e' | 'ou';
  queueDestinationId: string;
  ativa: boolean;
  condicoes: ConditionOfEdit[];
}

/** A regra viva do tenant, com as condições — ou 404. */
async function ruleQueueViva(tx: TransactionPipe, tid: string, id: string): Promise<RuleQueueWritten> {
  const [atual] = await tx
    .select({
      id: ruleQueue.id,
      nome: ruleQueue.nome,
      ordem: ruleQueue.order,
      combinador: ruleQueue.combinador,
      filaDestinoId: ruleQueue.queueDestinationId,
      ativa: ruleQueue.active,
    })
    .from(ruleQueue)
    .where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('regra');

  const condicoes = await tx
    .select({ campo: ruleQueueCondition.campo, operador: ruleQueueCondition.operador, valor: ruleQueueCondition.value })
    .from(ruleQueueCondition)
    .where(eq(ruleQueueCondition.regraId, id))
    .orderBy(asc(ruleQueueCondition.campo), asc(ruleQueueCondition.id));

  return {
    id: atual.id,
    name: atual.nome,
    order: atual.ordem,
    combiner: atual.combinador as 'e' | 'ou',
    queueDestinationId: atual.filaDestinoId,
    ativa: atual.ativa,
    condicoes: condicoes.map((c) => ({
      field: c.campo,
      operator: c.operador as OperadorDeRegra,
      value: c.valor ?? '',
    })),
  };
}

function conditionsChecked(bruto: readonly ConditionOfEdit[]): ConditionOfEdit[] {
  if (bruto.length === 0) {
    throw PipeError.request(
      'without_condition',
      'Uma regra sem condição nunca casa. Preencha pelo menos uma.',
    );
  }
  return bruto.map((c) => {
    const campo = String(c.field ?? '').trim();
    const valor = String(c.value ?? '').trim();
    if (!campoValido(campo)) {
      throw PipeError.request(
        'field_invalid',
        `"${campo}" não é um campo válido. Use um dos fixos ou um campo extra como contato.atributos.plano.`,
      );
    }
    if (!operadorValido(c.operator)) throw PipeError.request('operator_invalid', 'Operador inválido.');
    if (!valor) throw PipeError.request('value_required', `A condição sobre "${campo}" ficou sem valor.`);
    return { field: campo, operator: c.operator, value: valor };
  });
}

/** `update`: renomear, trocar fila/combinador/ordem e substituir as condições são o mesmo gesto. */
export async function editarRuleQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfRuleQueue,
): Promise<RuleQueueWritten> {
  const atual = await ruleQueueViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RULE_MANAGE);

  const antes = { nome: atual.name, ordem: atual.order, combinador: atual.combiner, filaDestinoId: atual.queueDestinationId };
  const depois = { ...antes };

  if (pedido.name !== undefined) {
    const nome = String(pedido.name).trim();
    if (!nome) throw PipeError.request('name_required', 'Informe o nome da regra.');
    depois.nome = nome;
  }
  if (pedido.order !== undefined) depois.ordem = orderChecked(pedido.order);
  if (pedido.combiner !== undefined) {
    if (pedido.combiner !== 'e' && pedido.combiner !== 'ou') {
      throw PipeError.request('combiner_invalid', 'Combinador inválido.');
    }
    depois.combinador = pedido.combiner;
  }
  if (pedido.queueDestinationId !== undefined) {
    const [destination] = await tx
      .select({ id: queue.id })
      .from(queue)
      .where(and(eq(queue.tenantId, tid), eq(queue.id, pedido.queueDestinationId)))
      .limit(1);
    if (!destination) throw PipeError.request('queue_not_found', 'Fila de destino não encontrada.');
    depois.filaDestinoId = pedido.queueDestinationId;
  }

  if (depois.nome !== antes.nome) {
    const [conflito] = await tx
      .select({ id: ruleQueue.id })
      .from(ruleQueue)
      .where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.nome, depois.nome), ne(ruleQueue.id, id)))
      .limit(1);
    if (conflito) throw PipeError.conflito('name_in_use', `Já existe uma regra chamada "${depois.nome}".`);
  }

  const mudanca = diferenca(antes, depois);
  const conditionsNews = pedido.condicoes !== undefined ? conditionsChecked(pedido.condicoes) : undefined;
  if (Object.keys(mudanca.depois).length === 0 && conditionsNews === undefined) return atual;

  if (Object.keys(mudanca.depois).length > 0) {
    await tx
      .update(ruleQueue)
      .set({
        nome: depois.nome,
        order: depois.ordem,
        combinador: depois.combinador,
        queueDestinationId: depois.filaDestinoId,
        atualizadoEm: new Date(),
      })
      .where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.id, id)));
  }

  if (conditionsNews !== undefined) {
    await tx.delete(ruleQueueCondition).where(eq(ruleQueueCondition.regraId, id));
    await tx.insert(ruleQueueCondition).values(
      conditionsNews.map((c) => ({
        tenantId: tid,
        regraId: id,
        campo: c.field,
        operador: c.operator,
        value: c.value,
      })),
    );
  }

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'regra_fila',
    objetoId: id,
    antes: { ...mudanca.antes, ...(conditionsNews !== undefined ? { condicoes: atual.condicoes.length } : {}) },
    depois: { ...mudanca.depois, ...(conditionsNews !== undefined ? { condicoes: conditionsNews.length } : {}) },
  });

  return ruleQueueViva(tx, tid, id);
}

/** `destroy`: `regra_fila_condicao.regra_id` é `ON DELETE CASCADE` — excluir a regra leva as condições junto. */
export async function deleteRuleQueue(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  id: string,
): Promise<void> {
  const atual = await ruleQueueViva(tx, tid, id);
  await exigirPermission(tx, userId, RULE_MANAGE);

  await tx.delete(ruleQueue).where(and(eq(ruleQueue.tenantId, tid), eq(ruleQueue.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(userId),
    acao: 'excluiu',
    objetoTipo: 'regra_fila',
    objetoId: id,
    antes: { nome: atual.name, ativa: atual.ativa },
  });
}

// ------------------------------------------------------- gestão de atendentes

export interface AgentRegistered {
  id: string;
  name: string;
  email: string;
  active: boolean;
  /** `null` quando a pessoa nunca conectou: não é "offline", é "nunca esteve". */
  state: string | null;
  queues: string[];
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
export async function loadAgents(tx: TransactionPipe): Promise<AgentRegistered[]> {
  return consultar(tx, async (tx) => {
    const pessoas = await tx
      .select({
        id: user.id,
        name: user.nome,
        email: user.email,
        active: user.ativo,
        state: statusAgent.estado,
      })
      .from(user)
      .leftJoin(statusAgent, eq(statusAgent.usuarioId, user.id))
      .orderBy(asc(user.nome));

    const members = await tx
      .select({
        usuarioId: queueAgent.userId,
        filaNome: queue.nome,
        override: queueAgent.capacityOverride,
        padrao: queue.capacityDefault,
      })
      .from(queueAgent)
      .innerJoin(queue, eq(queue.id, queueAgent.queueId))
      .orderBy(asc(queue.order), asc(queue.nome));

    const byPerson = new Map<string, { queues: string[]; limit: number }>();
    for (const m of members) {
      const atual = byPerson.get(m.usuarioId) ?? { queues: [], limit: 0 };
      atual.queues.push(m.filaNome);
      atual.limit = Math.max(atual.limit, m.override ?? m.padrao);
      byPerson.set(m.usuarioId, atual);
    }

    return pessoas.map((p) => {
      const dela = byPerson.get(p.id);
      return {
        ...p,
        queues: dela?.queues ?? [],
        limiteSimultaneo: dela ? dela.limit : null,
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

export interface RequestOfQueue {
  name: string;
  color?: string | null;
  scheduleId?: string | null;
  capacityDefault: number;
  order?: number;
  active?: boolean;
}

/** Só o que veio muda — igual a `PedidoDeEdicao` de `ciclo-de-vida-do-fluxo.ts`. */
export interface RequestOfEditOfQueue {
  name?: string;
  color?: string | null;
  scheduleId?: string | null;
  capacityDefault?: number;
  order?: number;
  ativa?: boolean;
}

export interface QueueWritten {
  id: string;
  name: string;
  color: string | null;
  scheduleId: string | null;
  capacityDefault: number;
  order: number;
  ativa: boolean;
}

function nameOfQueueChecked(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw PipeError.request('name_required', 'Informe o nome da fila.');
  return nome;
}

function colorOfQueueChecked(bruto: unknown): string | null {
  if (bruto === undefined || bruto === null) return null;
  const cor = String(bruto).trim();
  if (!cor) return null;
  if (!corValida(cor)) throw PipeError.request('color_invalid', 'Cor fora da paleta.');
  return cor;
}

/** Mesmo teto de `acoes/atendentes.ts::salvarFila` — reaproveitado também para o override do atendente. */
function capacityChecked(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 200) {
    throw PipeError.request(
      'capacity_invalid',
      'A capacidade padrão é um inteiro de 1 a 200 — é quantas conversas simultâneas cada atendente da fila aguenta.',
    );
  }
  return n;
}

function orderChecked(bruto: unknown): number {
  const n = Number(bruto ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 999) {
    throw PipeError.request('order_invalid', 'A ordem é um inteiro de 0 a 999.');
  }
  return n;
}

async function horarioExiste(tx: TransactionPipe, tid: string, horarioId: string): Promise<boolean> {
  const [achado] = await tx
    .select({ id: scheduleAttendance.id })
    .from(scheduleAttendance)
    .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, horarioId)))
    .limit(1);
  return achado !== undefined;
}

async function nameOfQueueInUse(
  tx: TransactionPipe,
  tid: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: queue.id })
    .from(queue)
    .where(
      and(eq(queue.tenantId, tid), eq(queue.nome, nome), excetoId ? ne(queue.id, excetoId) : undefined),
    )
    .limit(1);
  return conflito !== undefined;
}

function conflitoOfNameOfQueue(nome: string): PipeError {
  return PipeError.conflito('name_in_use', `Já existe uma fila chamada "${nome}".`);
}

/** A fila viva do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function queueViva(tx: TransactionPipe, tid: string, id: string): Promise<QueueWritten> {
  const [atual] = await tx
    .select({
      id: queue.id,
      name: queue.nome,
      color: queue.cor,
      scheduleId: queue.horarioId,
      capacityDefault: queue.capacityDefault,
      order: queue.order,
      ativa: queue.ativa,
    })
    .from(queue)
    .where(and(eq(queue.tenantId, tid), eq(queue.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fila');
  return atual;
}

export async function createQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  pedido: RequestOfQueue,
): Promise<{ id: string }> {
  await exigirPermission(tx, usuarioId, QUEUE_MANAGE);

  const nome = nameOfQueueChecked(pedido.name);
  const cor = colorOfQueueChecked(pedido.color);
  const capacityDefault = capacityChecked(pedido.capacityDefault);
  const order = orderChecked(pedido.order);
  const horarioId = pedido.scheduleId ? String(pedido.scheduleId) : null;
  const active = pedido.active ?? true;

  if (await nameOfQueueInUse(tx, tid, nome)) throw conflitoOfNameOfQueue(nome);
  if (horarioId && !(await horarioExiste(tx, tid, horarioId))) {
    throw PipeError.request('schedule_not_found', 'Horário de atendimento não encontrado.');
  }

  const [criada] = await tx
    .insert(queue)
    .values({ tenantId: tid, nome, cor, horarioId, capacityDefault, order, ativa: active })
    .returning({ id: queue.id });
  if (!criada) throw PipeError.request('queue_not_created', 'Não consegui gravar a fila.');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'fila',
    objetoId: criada.id,
    depois: { nome, cor, horarioId, capacityDefault, order, active },
  });
  return { id: criada.id };
}

/** `update`: renomear, trocar cor/horário/capacidade/ordem e ativar/desativar são o mesmo gesto. */
export async function editarQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfQueue,
): Promise<QueueWritten> {
  const atual = await queueViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, QUEUE_MANAGE);

  // `antes`/`depois` de propósito SEM anotação de tipo: literal inferido carrega
  // índice implícito e é o que deixa `diferenca` (que pede `Record<string,
  // unknown>`) aceitar o objeto — a mesma escolha de `editarFluxo`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.name !== undefined) depois.name = nameOfQueueChecked(pedido.name);
  if (pedido.color !== undefined) depois.color = colorOfQueueChecked(pedido.color);
  if (pedido.capacityDefault !== undefined) {
    depois.capacityDefault = capacityChecked(pedido.capacityDefault);
  }
  if (pedido.order !== undefined) depois.order = orderChecked(pedido.order);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;
  if (pedido.scheduleId !== undefined) {
    const horarioId = pedido.scheduleId ? String(pedido.scheduleId) : null;
    if (horarioId && !(await horarioExiste(tx, tid, horarioId))) {
      throw PipeError.request('schedule_not_found', 'Horário de atendimento não encontrado.');
    }
    depois.scheduleId = horarioId;
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.name !== antes.name && (await nameOfQueueInUse(tx, tid, depois.name, id))) {
    throw conflitoOfNameOfQueue(depois.name);
  }

  const [gravada] = await tx
    .update(queue)
    .set({
      nome: depois.name,
      cor: depois.color,
      horarioId: depois.scheduleId,
      capacityDefault: depois.capacityDefault,
      order: depois.order,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(queue.tenantId, tid), eq(queue.id, id)))
    .returning({
      id: queue.id,
      name: queue.nome,
      color: queue.cor,
      scheduleId: queue.horarioId,
      capacityDefault: queue.capacityDefault,
      order: queue.order,
      ativa: queue.ativa,
    });
  if (!gravada) throw PipeError.naoEncontrado('fila');

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
export async function deleteQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await queueViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, QUEUE_MANAGE);

  const [withConversation] = await tx
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.filaId, id), isNull(conversation.encerradaEm)))
    .limit(1);
  if (withConversation) {
    throw PipeError.conflito(
      'queue_with_conversation_open',
      'Esta fila tem conversa em aberto e não pode ser excluída. Transfira ou encerre as conversas primeiro.',
    );
  }

  const [comoPadrao] = await tx
    .select({ nome: inbox.nome })
    .from(inbox)
    .where(and(eq(inbox.tenantId, tid), eq(inbox.queueDefaultId, id)))
    .limit(1);
  if (comoPadrao) {
    throw PipeError.conflito(
      'queue_default_of_inbox',
      `Esta fila é a fila padrão da caixa de entrada "${comoPadrao.nome}" e não pode ser excluída.`,
    );
  }

  // `regra_fila.fila_destino_id` é `ON DELETE CASCADE`: sem esta recusa, excluir a fila
  // apagaria a regra de entrada em silêncio, sem quem a cadastrou ter pedido isso.
  const [asDestinationOfRule] = await tx
    .select({ nome: ruleQueue.nome })
    .from(ruleQueue)
    .where(eq(ruleQueue.queueDestinationId, id))
    .limit(1);
  if (asDestinationOfRule) {
    throw PipeError.conflito(
      'queue_used_in_rule',
      `A regra de entrada "${asDestinationOfRule.nome}" manda conversa para esta fila. Edite ou exclua a regra antes.`,
    );
  }

  await tx.delete(queue).where(and(eq(queue.tenantId, tid), eq(queue.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'fila',
    objetoId: id,
    antes: { nome: atual.name, ativa: atual.ativa },
  });
}

/** Vincular: cria a participação, ou troca o `capacidadeOverride` de quem já está na fila. */
export async function vincularAgentInQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  queueId: string,
  agentId: string,
  capacityOverride?: number | null,
): Promise<void> {
  await queueViva(tx, tid, queueId);
  await exigirPermission(tx, usuarioId, QUEUE_MANAGE);

  const [pessoa] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.tenantId, tid), eq(user.id, agentId)))
    .limit(1);
  if (!pessoa) throw PipeError.naoEncontrado('atendente');

  const override =
    capacityOverride === undefined || capacityOverride === null
      ? null
      : capacityChecked(capacityOverride);

  await tx
    .insert(queueAgent)
    .values({ tenantId: tid, queueId, userId: agentId, capacityOverride: override })
    .onConflictDoUpdate({
      target: [queueAgent.queueId, queueAgent.userId],
      set: { capacityOverride: override },
    });

  // `Acao` de `@pipe/db` é fechado ('criou'/'alterou'/'excluiu'/'ativou'/'desativou');
  // vincular/desvincular é uma alteração da COMPOSIÇÃO da fila, não um gesto à parte.
  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fila_atendente',
    objetoId: queueId,
    depois: { agentId, capacidadeOverride: override, vinculo: 'criado' },
  });
}

export async function unlinkAgentOfQueue(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  filaId: string,
  atendenteId: string,
): Promise<void> {
  await queueViva(tx, tid, filaId);
  await exigirPermission(tx, usuarioId, QUEUE_MANAGE);

  const apagados = await tx
    .delete(queueAgent)
    .where(
      and(
        eq(queueAgent.tenantId, tid),
        eq(queueAgent.queueId, filaId),
        eq(queueAgent.userId, atendenteId),
      ),
    )
    .returning({ usuarioId: queueAgent.userId });
  if (apagados.length === 0) throw PipeError.naoEncontrado('vínculo de atendente com a fila');

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
  name: string;
  durationSuggestedMin?: number | null;
  countsAsProductive?: boolean;
  active?: boolean;
}

export interface RequestOfEditOfReasonPause {
  name?: string;
  durationSuggestedMin?: number | null;
  countsAsProductive?: boolean;
  active?: boolean;
}

export interface MotivoPausaGravado {
  id: string;
  name: string;
  durationSuggestedMin: number | null;
  countsAsProductive: boolean;
  active: boolean;
}

function nomeDeMotivoConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw PipeError.request('name_required', 'Informe o nome do motivo.');
  if (nome.length > NOME_DA_PAUSA_MAX) {
    throw PipeError.request(
      'name_size',
      `O nome da pausa tem até ${NOME_DA_PAUSA_MAX} caracteres.`,
    );
  }
  return nome;
}

/** `null` é "sem sugestão"; `undefined` (edição) é "não mexa" — conferidos por quem chama. */
function durationSuggestedChecked(bruto: unknown): number | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > 480) {
    throw PipeError.request(
      'duration_invalid',
      'A duração sugerida é um inteiro de 1 a 480 minutos.',
    );
  }
  return n;
}

async function nomeDeMotivoEmUso(
  tx: TransactionPipe,
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

async function motivoVivo(tx: TransactionPipe, tid: string, id: string): Promise<MotivoPausaGravado> {
  const [atual] = await tx
    .select({
      id: motivoPausa.id,
      name: motivoPausa.nome,
      durationSuggestedMin: motivoPausa.durationSuggestedMin,
      countsAsProductive: motivoPausa.accountAsProductive,
      active: motivoPausa.ativo,
    })
    .from(motivoPausa)
    .where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('motivo de pausa');
  return atual;
}

export async function createReasonPause(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeMotivoPausa,
): Promise<{ id: string }> {
  await exigirPermission(tx, usuarioId, PAUSE_MANAGE);

  const nome = nomeDeMotivoConferido(pedido.name);
  const durationSuggestedMin = durationSuggestedChecked(pedido.durationSuggestedMin);
  const accountAsProductive = pedido.countsAsProductive ?? false;
  const ativo = pedido.active ?? true;

  if (await nomeDeMotivoEmUso(tx, tid, nome)) {
    throw PipeError.conflito('name_in_use', `Já existe um motivo chamado "${nome}".`);
  }

  const [criado] = await tx
    .insert(motivoPausa)
    .values({ tenantId: tid, nome, durationSuggestedMin, accountAsProductive, ativo })
    .returning({ id: motivoPausa.id });
  if (!criado) throw PipeError.request('reason_not_created', 'Não consegui gravar o motivo.');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'motivo_pausa',
    objetoId: criado.id,
    depois: { nome, durationSuggestedMin, accountAsProductive, ativo },
  });
  return { id: criado.id };
}

export async function editarMotivoPausa(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfReasonPause,
): Promise<MotivoPausaGravado> {
  const atual = await motivoVivo(tx, tid, id);
  await exigirPermission(tx, usuarioId, PAUSE_MANAGE);

  // Sem anotação de tipo — ver o comentário equivalente em `editarFila`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.name !== undefined) depois.name = nomeDeMotivoConferido(pedido.name);
  if (pedido.durationSuggestedMin !== undefined) {
    depois.durationSuggestedMin = durationSuggestedChecked(pedido.durationSuggestedMin);
  }
  if (pedido.countsAsProductive !== undefined) depois.countsAsProductive = pedido.countsAsProductive;
  if (pedido.active !== undefined) depois.active = pedido.active;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.name !== antes.name && (await nomeDeMotivoEmUso(tx, tid, depois.name, id))) {
    throw PipeError.conflito('name_in_use', `Já existe um motivo chamado "${depois.name}".`);
  }

  const [gravado] = await tx
    .update(motivoPausa)
    .set({
      nome: depois.name,
      durationSuggestedMin: depois.durationSuggestedMin,
      accountAsProductive: depois.countsAsProductive,
      ativo: depois.active,
    })
    .where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)))
    .returning({
      id: motivoPausa.id,
      name: motivoPausa.nome,
      durationSuggestedMin: motivoPausa.durationSuggestedMin,
      countsAsProductive: motivoPausa.accountAsProductive,
      active: motivoPausa.ativo,
    });
  if (!gravado) throw PipeError.naoEncontrado('motivo de pausa');

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
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await motivoVivo(tx, tid, id);
  await exigirPermission(tx, usuarioId, PAUSE_MANAGE);

  await tx.delete(motivoPausa).where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'motivo_pausa',
    objetoId: id,
    antes: { nome: atual.name, ativo: atual.active },
  });
}
