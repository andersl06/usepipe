/**
 * Attendance events and five timestamps, per `2026-09-05-metricas-atendimento.md` §1 and `2026-09-05-modelo-de-dados.md` §4. Every metric derives from these events, never mutable conversation fields.
 */

/** Catalog of `evento_atendimento.tipo` from data-model §4. */
export type TipoEvento =
  | 'criada'
  | 'enfileirada'
  | 'atribuida'
  | 'reatribuida'
  | 'transferida_fila'
  | 'primeira_resposta'
  | 'mensagem_entrada'
  | 'mensagem_saida'
  | 'espera_iniciada'
  | 'espera_encerrada'
  | 'sla_alertado'
  | 'sla_estourado'
  | 'encerrada'
  | 'reaberta'
  | 'avaliada'
  | 'pesquisa_respondida';

/** Quem tirou a conversa da tela do atendente. */
export type ClosedBy = 'atendente' | 'cliente' | 'inatividade' | 'transferencia';

export interface EventAttendance {
  conversationId: string;
  tipo: TipoEvento;
  em: Date;
  /** Atendente envolvido, quando houver. Em `mensagem_saida` distingue atendente de bot. */
  userId?: string | null;
  queueId?: string | null;
  /** Em `encerrada`, carrega `encerradaPor`. */
  encerradaBy?: ClosedBy | null;
}

/** Conversation event list, the input unit for every metric. */
export interface ConversationEvents {
  conversationId: string;
  eventos: readonly EventAttendance[];
}

/** Five timestamps from metrics spec §1. */
export interface Marcos {
  conversationId: string;
  criadaEm: Date | null;
  atribuidaEm: Date | null;
  firstRespostaIn: Date | null;
  encerradaEm: Date | null;
  encerradaBy: ClosedBy | null;
  /** Assignment count; reassignment records a new event rather than overwriting the first. */
  assignments: number;
}

function ordenar(eventos: readonly EventAttendance[]): EventAttendance[] {
  // Stable ordering by instant: events sharing a millisecond retain their
  // write order, which is the order in which the `api` emitted them.
  return eventos
    .map((evento, indice) => ({ evento, indice }))
    .sort((a, b) => a.evento.em.getTime() - b.evento.em.getTime() || a.indice - b.indice)
    .map(({ evento }) => evento);
}

/**
 * Derive five timestamps from conversation events. Where the spec leaves latitude: `criadaEm` uses `criada` or falls back to `enfileirada` so a queue-only conversation has a start; `atribuidaEm` is FIRST assignment; `primeiraRespostaEm` uses `primeira_resposta` or first `mensagem_saida` WITH `usuarioId` because bot output is not an agent response; `encerradaEm` is the LAST closure so a reopened conversation records its effective final close.
 */
export function derivarMarcos(conversation: ConversationEvents): Marcos {
  const eventos = ordenar(conversation.eventos);

  let criadaEm: Date | null = null;
  let enfileiradaEm: Date | null = null;
  let atribuidaEm: Date | null = null;
  let firstRespostaIn: Date | null = null;
  let agentInFirstOutput: Date | null = null;
  let encerradaEm: Date | null = null;
  let closedBy: ClosedBy | null = null;
  let assignments = 0;

  for (const evento of eventos) {
    switch (evento.tipo) {
      case 'criada':
        if (criadaEm === null) criadaEm = evento.em;
        break;
      case 'enfileirada':
        if (enfileiradaEm === null) enfileiradaEm = evento.em;
        break;
      case 'atribuida':
      case 'reatribuida':
        assignments += 1;
        if (atribuidaEm === null) atribuidaEm = evento.em;
        break;
      case 'primeira_resposta':
        if (firstRespostaIn === null) firstRespostaIn = evento.em;
        break;
      case 'mensagem_saida':
        if (agentInFirstOutput === null && evento.userId) {
          agentInFirstOutput = evento.em;
        }
        break;
      case 'encerrada':
        encerradaEm = evento.em;
        closedBy = evento.encerradaBy ?? null;
        break;
      case 'reaberta':
        encerradaEm = null;
        closedBy = null;
        break;
      default:
        break;
    }
  }

  return {
    conversationId: conversation.conversationId,
    criadaEm: criadaEm ?? enfileiradaEm,
    atribuidaEm,
    firstRespostaIn: firstRespostaIn ?? agentInFirstOutput,
    encerradaEm,
    encerradaBy: closedBy,
    assignments,
  };
}

export function derivarMarcosDeVarias(conversations: readonly ConversationEvents[]): Marcos[] {
  return conversations.map(derivarMarcos);
}

/**
 * Pairs of customer messages and the next agent message in a conversation. A complete exchange is an inbound customer message followed later by an agent outbound message. Consecutive customer messages count as ONE exchange; its clock starts at the first, when the agent began owing a response.
 */
export function intervalosDeResposta(conversation: ConversationEvents): number[] {
  const eventos = ordenar(conversation.eventos);
  const intervalos: number[] = [];
  let aguardandoDesde: Date | null = null;

  for (const evento of eventos) {
    if (evento.tipo === 'mensagem_entrada') {
      if (aguardandoDesde === null) aguardandoDesde = evento.em;
      continue;
    }
    const agentEhResposta =
      (evento.tipo === 'mensagem_saida' && !!evento.userId) || evento.tipo === 'primeira_resposta';
    if (agentEhResposta && aguardandoDesde !== null) {
      intervalos.push((evento.em.getTime() - aguardandoDesde.getTime()) / 1000);
      aguardandoDesde = null;
    }
  }

  return intervalos;
}
