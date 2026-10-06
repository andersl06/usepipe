/*
 * Contacts screen interface rules, copied from the origin's controller (`portal.js`, `users` module): approximate count, the picker's default period, date formatting, and which side each history bubble sits on.
 */
import { TICKET_STATUS_LABELS } from '../../../lib/status-labels';

/** Row label: channel identity first, name as the secondary line; no identity falls back to the name. */
export function contactLabel(row: { identidade: string | null; nome: string | null }): { primary: string; secondary: string | null } {
  if (row.identidade) return { primary: row.identidade, secondary: row.nome };
  return { primary: row.nome ?? '-', secondary: null };
}

/** `{{ $ctrl.totalItems }} Contatos Aproximadamente` / `1 Contato` / `0 Contato`. */
export function countLabel(total: number): string {
  if (total > 1) return `${total} Contatos Aproximadamente`;
  return `${total} Contato`;
}

/** `getFormatedLastInteraction`: `toLocaleString(locale, {year, month, day, hour, minute})`. */
export function formatLastInteraction(data: Date | null | undefined): string {
  if (!data) return '-';
  return data.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `ticket.$day` (moment `L`) e `ticket.$hour` (moment `LT`). */
export function diaEHora(data: Date): { dia: string; hora: string } {
  return {
    dia: data.toLocaleDateString('pt-BR'),
    hora: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** History bubble timestamp: `16/09/2026 - 13:26`. */
export function messageStamp(data: Date): string {
  const { dia, hora } = diaEHora(data);
  return `${dia} - ${hora}`;
}

/** Period picker text: `09 set, 2026 - 00:00`. */
export function formatPeriodLimit(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const { hora } = diaEHora(data);
  return `${dia} ${mes}, ${data.getFullYear()} - ${hora}`;
}

/** Origin's default period: last 7 days, from the start of the first day to the end of the current day. */
export function periodDefault(hoje: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 7);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(hoje);
  fim.setHours(23, 59, 0, 0);
  return { inicio, fim };
}

/** In the origin the contact sits on the right (`.right`) and the bot/agent on the left, with a photo. */
export function messageSide(direction: string): 'direita' | 'esquerda' {
  return direction === 'entrada' ? 'direita' : 'esquerda';
}

/** `modules.application.detail.attendance.history.<statusName>` traduzido para o estado do Pipe. */
export function rotuloDoStatus(state: string): string {
  return TICKET_STATUS_LABELS[state] ?? state;
}

/** `getChannelNameFromSource`: nome do canal a partir da origem. */
export function channelLabel(tipo: string, nome: string): string {
  const rotulos: Record<string, string> = {
    whatsapp_cloud: 'WhatsApp',
    email: 'E-mail',
    widget: 'Pipe Chat',
  };
  return rotulos[tipo] ?? nome;
}

/** When opening the detail view, the active ticket is the one from the URL (`?ticketId`) or the most recent one. */
export function ticketAtivo<T extends { id: string }>(
  tickets: T[],
  ticketId?: string,
): T | undefined {
  return tickets.find((item) => item.id === ticketId) ?? tickets[0];
}

/** Text shown on controls whose capability Pipe does not have (no backend behind them). */
export const NAO_DISPONIVEL = 'não disponível no Pipe';
