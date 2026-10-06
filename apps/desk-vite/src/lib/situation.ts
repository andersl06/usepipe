import { TICKET_STATUS_LABELS, ticketStatusLabel, type StateConversation } from '@pipe/contracts';

export { AGENT_STATUS_LABELS, TICKET_STATUS_LABELS, isClosedTicket } from '@pipe/contracts';

/** Texto de situação do ticket no histórico; valor desconhecido cai no texto cru. */
export function situationLabel(h: { estado: StateConversation; closedBy?: string | null }): string {
  return ticketStatusLabel({ state: h.estado, closedBy: h.closedBy });
}

/** Título do compositor de um ticket fechado: "Ticket encerrado pelo cliente.", "Ticket transferido." */
export function closedTicketTitle(state: StateConversation): string {
  return `Ticket ${TICKET_STATUS_LABELS[state].toLowerCase()}.`;
}
