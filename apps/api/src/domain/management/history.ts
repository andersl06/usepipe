import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import {
  classificarClosure,
  derivarMarcos,
  segundosEntre,
  type ConversationEvents,
  type ClosedBy,
  type EventAttendance,
  type StatusClosure,
  type TipoEvento,
} from '@pipe/core';
import {
  contact as contact,
  conversa as conversation,
  conversationLabel,
  etiqueta,
  eventAttendance,
  queue,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';
import { ticketDe } from './monitoring.js';

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
  ticket: string;
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
}

export interface Catalogos {
  queues: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

/** Teto de linhas: o histórico é uma tela de consulta, não de exportação. */
export const LIMIT_HISTORY = 200;

export async function carregarCatalogos(tx: TransactionPipe): Promise<Catalogos> {
  return consultar(tx, async (tx) => ({
    filas: await tx.select({ id: queue.id, nome: queue.nome }).from(queue).orderBy(queue.order),
    atendentes: await tx
      .select({ id: user.id, nome: user.nome })
      .from(user)
      .where(eq(user.ativo, true))
      .orderBy(user.nome),
    etiquetas: await tx
      .select({ id: etiqueta.id, nome: etiqueta.nome })
      .from(etiqueta)
      .orderBy(etiqueta.nome),
  }));
}

export async function loadHistory(
  tx: TransactionPipe,
  window: Window,
  filter: HistoryFilter = {},
): Promise<{ linhas: LineHistory[]; truncado: boolean }> {
  return consultar(tx, async (tx) => {
    const recorte = [
      filter.queueId ? eq(conversation.filaId, filter.queueId) : undefined,
      filter.agentId ? eq(conversation.atendenteId, filter.agentId) : undefined,
    ].filter((c) => c !== undefined);

    const base = tx
      .select({
        id: conversation.id,
        encerradaEm: conversation.encerradaEm,
        filaNome: queue.nome,
        atendenteNome: user.nome,
        contatoNome: contact.nome,
      })
      .from(conversation)
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, conversation.atendenteId))
      .leftJoin(contact, eq(contact.id, conversation.contatoId));

    const comEtiqueta = filter.labelId
      ? base.innerJoin(
          conversationLabel,
          and(
            eq(conversationLabel.conversaId, conversation.id),
            eq(conversationLabel.etiquetaId, filter.labelId),
          ),
        )
      : base;

    const cru = await comEtiqueta
      .where(
        and(
          isNotNull(conversation.encerradaEm),
          gte(conversation.encerradaEm, window.start),
          lt(conversation.encerradaEm, window.end),
          ...recorte,
        ),
      )
      .orderBy(desc(conversation.encerradaEm))
      .limit(LIMIT_HISTORY + 1);

    const truncado = cru.length > LIMIT_HISTORY;
    const page = cru.slice(0, LIMIT_HISTORY);
    const ids = page.map((c) => c.id);
    if (ids.length === 0) return { linhas: [], truncado: false };

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
      const data = (e.dados ?? {}) as { closedBy?: string };
      const evento: EventAttendance = {
        conversationId: e.conversaId,
        tipo: e.tipo as TipoEvento,
        em: e.em,
        userId: e.usuarioId,
        encerradaBy: (data.closedBy ?? null) as ClosedBy | null,
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
        ticket: ticketDe(c.id),
        contatoNome: c.contatoNome ?? 'Contato sem nome',
        filaNome: c.filaNome,
        atendenteNome: c.atendenteNome,
        encerradaEm: marcos.encerradaEm ?? c.encerradaEm,
        status: classificarClosure(marcos),
        // Espera total do cliente: com resposta, até ela; sem resposta, até o fim.
        esperaSeg: marcos.firstRespostaIn
          ? diferenca(marcos.criadaEm, marcos.firstRespostaIn)
          : diferenca(marcos.criadaEm, marcos.encerradaEm),
        primeiraRespostaSeg: diferenca(marcos.atribuidaEm, marcos.firstRespostaIn),
        atendimentoSeg: diferenca(marcos.firstRespostaIn, marcos.encerradaEm),
        etiquetas: labelsByConversation.get(c.id) ?? [],
      };
    });

    return { linhas, truncado };
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
export function agruparHistory(
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
