import { and, asc, eq, gte, inArray, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import {
  cargaPonderada,
  pesoPriority,
  derivarMarcos,
  segundosEntre,
  type AgentDisponivel,
  type CountClosure,
  type ConversationEvents,
  type ClosedBy,
  type StateAgent,
  type EventAttendance,
  type Marcos,
  type ResultadoMetrica,
  type ResponseTimeResult,
  type TipoEvento,
} from '@pipe/core';
import {
  contact,
  conversation,
  conversationLabel,
  etiqueta,
  eventAttendance,
  queue,
  queueAgent,
  motivoPausa,
  pausa,
  statusAgent,
  user,
} from '@pipe/db/schema';
import { registrarAuditoria, type TransactionPipe } from '@pipe/db';
import { exigirPermission } from '../../session.js';
import { PipeError } from '../../errors.js';
import {
  avaliarSlaOfConversation,
  carregarRegrasSla,
  type PillSla,
  type RegraSlaCarregada,
} from './sla.js';
import { loadAttendance, type LinhaDeQuebra } from './attendance.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Monitoring queries only combine database events with calculations from `@pipe/core`; metrics shown on screen come from `2026-09-05-metricas-atendimento.md`. Group by queue, agent and label in memory over the day's rows for now. Move to PostgreSQL `group by` or `metrica_diaria` when a tenant reaches several thousand conversations per day.
 */

/** Touch only relevant partitions; an open-conversation event is not historical. */
const HORIZONTE_ABERTAS_DIAS = 30;

function inicioDoHorizonte(agora: Date): Date {
  return new Date(agora.getTime() - HORIZONTE_ABERTAS_DIAS * 24 * 3600 * 1000);
}

export interface LineConversationOpen {
  id: string;
  ticket: string;
  contactName: string;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentName: string | null;
  state: string;
  priority: string;
  marcos: Marcos;
  /** Segundos na fila: fechado quando já foi atribuída, correndo quando não. */
  inQueueSeg: number | null;
  queueRunning: boolean;
  firstResponseSeg: number | null;
  firstResponseRunning: boolean;
  attendanceSeg: number | null;
  emEspera: boolean;
  /** A bola está com o atendente: o cliente falou por último, ou ninguém respondeu ainda. */
  aguardandoAtendente: boolean;
  sla: PillSla;
  labels: string[];
}

export interface CardsTimeReal {
  naFila: number;
  largestWaitInQueueSeg: number | null;
  /**
   * De quantas conversas o máximo acima saiu. Máximo sem população é a mesma
   * armadilha da média sem denominador (§2 da spec de métricas): "40 minutos"
   * entre duas conversas e entre duzentas pedem reações opostas.
   */
  aguardandoFirstResponse: number;
  largestWaitFirstResponseSeg: number | null;
  inAttendance: number;
  agentsOnline: number;
  mediaByAgent: number | null;
}

export interface CardAgents {
  online: number;
  pausa: number;
  invisivel: number;
  offline: number;
  pausasEstouradas: number;
}

export interface CardsOfToday {
  esperaDoCliente: ResultadoMetrica;
  untilFirstResponse: ResultadoMetrica;
  timeOfAttendance: ResultadoMetrica;
  timeOfResponse: ResponseTimeResult;
  closures: CountClosure;
}

export interface CargaAgent {
  id: string;
  name: string;
  state: StateAgent;
  ativas: number;
  aguardandoAgent: number;
  limite: number;
  carga: number;
  /** Carga máxima possível: o limite todo ocupado por conversa aguardando o atendente. */
  cargaMaxima: number;
  timeMediumResponseSeg: number | null;
  timeMediumAttendanceSeg: number | null;
}

export interface SummaryQueue {
  id: string;
  name: string;
  inQueue: number;
  emAtendimento: number;
  maiorEsperaSeg: number | null;
  atendentesOnline: number;
  timeMediumInQueueSeg: number | null;
  tempoMedioRespostaSeg: number | null;
  tempoMedioAtendimentoSeg: number | null;
}

export interface ResumoEtiqueta {
  id: string;
  name: string;
  color: string | null;
  abertas: number;
  finalizadas: number;
  tempoMedioAtendimentoSeg: number | null;
}

export interface Monitoring {
  agora: Date;
  fuso: string;
  timeReal: CardsTimeReal;
  agents: CardAgents;
  hoje: CardsOfToday;
  abertas: LineConversationOpen[];
  carga: CargaAgent[];
  queues: SummaryQueue[];
  labels: ResumoEtiqueta[];
  ticketsOpenByHour: number[];
  /** Catálogo para os filtros rápidos. */
  listAgents: { id: string; name: string }[];
}

export interface PreviaOfConversationInMonitoring {
  id: string;
  ticket: string;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  itens: { id: string; at: Date | string; type: 'mensagem' | 'nota'; direction?: string; texto: string; autor?: string | null }[];
}

/** Management may read any tenant ticket; Desk may read only tickets assigned to that agent. */
export async function loadPreviaOfConversation(
  tx: TransactionPipe,
  userId: string,
  conversationId: string,
): Promise<PreviaOfConversationInMonitoring | null> {
  await exigirPermission(tx, userId, 'monitoramento.tempo_real.ver');
  const { rows } = await tx.execute<{
    id: string; contactName: string | null; queueName: string | null; agentName: string | null;
  }>(sql`
    select c.id, ct.nome as contato_nome, f.nome as fila_nome, u.nome as atendente_nome
      from conversa c
      join contato ct on ct.id = c.contato_id
      left join fila f on f.id = c.fila_id
      left join usuario u on u.id = c.atendente_id
     where c.id = ${conversationId}::uuid
     limit 1
  `);
  const conversationOpen = rows[0];
  if (!conversationOpen) return null;
  const itens = await tx.execute<{
    id: string; at: Date | string; type: 'mensagem' | 'nota'; direction: string | null; texto: string; autor: string | null;
  }>(sql`
    select m.id, m.criada_em as em, 'mensagem'::text as tipo, m.direcao,
           coalesce(m.conteudo, '') as texto, u.nome as autor
      from mensagem m left join usuario u on u.id = m.autor_id
     where m.conversa_id = ${conversationId}::uuid
    union all
    select n.id, n.em, 'nota'::text as tipo, null, n.corpo, u.nome
      from nota_interna n left join usuario u on u.id = n.usuario_id
     where n.conversa_id = ${conversationId}::uuid
     order by em
  `);
  return {
    id: conversationOpen.id,
    ticket: ticketDe(conversationOpen.id),
    contactName: conversationOpen.contactName ?? 'Contato sem nome',
    queueName: conversationOpen.queueName,
    agentName: conversationOpen.agentName,
    itens: itens.rows.map(({ direction, ...item }) => ({ ...item, ...(direction ? { direction } : {}) })),
  };
}

/** An internal note is the supervisor-agent conversation opened by the source bubble; it must not reach the customer. */
export async function falarWithAgentInMonitoring(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  conversaId: string,
  texto: string,
): Promise<void> {
  await exigirPermission(tx, usuarioId, 'conversa.nota_interna');
  const corpo = texto.trim();
  if (!corpo) throw PipeError.request('note_empty', 'Escreva uma mensagem antes de enviar.');
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from conversa where id = ${conversaId}::uuid limit 1
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('Conversa');
  await tx.execute(sql`
    insert into nota_interna (tenant_id, conversa_id, usuario_id, corpo)
    values (${tenantId}, ${conversaId}::uuid, ${usuarioId}::uuid, ${corpo})
  `);
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'conversa',
    objetoId: conversaId,
    depois: { acao: 'falar_com_atendente' },
  });
}

export function metricsByKey(linhas: readonly LinhaDeQuebra[]) {
  return new Map(
    linhas.map((linha) => [
      linha.key,
      {
        conversasFinalizadas: linha.conversations,
        tempoMedioNaFilaSeg: linha.inQueue.value,
        tempoMedioPrimeiraRespostaSeg: linha.firstResponse.value,
        tempoMedioAtendimentoSeg: linha.attendance.value,
      },
    ]),
  );
}

export function normalizeTicketsByHour(linhas: readonly { hour: number; total: number }[]): number[] {
  const horas = Array<number>(24).fill(0);
  for (const linha of linhas) {
    if (Number.isInteger(linha.hour) && linha.hour >= 0 && linha.hour < 24) {
      horas[linha.hour] = linha.total;
    }
  }
  return horas;
}

/** Número de ticket legível a partir do uuid — o modelo não tem sequência própria. */
export function ticketDe(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

type LinhaEvento = {
  conversationId: string;
  type: string;
  at: Date;
  userId: string | null;
  queueId: string | null;
  data: unknown;
};

/** Converte as linhas de `evento_atendimento` no formato que o `@pipe/core` consome. */
function agruparEventos(linhas: readonly LinhaEvento[]): Map<string, ConversationEvents> {
  const mapa = new Map<string, ConversationEvents & { eventos: EventAttendance[] }>();
  for (const linha of linhas) {
    const data = (linha.data ?? {}) as { closedBy?: string };
    const evento: EventAttendance = {
      conversationId: linha.conversationId,
      tipo: linha.type as TipoEvento,
      em: linha.at,
      userId: linha.userId,
      queueId: linha.queueId,
      encerradaBy: (data.closedBy ?? null) as ClosedBy | null,
    };
    const atual = mapa.get(linha.conversationId);
    if (atual) atual.eventos.push(evento);
    else mapa.set(linha.conversationId, { conversationId: linha.conversationId, eventos: [evento] });
  }
  return mapa;
}

function marcosVazios(conversaId: string): Marcos {
  return {
    conversationId: conversaId,
    criadaEm: null,
    atribuidaEm: null,
    firstRespostaIn: null,
    encerradaEm: null,
    encerradaBy: null,
    assignments: 0,
  };
}


function entre(inicio: Date | null, fim: Date | null): number | null {
  if (!inicio || !fim) return null;
  const s = segundosEntre(inicio, fim);
  return s < 0 ? null : s;
}

function maiorDe(values: readonly (number | null)[]): number | null {
  const validos = values.filter((v): v is number => v !== null);
  return validos.length > 0 ? Math.max(...validos) : null;
}

/**
 * Tudo o que a tela de monitoramento precisa, em uma transação só.
 *
 * `agora` entra por parâmetro: as métricas de "tempo real" têm cronômetro
 * correndo e o instante precisa ser o mesmo em todos os cartões, senão a soma
 * dos cartões não fecha com a tabela.
 */
export interface MonitoringFilter {
  queueId?: string | undefined;
  agentId?: string | undefined;
  queueIds?: string[];
  agentIds?: string[];
}

/**
 * A ordem da FILA DE ESPERA: prioridade primeiro, e empate desempata pela mais
 * antiga.
 *
 * É a regra deles, e ela só existe porque a prioridade tem um degrau de
 * AUSÊNCIA: um ticket `baixa` fura a frente de um `sem_prioridade`. Enquanto a
 * coluna nascia em `media`, ordenar por prioridade era ordenar por um dado que
 * ninguém tinha escolhido, e por isso a lista saía só por data de criação.
 *
 * O desempate por antiguidade é o que impede a fila de virar pilha, com o
 * último a chegar sendo o primeiro a sair. A aba "Atribuído/Em andamento"
 * continua em ordem de criação: lá o ticket já tem dono, e prioridade não muda
 * mais quem atende.
 */
export function sortQueueOfWait<
  T extends { priority: string; marcos: { criadaEm: Date | null } },
>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const diferenca = pesoPriority(a.priority) - pesoPriority(b.priority);
    if (diferenca !== 0) return diferenca;
    /*
     * Place a conversation without a creation timestamp last: it is not the oldest, but one whose start is unknown. Match Desk's `null` ordering.
     */
    const ta = a.marcos.criadaEm?.getTime() ?? Infinity;
    const tb = b.marcos.criadaEm?.getTime() ?? Infinity;
    return ta - tb;
  });
}

export async function loadMonitoring(
  tx: TransactionPipe,
  window: { start: Date; end: Date },
  fuso: string,
  filter: MonitoringFilter = {},
  agora = new Date(),
): Promise<Monitoring> {
  return consultar(tx, async (tx) => {
    const desde = inicioDoHorizonte(agora);
    // Apply the quick filter in `where` for both open and closed populations
    // so cards and table describe the same selection.
    const recorte = [
      filter.queueIds?.length ? inArray(conversation.filaId, filter.queueIds) : filter.queueId ? eq(conversation.filaId, filter.queueId) : undefined,
      filter.agentIds?.length ? inArray(conversation.agentId, filter.agentIds) : filter.agentId ? eq(conversation.agentId, filter.agentId) : undefined,
    ].filter((c) => c !== undefined);

    // ---- 1. conversas ainda abertas -------------------------------------
    const abertasCru = await tx
      .select({
        id: conversation.id,
        estado: conversation.state,
        prioridade: conversation.priority,
        filaId: conversation.filaId,
        filaNome: queue.nome,
        atendenteId: conversation.agentId,
        atendenteNome: user.nome,
        contatoNome: contact.nome,
        emEsperaDesde: conversation.emEsperaDesde,
        ultimaMensagemDe: conversation.lastMessageOf,
      })
      .from(conversation)
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, conversation.agentId))
      .leftJoin(contact, eq(contact.id, conversation.contatoId))
      .where(and(isNull(conversation.encerradaEm), ...recorte))
      .orderBy(asc(conversation.criadaEm));

    const idsAbertas = abertasCru.map((c) => c.id);

    const eventosAbertas =
      idsAbertas.length === 0
        ? new Map<string, ConversationEvents>()
        : agruparEventos(
            await tx
              .select({
                conversationId: eventAttendance.conversaId,
                type: eventAttendance.tipo,
                at: eventAttendance.em,
                userId: eventAttendance.usuarioId,
                queueId: eventAttendance.queueId,
                data: eventAttendance.data,
              })
              .from(eventAttendance)
              .where(
                and(
                  inArray(eventAttendance.conversaId, idsAbertas),
                  gte(eventAttendance.em, desde),
                ),
              ),
          );

    const labelsByConversation = new Map<string, string[]>();
    if (idsAbertas.length > 0) {
      const linhas = await tx
        .select({ conversaId: conversationLabel.conversaId, nome: etiqueta.nome })
        .from(conversationLabel)
        .innerJoin(etiqueta, eq(etiqueta.id, conversationLabel.etiquetaId))
        .where(inArray(conversationLabel.conversaId, idsAbertas));
      for (const l of linhas) {
        const atual = labelsByConversation.get(l.conversaId);
        if (atual) atual.push(l.nome);
        else labelsByConversation.set(l.conversaId, [l.nome]);
      }
    }

    const regras: RegraSlaCarregada[] = await carregarRegrasSla(tx);

    const abertas: LineConversationOpen[] = abertasCru.map((c) => {
      const eventos = eventosAbertas.get(c.id);
      const marcos = eventos ? derivarMarcos(eventos) : marcosVazios(c.id);
      const inQueueSeg = marcos.atribuidaEm
        ? entre(marcos.criadaEm, marcos.atribuidaEm)
        : entre(marcos.criadaEm, agora);
      const firstResponseSeg = marcos.firstRespostaIn
        ? entre(marcos.atribuidaEm, marcos.firstRespostaIn)
        : entre(marcos.atribuidaEm, agora);
      return {
        id: c.id,
        ticket: ticketDe(c.id),
        contactName: c.contatoNome ?? 'Contato sem nome',
        queueId: c.filaId,
        queueName: c.filaNome,
        agentId: c.atendenteId,
        agentName: c.atendenteNome,
        state: c.estado,
        priority: c.prioridade,
        marcos,
        inQueueSeg,
        queueRunning: marcos.atribuidaEm === null,
        firstResponseSeg,
        firstResponseRunning: marcos.firstRespostaIn === null && marcos.atribuidaEm !== null,
        attendanceSeg: entre(marcos.firstRespostaIn, agora),
        emEspera: c.emEsperaDesde !== null,
        aguardandoAtendente: c.ultimaMensagemDe === 'contato' || marcos.firstRespostaIn === null,
        sla: avaliarSlaOfConversation(regras, marcos, c.filaId, agora),
        labels: labelsByConversation.get(c.id) ?? [],
      };
    });

    // ---- 2. status dos atendentes ---------------------------------------
    const status = await tx
      .select({
        usuarioId: statusAgent.usuarioId,
        estado: statusAgent.estado,
        nome: user.nome,
      })
      .from(statusAgent)
      .innerJoin(user, eq(user.id, statusAgent.usuarioId))
      .where(eq(user.ativo, true));

    const cardAgents: CardAgents = {
      online: 0,
      pausa: 0,
      invisivel: 0,
      offline: 0,
      pausasEstouradas: 0,
    };
    for (const s of status) {
      if (s.estado === 'online') cardAgents.online += 1;
      else if (s.estado === 'pausa') cardAgents.pausa += 1;
      else if (s.estado === 'invisivel') cardAgents.invisivel += 1;
      else cardAgents.offline += 1;
    }

    // Open pause exceeding its reason's suggested duration.
    const pausasAbertas = await tx
      .select({ iniciadaEm: pausa.iniciadaEm, sugeridaMin: motivoPausa.durationSuggestedMin })
      .from(pausa)
      .leftJoin(motivoPausa, eq(motivoPausa.id, pausa.motivoId))
      .where(isNull(pausa.encerradaEm));
    for (const p of pausasAbertas) {
      const limite = p.sugeridaMin;
      if (typeof limite !== 'number') continue;
      if (segundosEntre(p.iniciadaEm, agora) > limite * 60) cardAgents.pausasEstouradas += 1;
    }

    const inQueue = abertas.filter((c) => c.marcos.atribuidaEm === null);
    const semResposta = abertas.filter(
      (c) => c.marcos.atribuidaEm !== null && c.marcos.firstRespostaIn === null,
    );
    const inAttendance = abertas.filter((c) => c.agentId !== null);

    const timeReal: CardsTimeReal = {
      naFila: inQueue.length,
      largestWaitInQueueSeg: maiorDe(inQueue.map((c) => c.inQueueSeg)),
      aguardandoFirstResponse: semResposta.length,
      largestWaitFirstResponseSeg: maiorDe(semResposta.map((c) => c.firstResponseSeg)),
      inAttendance: inAttendance.length,
      agentsOnline: cardAgents.online,
      mediaByAgent:
        cardAgents.online > 0 ? inAttendance.length / cardAgents.online : null,
    };

    const report = await loadAttendance(tx, window, filter);
    const hoje: CardsOfToday = {
      esperaDoCliente: report.geral.esperaTotal,
      untilFirstResponse: report.geral.firstResponse,
      timeOfAttendance: report.geral.attendance,
      timeOfResponse: report.geral.resposta,
      closures: report.geral.closures,
    };
    const byAgent = metricsByKey(report.byAgent);
    const byQueue = metricsByKey(report.byQueue);
    const byLabel = metricsByKey(report.byLabel);

    // ---- 5. carga por atendente -----------------------------------------
    const capacitys = await tx
      .select({
        usuarioId: queueAgent.userId,
        filaId: queueAgent.queueId,
        override: queueAgent.capacityOverride,
        padrao: queue.capacityDefault,
      })
      .from(queueAgent)
      .innerJoin(queue, eq(queue.id, queueAgent.queueId));

    const limitByAgent = new Map<string, number>();
    const queuesByAgent = new Map<string, string[]>();
    for (const c of capacitys) {
      const limite = c.override ?? c.padrao;
      limitByAgent.set(
        c.usuarioId,
        Math.max(limitByAgent.get(c.usuarioId) ?? 0, limite),
      );
      const queues = queuesByAgent.get(c.usuarioId);
      if (queues) queues.push(c.filaId);
      else queuesByAgent.set(c.usuarioId, [c.filaId]);
    }

    const carga: CargaAgent[] = status
      .filter((s) => s.estado !== 'offline')
      .map((s) => {
        const minhas = abertas.filter((c) => c.agentId === s.usuarioId);
        const aguardando = minhas.filter((c) => c.aguardandoAtendente).length;
        const limite = limitByAgent.get(s.usuarioId) ?? 5;
        const medias = byAgent.get(s.nome);
        const disponivel: AgentDisponivel = {
          id: s.usuarioId,
          state: s.estado as StateAgent,
          queues: queuesByAgent.get(s.usuarioId) ?? [],
          limiteSimultaneo: limite,
          ativas: minhas.length,
          aguardandoAgent: aguardando,
          withoutFirstResposta: minhas.filter((c) => c.marcos.firstRespostaIn === null).length,
          ultimaAssignmentIn: null,
        };
        return {
          id: s.usuarioId,
          name: s.nome,
          state: disponivel.state,
          ativas: minhas.length,
          aguardandoAgent: aguardando,
          limite,
          carga: cargaPonderada(disponivel),
          // O teto da barra: o limite todo ocupado por conversa que aguarda o atendente.
          cargaMaxima: cargaPonderada({
            ...disponivel,
            ativas: limite,
            aguardandoAgent: limite,
          }),
          timeMediumResponseSeg: medias?.tempoMedioPrimeiraRespostaSeg ?? null,
          timeMediumAttendanceSeg: medias?.tempoMedioAtendimentoSeg ?? null,
        };
      })
      .sort((a, b) => b.carga - a.carga || a.name.localeCompare(b.name, 'pt-BR'));

    // ---- 6. resumos por fila e por etiqueta ------------------------------
    const allQueues = await tx
      .select({ id: queue.id, nome: queue.nome })
      .from(queue)
      .where(eq(queue.ativa, true))
      .orderBy(asc(queue.order));

    const onlineByQueue = new Map<string, number>();
    const idsOnline = new Set(status.filter((s) => s.estado === 'online').map((s) => s.usuarioId));
    for (const c of capacitys) {
      if (!idsOnline.has(c.usuarioId)) continue;
      onlineByQueue.set(c.filaId, (onlineByQueue.get(c.filaId) ?? 0) + 1);
    }

    const filas: SummaryQueue[] = allQueues.map((f) => {
      const ofQueue = abertas.filter((c) => c.queueId === f.id);
      const medias = byQueue.get(f.nome);
      return {
        id: f.id,
        name: f.nome,
        inQueue: ofQueue.filter((c) => c.marcos.atribuidaEm === null).length,
        emAtendimento: ofQueue.filter((c) => c.agentId !== null).length,
        maiorEsperaSeg: maiorDe(
          ofQueue.filter((c) => c.marcos.atribuidaEm === null).map((c) => c.inQueueSeg),
        ),
        atendentesOnline: onlineByQueue.get(f.id) ?? 0,
        timeMediumInQueueSeg: medias?.tempoMedioNaFilaSeg ?? null,
        tempoMedioRespostaSeg: medias?.tempoMedioPrimeiraRespostaSeg ?? null,
        tempoMedioAtendimentoSeg: medias?.tempoMedioAtendimentoSeg ?? null,
      };
    });

    const todasEtiquetas = await tx
      .select({ id: etiqueta.id, nome: etiqueta.nome, cor: etiqueta.cor })
      .from(etiqueta)
      .orderBy(asc(etiqueta.nome));

    const countLabel = new Map<string, number>();
    for (const c of abertas) {
      for (const nome of c.labels) {
        countLabel.set(nome, (countLabel.get(nome) ?? 0) + 1);
      }
    }
    const etiquetas: ResumoEtiqueta[] = todasEtiquetas.map((e) => {
      const medias = byLabel.get(e.nome);
      return {
        id: e.id,
        name: e.nome,
        color: e.cor,
        abertas: countLabel.get(e.nome) ?? 0,
        finalizadas: medias?.conversasFinalizadas ?? 0,
        tempoMedioAtendimentoSeg: medias?.tempoMedioAtendimentoSeg ?? null,
      };
    });

    const horaLocal = sql<number>`extract(hour from ${conversation.criadaEm} at time zone ${fuso})::int`;
    const byHourRaw = await tx
      .select({ hour: horaLocal, total: sql<number>`count(*)::int` })
      .from(conversation)
      .where(and(gte(conversation.criadaEm, window.start), lt(conversation.criadaEm, window.end), ...recorte))
      // Parameterize the time-zone expression and refer to it by position
      // so PostgreSQL sees identical `SELECT`, `GROUP BY` and `ORDER BY` expressions.
      .groupBy(sql.raw('1'))
      .orderBy(sql.raw('1'));
    const ticketsOpenByHour = normalizeTicketsByHour(byHourRaw);

    const listAgents = status
      .map((s) => ({ id: s.usuarioId, name: s.nome }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      agora,
      fuso,
      timeReal,
      agents: cardAgents,
      hoje,
      abertas,
      carga,
      queues: filas,
      labels: etiquetas,
      ticketsOpenByHour,
      listAgents,
    };
  });
}

/** Closed-conversation count for the period, used by the history header. */
export async function contarClosedsInPeriod(
  tx: TransactionPipe,
  janela: { start: Date; end: Date },
): Promise<number> {
  return consultar(tx, async (tx) => {
    const r = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(conversation)
      .where(
        and(
          isNotNull(conversation.encerradaEm),
          gte(conversation.encerradaEm, janela.start),
          lt(conversation.encerradaEm, janela.end),
        ),
      );
    return r[0]?.total ?? 0;
  });
}
