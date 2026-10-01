import { and, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  countClosures,
  timeUntilFirstResponse,
  attendanceTime,
  responseTime,
  timeInQueue,
  timeTotalOfWaitOfClient,
  type CountClosure,
  type ConversationEvents,
  type ClosedBy,
  type EventAttendance,
  type ResultadoMetrica,
  type ResponseTimeResult,
  type TipoEvento,
} from '@pipe/core';
import {
  conversation,
  conversationLabel,
  etiqueta,
  eventAttendance,
  queue,
  inbox,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Relatório de atendimento — §2 e §4 da spec de métricas.
 *
 * Aqui não se calcula nada: busca-se a matéria-prima (conversas encerradas no
 * período e os eventos delas) e chamam-se as funções de
 * `packages/core/src/metricas`. Cada número da tela sai de uma delas, com o
 * `excluidas` que veio junto — é ele que a tela é obrigada a mostrar.
 *
 * População: conversas ENCERRADAS dentro do período (§3, "período fechado").
 * O cronômetro parou; nenhuma conversa aberta entra em nada disto.
 */

export interface BlockOfTimes {
  inQueue: ResultadoMetrica;
  firstResponse: ResultadoMetrica;
  esperaTotal: ResultadoMetrica;
  resposta: ResponseTimeResult;
  attendance: ResultadoMetrica;
  closures: CountClosure;
  /** Conversas do recorte — o universo de onde saíram os denominadores acima. */
  conversations: number;
}

export interface LinhaDeQuebra extends BlockOfTimes {
  key: string;
}

export interface ReportAttendance {
  geral: BlockOfTimes;
  byQueue: LinhaDeQuebra[];
  byAgent: LinhaDeQuebra[];
  /**
   * As duas dimensões que o Chatwoot tem e nós não tínhamos: caixa de entrada e
   * rótulo (aqui, etiqueta). Ver `referencias-blip/pesquisa/chatwoot.md`.
   *
   * A de etiqueta é a que mais vale, e a que lá é mais frágil: o relatório
   * deles conta *taggings* em vez de conversas distintas e mistura duas janelas
   * de tempo — as contagens filtram pela data do evento e as médias, pela data
   * de criação da conversa. Aqui as duas populações são a mesma do resto do
   * relatório: conversas ENCERRADAS no período.
   */
  byInbox: LinhaDeQuebra[];
  byLabel: LinhaDeQuebra[];
  /** Conversas encerradas no período que não têm nenhuma etiqueta. */
  semEtiqueta: number;
}

export interface AttendanceFilter {
  queueId?: string | undefined;
  agentId?: string | undefined;
}


function medir(conversas: readonly ConversationEvents[]): BlockOfTimes {
  return {
    inQueue: timeInQueue(conversas),
    firstResponse: timeUntilFirstResponse(conversas),
    esperaTotal: timeTotalOfWaitOfClient(conversas),
    resposta: responseTime(conversas),
    attendance: attendanceTime(conversas),
    closures: countClosures(conversas),
    conversations: conversas.length,
  };
}

/**
 * Group by key and measure each group. Core's `porDimensao` returns `ResultadoMetrica` per group, but this screen also needs closure counts. Group here, calculate in core, and retain core's deterministic key order.
 */
type EixoDeQuebra = 'queue' | 'agent' | 'inbox';

function quebrar(
  conversations: readonly {
    chaves: Record<EixoDeQuebra, string>;
    eventos: ConversationEvents;
  }[],
  eixo: EixoDeQuebra,
): LinhaDeQuebra[] {
  const groups = new Map<string, ConversationEvents[]>();
  for (const c of conversations) {
    const key = c.chaves[eixo];
    const atual = groups.get(key);
    if (atual) atual.push(c.eventos);
    else groups.set(key, [c.eventos]);
  }
  return [...groups.keys()]
    .sort()
    .map((key) => ({ key, ...medir(groups.get(key) as ConversationEvents[]) }));
}

/**
 * Break down by the many-to-one label key. A conversation with three labels appears in three rows, so the row totals exceed the period total. The screen must say so: measuring a billing ticket requires counting a conversation under every topic it had. Unlike Chatwoot, count distinct conversations, not `taggings` without explanation.
 */
function splitByMany(
  eventsByConversation: ReadonlyMap<string, ConversationEvents>,
  vinculos: readonly { conversationId: string; key: string }[],
): LinhaDeQuebra[] {
  const grupos = new Map<string, ConversationEvents[]>();
  for (const v of vinculos) {
    const eventos = eventsByConversation.get(v.conversationId);
    if (!eventos) continue;
    const atual = grupos.get(v.key);
    if (atual) atual.push(eventos);
    else grupos.set(v.key, [eventos]);
  }
  return [...grupos.keys()]
    .sort()
    .map((chave) => ({ key: chave, ...medir(grupos.get(chave) as ConversationEvents[]) }));
}

export async function loadAttendance(
  tx: TransactionPipe,
  window: Window,
  filter: AttendanceFilter = {},
): Promise<ReportAttendance> {
  return consultar(tx, async (tx) => {
    const recorte = [
      isNotNull(conversation.encerradaEm),
      gte(conversation.encerradaEm, window.start),
      lt(conversation.encerradaEm, window.end),
      filter.queueId ? eq(conversation.filaId, filter.queueId) : undefined,
      filter.agentId ? eq(conversation.agentId, filter.agentId) : undefined,
    ].filter((c) => c !== undefined);

    // Run the two queries IN SERIES: inside `comTenant`, parallel execution can
    // lose the transaction's `pipe.tenant_id`.
    const linhas = await tx
      .select({
        id: conversation.id,
        filaNome: queue.nome,
        atendenteNome: user.nome,
        inboxNome: inbox.nome,
      })
      .from(conversation)
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, conversation.agentId))
      .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
      .where(and(...recorte));

    if (linhas.length === 0) {
      const empty = medir([]);
      return {
        geral: empty,
        byQueue: [],
        byAgent: [],
        byInbox: [],
        byLabel: [],
        semEtiqueta: 0,
      };
    }

    // Load events for the same period, not through an ID list: a complete
    // report can contain thousands of conversations.
    const eventos = await tx
      .select({
        conversaId: eventAttendance.conversaId,
        tipo: eventAttendance.tipo,
        em: eventAttendance.em,
        usuarioId: eventAttendance.usuarioId,
        dados: eventAttendance.data,
      })
      .from(eventAttendance)
      .innerJoin(conversation, eq(conversation.id, eventAttendance.conversaId))
      .where(and(...recorte));

    const byConversation = new Map<string, EventAttendance[]>();
    for (const e of eventos) {
      const data = (e.dados ?? {}) as { encerrada_por?: string; closedBy?: string };
      const evento: EventAttendance = {
        conversationId: e.conversaId,
        tipo: e.tipo as TipoEvento,
        em: e.em,
        userId: e.usuarioId,
        closedBy: (data.encerrada_por ?? data.closedBy ?? null) as ClosedBy | null,
      };
      const atual = byConversation.get(e.conversaId);
      if (atual) atual.push(evento);
      else byConversation.set(e.conversaId, [evento]);
    }

    // Fetch labels for those conversations over the same period in one query,
    // serially after the others; it is only useful when there are
    // conversations in the period.
    const vinculos = await tx
      .select({ conversationId: conversationLabel.conversaId, key: etiqueta.nome })
      .from(conversationLabel)
      .innerJoin(etiqueta, eq(etiqueta.id, conversationLabel.etiquetaId))
      .innerJoin(conversation, eq(conversation.id, conversationLabel.conversaId))
      .where(and(...recorte));

    const conversations = linhas.map((l) => ({
      chaves: {
        queue: l.filaNome ?? 'Sem fila',
        agent: l.atendenteNome ?? 'Sem atendente',
        inbox: l.inboxNome,
      },
      eventos: { conversationId: l.id, eventos: byConversation.get(l.id) ?? [] } as ConversationEvents,
    }));

    const eventsByConversation = new Map(conversations.map((c) => [c.eventos.conversationId, c.eventos]));
    const etiquetadas = new Set(vinculos.map((v) => v.conversationId));

    return {
      geral: medir(conversations.map((c) => c.eventos)),
      byQueue: quebrar(conversations, 'queue'),
      byAgent: quebrar(conversations, 'agent'),
      byInbox: quebrar(conversations, 'inbox'),
      byLabel: splitByMany(eventsByConversation, vinculos),
      semEtiqueta: conversations.filter((c) => !etiquetadas.has(c.eventos.conversationId)).length,
    };
  });
}
