/** Mapa único da Gestão: valores de status da Blip para o texto exibido (D-01). */
export const TICKET_STATUS_LABELS: Record<string, string> = {
  Waiting: 'Na fila',
  Assigned: 'Atribuído',
  Open: 'Em atendimento',
  ClosedAttendant: 'Atendido',
  ClosedClient: 'Atendido',
  ClosedClientInactivity: 'Atendido',
  Transferred: 'Atendido',
};

export const AGENT_STATUS_LABELS: Record<string, string> = {
  Online: 'Online',
  Pause: 'Em Pausa',
  Invisible: 'Invisível',
  Offline: 'Offline',
};
