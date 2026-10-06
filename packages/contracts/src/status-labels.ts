import type { StateAgent, StateConversation } from './desk.js';

/**
 * Texto em português dos estados do ticket e do atendente, escrito uma vez para Desk, Gestão e CRM. As chaves são os valores Blip; o texto de cada estado fechado diz quem encerrou, no masculino ("Ticket encerrado pelo cliente").
 */
export const TICKET_STATUS_LABELS: Record<StateConversation, string> = {
  Waiting: 'Na fila',
  Assigned: 'Atribuído',
  Open: 'Em atendimento',
  ClosedAttendant: 'Encerrado pelo atendente',
  ClosedClient: 'Encerrado pelo cliente',
  ClosedClientInactivity: 'Encerrado por inatividade',
  Transferred: 'Transferido',
};

/** Ticket aberto cujo atendimento está suspenso (`emStandby`). */
export const STANDBY_LABEL = 'Em espera';

/** Ticket encerrado pelo próprio bot, quando o fechamento vem com `closedBy = 'bot'`. */
export const CLOSED_BY_BOT_LABEL = 'Encerrado pelo bot';

export const AGENT_STATUS_LABELS: Record<StateAgent, string> = {
  Online: 'Online',
  Pause: 'Pausa',
  Invisible: 'Invisível',
  Offline: 'Offline',
};

/** Valores de status do atendente que o monitoramento aceita como filtro (Offline não aparece lá). */
export const AGENT_STATUS_FILTER_VALUES = ['Online', 'Pause', 'Invisible'] as const satisfies readonly StateAgent[];

/** Estados em que o ticket não recebe mais mensagens (a Blip trata a transferência como fechamento). */
export function isClosedTicket(state: StateConversation): boolean {
  return state.startsWith('Closed') || state === 'Transferred';
}

/**
 * Texto de situação do ticket. Em espera só vale para ticket aberto; fechado pelo bot tem texto próprio; estado desconhecido volta como veio.
 */
export function ticketStatusLabel(ticket: {
  state: string;
  standby?: boolean | null;
  closedBy?: string | null;
}): string {
  const state = ticket.state as StateConversation;
  if (state === 'Open' && ticket.standby) return STANDBY_LABEL;
  if (isClosedTicket(state) && ticket.closedBy === 'bot') return CLOSED_BY_BOT_LABEL;
  return TICKET_STATUS_LABELS[state] ?? ticket.state;
}

/** Texto de status do atendente; valor desconhecido volta como veio. */
export function agentStatusLabel(state: string): string {
  return AGENT_STATUS_LABELS[state as StateAgent] ?? state;
}

/** Número do ticket como aparece em todas as telas: `#` + `sequentialId`. */
export function ticketNumber(sequentialId: number): string {
  return `#${sequentialId}`;
}
