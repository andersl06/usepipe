import type { StateConversation } from '@pipe/contracts';

/**
 * Modo de Espera: só um ticket em atendimento (Open) entra em espera; quem já está em espera sempre pode sair, desde que o ticket continue aberto. `motivo` explica ao atendente por que a ação está desligada.
 */
export function esperaDisponivel(ticket: { state: StateConversation; emStandby: boolean }): {
  habilitada: boolean;
  motivo: string | null;
} {
  if (ticket.state === 'Open') return { habilitada: true, motivo: null };
  if (ticket.state === 'Waiting' || ticket.state === 'Assigned') {
    return {
      habilitada: false,
      motivo: 'O Modo de Espera só vale para ticket em atendimento. Responda ao cliente para iniciar o atendimento.',
    };
  }
  return { habilitada: false, motivo: 'O ticket está encerrado e não pode entrar em Modo de Espera.' };
}
