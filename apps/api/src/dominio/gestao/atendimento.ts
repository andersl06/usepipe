import { and, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  contarClosures,
  timeAteFirstResposta,
  attendanceTime,
  respostaTime,
  timeInQueue,
  timeTotalOfEsperaOfCliente,
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
import type { Window } from './janela.js';

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
  chave: string;
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

/** Aplica as cinco métricas de tempo e a contagem de encerramentos a um recorte. */
function medir(conversas: readonly ConversationEvents[]): BlockOfTimes {
  return {
    inQueue: timeInQueue(conversas),
    firstResponse: timeAteFirstResposta(conversas),
    esperaTotal: timeTotalOfEsperaOfCliente(conversas),
    resposta: respostaTime(conversas),
    attendance: attendanceTime(conversas),
    closures: contarClosures(conversas),
    conversations: conversas.length,
  };
}

/**
 * Dobra o conjunto por uma chave e mede cada grupo.
 *
 * `porDimensao` do core resolveria a dobra, mas a assinatura dele devolve
 * `ResultadoMetrica` por grupo, e a quebra da tela precisa das cinco métricas
 * MAIS a contagem de encerramentos no mesmo grupo — que não é
 * `ResultadoMetrica`. Então a dobra é feita aqui e a conta continua toda no
 * core, com a mesma ordenação determinística por chave que ele usa.
 */
type EixoDeQuebra = 'fila' | 'atendente' | 'inbox';

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
 * Quebra por chave de MUITOS PARA UM — a etiqueta.
 *
 * Uma conversa com três etiquetas entra em três linhas, e por isso a soma das
 * linhas passa do total do período. Isso é correto e precisa estar escrito na
 * tela: a pergunta "quanto tempo leva um atendimento de cobrança" não tem como
 * ser respondida sem contar a mesma conversa em cada assunto que ela teve.
 *
 * O que NÃO fazemos é o que o Chatwoot faz: lá a coluna de contagem conta
 * marcações (`taggings`), não conversas distintas, e ninguém avisa.
 */
function quebrarByMuitas(
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
    .map((chave) => ({ chave, ...medir(grupos.get(chave) as ConversationEvents[]) }));
}

export async function loadAttendance(
  tx: TransactionPipe,
  window: Window,
  filter: AttendanceFilter = {},
): Promise<ReportAttendance> {
  return consultar(tx, async (tx) => {
    const recorte = [
      isNotNull(conversation.encerradaEm),
      gte(conversation.encerradaEm, window.inicio),
      lt(conversation.encerradaEm, window.fim),
      filter.queueId ? eq(conversation.filaId, filter.queueId) : undefined,
      filter.agentId ? eq(conversation.agentId, filter.agentId) : undefined,
    ].filter((c) => c !== undefined);

    // Duas consultas em SÉRIE: dentro do `comTenant` nada roda em paralelo, sob
    // pena de o `pipe.tenant_id` da transação sumir.
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
        porFila: [],
        porAtendente: [],
        porInbox: [],
        porEtiqueta: [],
        semEtiqueta: 0,
      };
    }

    // Os eventos vêm pelo mesmo recorte, e não por lista de ids: o período
    // inteiro de um relatório passa fácil dos milhares de conversas.
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

    // As etiquetas das mesmas conversas, pelo mesmo recorte. Uma consulta, em
    // série como as outras — e ela vem depois porque só faz sentido se houver
    // conversa no período.
    const vinculos = await tx
      .select({ conversaId: conversationLabel.conversaId, chave: etiqueta.nome })
      .from(conversationLabel)
      .innerJoin(etiqueta, eq(etiqueta.id, conversationLabel.etiquetaId))
      .innerJoin(conversation, eq(conversation.id, conversationLabel.conversaId))
      .where(and(...recorte));

    const conversations = linhas.map((l) => ({
      chaves: {
        fila: l.filaNome ?? 'Sem fila',
        atendente: l.atendenteNome ?? 'Sem atendente',
        inbox: l.inboxNome,
      },
      eventos: { conversationId: l.id, eventos: byConversation.get(l.id) ?? [] } as ConversationEvents,
    }));

    const eventsByConversation = new Map(conversations.map((c) => [c.eventos.conversationId, c.eventos]));
    const etiquetadas = new Set(vinculos.map((v) => v.conversaId));

    return {
      geral: medir(conversations.map((c) => c.eventos)),
      porFila: quebrar(conversations, 'fila'),
      porAtendente: quebrar(conversations, 'atendente'),
      porInbox: quebrar(conversations, 'inbox'),
      porEtiqueta: quebrarByMuitas(eventsByConversation, vinculos),
      semEtiqueta: conversations.filter((c) => !etiquetadas.has(c.eventos.conversationId)).length,
    };
  });
}
