import type { ConversationOfList, TypeChannelDatabase } from '@pipe/contracts';
import { channelHasWindow, windowOpen as janelaAbertaDoCore } from '@pipe/core';

/**
 * Pure attendance-column rules cover filter chips, search, ordering, and the 24-hour window. Callers pass `agora` instead of these functions reading the clock, which makes them testable. Names mirror `~/desk-clone/templates/chat-list.html` (`all-tickets-chip`, `unread-tickets-chip`, `standby-tickets-chip`, `inactive-tickets-chip`); default ordering mirrors `sortChatsBy: 'lastMessageDate'` in `/agents/preferences` (`docs/desk-store.md`).
 */

export type Filter = 'todos' | 'nao-lidos' | 'em-espera' | 'inativos';


export const LABELS_OF_FILTER: Record<Filter, string> = {
  todos: 'Todos',
  'nao-lidos': 'Não lidos',
  'em-espera': 'Em espera',
  inativos: 'Inativos',
};

export const FILTERS: readonly Filter[] = ['todos', 'nao-lidos', 'em-espera', 'inativos'];


/**
 * A conversation is `Não lida` when the contact sent the latest message or the agent marked it manually through the card menu (`naoLidaEm`, source `UNREAD`). We do not store an unread count, only who spoke last; the chip and card bolding derive from this rule.
 */
export function naoLida(c: ConversationOfList): boolean {
  return c.lastMessageFrom === 'contato' || c.naoLidaEm !== null;
}

/** Fixada pelo atendente no topo da lista (`PIN` da origem). */
export function fixada(c: ConversationOfList): boolean {
  return c.fixadaEm !== null;
}

export function emEspera(c: ConversationOfList): boolean {
  return c.emStandby;
}

/**
 * `Inativo` means the conversation's 24-hour window has closed: the contact stopped replying and the agent can only resume via a template. This is the closest domain state to the reference `inactive`.
 */
export function inativa(c: ConversationOfList, agora: Date): boolean {
  return !windowOpen(c.janelaExpiraEm, c.canalTipo, agora);
}

/**
 * Free-text eligibility follows `@pipe/core` (`janela/janela.ts`) and the `api` send rule: channels without a window (email, chat) are always open; WhatsApp without `janelaExpiraEm` means the contact never spoke and is closed. Instagram follows WhatsApp.
 */
export function windowOpen(
  windowExpiresIn: string | null,
  channelType: TypeChannelDatabase,
  agora: Date,
): boolean {
  const channel = channelType === 'instagram' ? 'whatsapp_cloud' : channelType;
  if (!channelHasWindow(channel)) return true;
  return janelaAbertaDoCore(windowExpiresIn ? new Date(windowExpiresIn) : null, agora);
}

export function applyFilter(
  conversations: readonly ConversationOfList[],
  filter: Filter,
  agora: Date,
): ConversationOfList[] {
  switch (filter) {
    case 'nao-lidos':
      return conversations.filter(naoLida);
    case 'em-espera':
      return conversations.filter(emEspera);
    case 'inativos':
      return conversations.filter((c) => inativa(c, agora));
    default:
      return [...conversations];
  }
}

/** Count each filter chip over the full list, since the chip reports all matching items rather than only visible ones. */
export function contagens(
  conversations: readonly ConversationOfList[],
  agora: Date,
): Record<Filter, number> {
  return {
    todos: conversations.length,
    'nao-lidos': conversations.filter(naoLida).length,
    'em-espera': conversations.filter(emEspera).length,
    inativos: conversations.filter((c) => inativa(c, agora)).length,
  };
}


function digitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * Search list-column contacts by name without accents or case, and by phone digits, so `(31) 99471` matches stored `+5531994714471`. Reference placeholder: `Busque pelo nome ou telefone...`.
 */
export function buscar(conversations: readonly ConversationOfList[], termo: string): ConversationOfList[] {
  const t = termo.trim();
  if (!t) return [...conversations];
  const nome = semAcento(t).toLowerCase();
  const tel = digitos(t);
  return conversations.filter((c) => {
    const n = semAcento(c.contatoNome ?? '').toLowerCase();
    if (nome && n.includes(nome)) return true;
    if (tel.length >= 2 && (c.contatoTelefone ?? '').replace(/\D/g, '').includes(tel)) return true;
    return false;
  });
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export type Order = 'ultima-mensagem' | 'abertura';

/**
 * List ordering: `ultima-mensagem` is the reference default (`Ver novas mensagens no topo`); `abertura` is the other option (`Ver mensagens por ordem de abertura do ticket`). For a conversation without messages, use its opening time. Pinned conversations always precede others and are ordered by pin time, most recent first, as the source `pinnedTickets` / `notPinnedTickets` lists do (`blip-desk-regras-tecnicas.md` §6.2: `mantém fixados no topo`).
 */
export function ordenar(conversations: readonly ConversationOfList[], order: Order): ConversationOfList[] {
  const instante = (c: ConversationOfList) =>
    new Date(order === 'abertura' ? c.criadaEm : (c.ultimaMensagemEm ?? c.criadaEm)).getTime();
  const fixadaEm = (c: ConversationOfList) => (c.fixadaEm ? new Date(c.fixadaEm).getTime() : null);
  return [...conversations].sort((a, b) => {
    const fa = fixadaEm(a);
    const fb = fixadaEm(b);
    if (fa !== null || fb !== null) {
      if (fa === null) return 1;
      if (fb === null) return -1;
      if (fa !== fb) return fb - fa;
    }
    const d = order === 'abertura' ? instante(a) - instante(b) : instante(b) - instante(a);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Reference contact display fallback (`referencias-blip/pesquisa/blip-desk-medidas.md` §11): name, then phone, then email, then the part before `@`. Never return blank.
 */
export function displayName(c: {
  contactName: string | null;
  contactPhone: string | null;
  contactEmail?: string | null;
  contactId?: string;
}): string {
  if (c.contactName?.trim()) return c.contactName.trim();
  if (c.contactPhone?.trim()) return telefoneInternacional(c.contactPhone);
  if (c.contactEmail?.trim()) return c.contactEmail.trim();
  return (c.contactId ?? '').split('@')[0] ?? '';
}

/** Format `+5531994714471` as `+55 31 99471-4471`; return non-Brazilian or non-13-digit input unchanged. */
export function telefoneInternacional(e164: string): string {
  const d = digitos(e164);
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return e164;
}
