import type { StateConversation } from '@pipe/contracts';

/** Labels for who ended a conversation (`encerrada` event `encerrada_por`). Unknown or null falls back to "Finalizado". */
const CLOSED_BY_LABELS: Record<string, string> = {
  atendente: 'Finalizado pelo atendente',
  cliente: 'Finalizado pelo cliente',
  inatividade: 'Finalizado por inatividade',
  transferencia: 'Transferido',
  bot: 'Finalizado pelo bot',
};

export function closedByLabel(closedBy: string | null | undefined): string {
  return (closedBy && Object.hasOwn(CLOSED_BY_LABELS, closedBy) ? CLOSED_BY_LABELS[closedBy] : undefined) ?? 'Finalizado';
}

/** Situation text of a conversation in the contact history. */
export function situationLabel(h: { estado: StateConversation; closedBy?: string | null }): string {
  switch (h.estado) {
    case 'encerrada':
      return closedByLabel(h.closedBy);
    case 'na_fila':
      return 'Aguardando';
    case 'atribuida':
      return 'Atribuído';
    default:
      return 'Aberto';
  }
}
