import type { StateAgent, StateConversation } from '@pipe/contracts';

/** Mapa único de rótulos em português, indexado pelos valores Blip. */
export const TICKET_STATUS_LABELS: Record<StateConversation, string> = {
  Waiting: 'Aguardando',
  Assigned: 'Atribuído',
  Open: 'Aberto',
  ClosedAttendant: 'Finalizado pelo atendente',
  ClosedClient: 'Finalizado pelo cliente',
  ClosedClientInactivity: 'Finalizado por inatividade',
  Transferred: 'Transferido',
};

export const AGENT_STATUS_LABELS: Record<StateAgent, string> = {
  Online: 'Online',
  Pause: 'Em pausa',
  Invisible: 'Invisível',
  Offline: 'Offline',
};

export function isClosedTicket(state: StateConversation): boolean {
  return state.startsWith('Closed') || state === 'Transferred';
}

/** Texto de situação da conversa; valor desconhecido cai no texto cru. */
export function situationLabel(h: { estado: StateConversation; closedBy?: string | null }): string {
  if (isClosedTicket(h.estado) && h.closedBy === 'bot') return 'Finalizado pelo bot';
  return TICKET_STATUS_LABELS[h.estado] ?? h.estado;
}
