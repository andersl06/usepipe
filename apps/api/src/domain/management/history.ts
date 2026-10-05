import { and, count, desc, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import {
  classifyClosure,
  derivarMarcos,
  segundosEntre,
  type ConversationEvents,
  type ClosedBy,
  type EventAttendance,
  type StatusClosure,
  type TipoEvento,
} from '@pipe/core';
import {
  contact,
  conversation,
  conversationLabel,
  etiqueta,
  eventAttendance,
  queue,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';
import { parentSequentialSql, ticketDe } from './monitoring.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Histórico de conversas encerradas.
 *
 * Mesma regra do monitoramento: o status e os tempos vêm de `evento_atendimento`
 * pelo `@pipe/core`, nunca do campo mutável da conversa.
 */

export interface LineHistory {
  id: string;
  /** `#<sequentialId>`: the ticket number the Desk and the bridge show. */
  ticket: string;
  sequentialId: number;
  parentSequentialId: number | null;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  closedAt: Date | null;
  status: StatusClosure | null;
  esperaSeg: number | null;
  firstResponseSeg: number | null;
  attendanceSeg: number | null;
  labels: string[];
}

export interface HistoryFilter {
  queueId?: string | undefined;
  agentId?: string | undefined;
  labelId?: string | undefined;
  /** Ticket numbers as typed ("#42"; a legacy "#A1B2C3" still matches the end of the id); a row matches any of them. */
  tickets?: readonly string[] | undefined;
  /** Part of the contact name. */
  contact?: string | undefined;
}

/** One page of the result: the SQL window, never a client-side slice. */
export interface HistoryWindow {
  limit: number;
  offset: number;
}

/** Escapa os curingas do LIKE com `!` (usar `escape '!'` na consulta): a barra invertida não chega intacta ao Postgres por este driver. */
export const likeLiteral = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

export interface Catalogos {
  queues: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

export async function carregarCatalogos(tx: TransactionPipe): Promise<Catalogos> {
  return consultar(tx, async (tx) => ({
    queues: await tx.select({ id: queue.id, name: queue.nome }).from(queue).orderBy(queue.order),
    agents: await tx
      .select({ id: user.id, name: user.nome })
      .from(user)
      .where(eq(user.ativo, true))
      .orderBy(user.nome),
    labels: await tx
      .select({ id: etiqueta.id, name: etiqueta.nome })
      .from(etiqueta)
      .orderBy(etiqueta.nome),
  }));
}

export async function loadHistory(
  tx: TransactionPipe,
  window: Window,
  filter: HistoryFilter = {},
  pagina: HistoryWindow = { limit: 50, offset: 0 },
): Promise<{ linhas: LineHistory[]; total: number }> {
  return consultar(tx, async (tx) => {
    const termosTicket = (filter.tickets ?? [])
      .map((t) => t.replace(/^#/, '').trim().toUpperCase())
      .filter(Boolean);
    const contato = filter.contact?.trim();
    const where = and(
      isNotNull(conversation.encerradaEm),
      gte(conversation.encerradaEm, window.start),
      lt(conversation.encerradaEm, window.end),
      filter.queueId ? eq(conversation.filaId, filter.queueId) : undefined,
      filter.agentId ? eq(conversation.agentId, filter.agentId) : undefined,
      filter.labelId
        ? inArray(
            conversation.id,
            tx
              .select({ id: conversationLabel.conversaId })
              .from(conversationLabel)
              .where(eq(conversationLabel.etiquetaId, filter.labelId)),
          )
        : undefined,
      termosTicket.length > 0
        ? or(
            ...termosTicket.map((t) =>
              /^\d+$/.test(t)
                ? sql`${conversation.sequentialNumber} = ${Number(t)}`
                : sql`upper(right(replace(${conversation.id}::text, '-', ''), 6)) like ${`%${likeLiteral(t)}%`} escape '!'`,
            ),
          )
        : undefined,
      contato ? sql`${contact.nome} ilike ${`%${likeLiteral(contato)}%`} escape '!'` : undefined,
    );

    const base = tx
      .select({
        id: conversation.id,
        sequentialId: conversation.sequentialNumber,
        parentSequentialId: parentSequentialSql,
        encerradaEm: conversation.encerradaEm,
        filaNome: queue.nome,
        atendenteNome: user.nome,
        contatoNome: contact.nome,
      })
      .from(conversation)
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, conversation.agentId))
      .leftJoin(contact, eq(contact.id, conversation.contatoId));

    const [{ n: total = 0 } = {}] = await tx
      .select({ n: count() })
      .from(conversation)
      .leftJoin(contact, eq(contact.id, conversation.contatoId))
      .where(where);

    const page = await base
      .where(where)
      .orderBy(desc(conversation.encerradaEm), desc(conversation.id))
      .limit(pagina.limit)
      .offset(pagina.offset);
    const ids = page.map((c) => c.id);
    if (ids.length === 0) return { linhas: [], total };

    const eventos = await tx
      .select({
        conversaId: eventAttendance.conversaId,
        tipo: eventAttendance.tipo,
        em: eventAttendance.em,
        usuarioId: eventAttendance.usuarioId,
        dados: eventAttendance.data,
      })
      .from(eventAttendance)
      .where(inArray(eventAttendance.conversaId, ids));

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

    const labelsByConversation = new Map<string, string[]>();
    for (const l of await tx
      .select({ conversaId: conversationLabel.conversaId, nome: etiqueta.nome })
      .from(conversationLabel)
      .innerJoin(etiqueta, eq(etiqueta.id, conversationLabel.etiquetaId))
      .where(inArray(conversationLabel.conversaId, ids))) {
      const atual = labelsByConversation.get(l.conversaId);
      if (atual) atual.push(l.nome);
      else labelsByConversation.set(l.conversaId, [l.nome]);
    }

    const diferenca = (a: Date | null, b: Date | null) => {
      if (!a || !b) return null;
      const s = segundosEntre(a, b);
      return s < 0 ? null : s;
    };

    const linhas: LineHistory[] = page.map((c) => {
      const inbound: ConversationEvents = { conversationId: c.id, eventos: byConversation.get(c.id) ?? [] };
      const marcos = derivarMarcos(inbound);
      return {
        id: c.id,
        ticket: ticketDe(Number(c.sequentialId)),
        sequentialId: Number(c.sequentialId),
        parentSequentialId: c.parentSequentialId === null ? null : Number(c.parentSequentialId),
        contactName: c.contatoNome ?? 'Contato sem nome',
        queueName: c.filaNome,
        agentName: c.atendenteNome,
        closedAt: marcos.encerradaEm ?? c.encerradaEm,
        status: classifyClosure(marcos),
        // Total customer wait runs until the answer, or until closure when unanswered.
        esperaSeg: marcos.firstResponseIn
          ? diferenca(marcos.criadaEm, marcos.firstResponseIn)
          : diferenca(marcos.criadaEm, marcos.encerradaEm),
        firstResponseSeg: diferenca(marcos.atribuidaEm, marcos.firstResponseIn),
        attendanceSeg: diferenca(marcos.firstResponseIn, marcos.encerradaEm),
        labels: labelsByConversation.get(c.id) ?? [],
      };
    });

    return { linhas, total };
  });
}

/**
 * Agrupamento da lista — o lugar onde "relatório" mora agora.
 *
 * Os seis itens mortos do grupo Relatórios prometiam exatamente estes recortes:
 * por fila, por atendente, por etiqueta, por desfecho. Nenhum deles precisa de
 * tela própria, porque é a mesma lista dobrada por uma coluna. É a régua da
 * MARCA: relatório vira tela só quando lê a operação por um eixo que a lista não
 * tem — o caso do Esforço, que conta caractere e áudio.
 *
 * A dobra é feita na página já carregada, e não no SQL, porque `carregarHistorico`
 * já tem teto de LIMITE_HISTORICO linhas: agrupar no banco daria grupos calculados
 * sobre um universo diferente do que a tela mostra, que é pior do que não agrupar.
 */
export const GROUPINGS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'queue', rotulo: 'Fila' },
  { chave: 'agent', rotulo: 'Atendente' },
  { chave: 'status', rotulo: 'Desfecho' },
  { chave: 'etiqueta', rotulo: 'Etiqueta' },
] as const;

export type Grouping = (typeof GROUPINGS)[number]['chave'];

export function groupingValid(value: string | undefined): Grouping {
  return (GROUPINGS.find((a) => a.chave === value)?.chave ?? 'nenhum') as Grouping;
}

export interface GroupHistory {
  titulo: string;
  linhas: LineHistory[];
}

const ROTULO_DESFECHO: Record<string, string> = {
  perdida: 'Perdida',
  abandonada: 'Abandonada',
  finalizada: 'Finalizada',
  fechada: 'Fechada',
};

/**
 * Dobra a lista pela coluna escolhida, preservando a ordem de dentro do grupo.
 *
 * Por etiqueta a conversa aparece em cada etiqueta que tem: a soma dos grupos
 * passa do total de linhas de propósito, porque a pergunta ali é "quantas
 * conversas encostaram nesta etiqueta", não "como reparto o total".
 */
export function groupHistory(
  linhas: readonly LineHistory[],
  by: Grouping,
): GroupHistory[] {
  if (by === 'nenhum') return [{ titulo: '', linhas: [...linhas] }];

  const chavesDe = (l: LineHistory): string[] => {
    if (by === 'queue') return [l.queueName ?? 'Sem fila'];
    if (by === 'agent') return [l.agentName ?? 'Sem atendente'];
    if (by === 'status') {
      return [l.status ? (ROTULO_DESFECHO[l.status] ?? l.status) : 'Sem desfecho'];
    }
    return l.labels.length > 0 ? l.labels : ['Sem etiqueta'];
  };

  const mapa = new Map<string, LineHistory[]>();
  for (const l of linhas) {
    for (const key of chavesDe(l)) {
      const atual = mapa.get(key);
      if (atual) atual.push(l);
      else mapa.set(key, [l]);
    }
  }
  return [...mapa.entries()]
    .map(([titulo, dela]) => ({ titulo, linhas: dela }))
    .sort((a, b) => b.linhas.length - a.linhas.length);
}
