import type { ConversationOfList, TypeChannelDatabase } from '@pipe/contracts';
import { channelTemWindow, windowAberta as janelaAbertaDoCore } from '@pipe/core';

/**
 * As regras puras da coluna de atendimentos: as fichas de filtro, a busca, a
 * ordem da lista e a janela de 24 horas. Nenhuma lê o relógio sozinha — quem
 * chama passa o `agora`, e é isso que as deixa testáveis.
 *
 * Os NOMES são os da referência (`~/desk-clone/templates/chat-list.html`: as
 * fichas `all-tickets-chip`, `unread-tickets-chip`, `standby-tickets-chip`,
 * `inactive-tickets-chip`), e a ordem padrão é a preferência `sortChatsBy:
 * 'lastMessageDate'` de `/agents/preferences` (`docs/desk-store.md`).
 */

export type Filter = 'todos' | 'nao-lidos' | 'em-espera' | 'inativos';

/** Rótulo de cada ficha, com a contagem entre parênteses como lá ("Todos (3)"). */
export const ROTULOS_OF_FILTER: Record<Filter, string> = {
  todos: 'Todos',
  'nao-lidos': 'Não lidos',
  'em-espera': 'Em espera',
  inativos: 'Inativos',
};

export const FILTERS: readonly Filter[] = ['todos', 'nao-lidos', 'em-espera', 'inativos'];

/** Milissegundos de uma hora; a janela livre do WhatsApp é de 24 delas. */
const HORA_MS = 3_600_000;
const WINDOW_HORAS = 24;

/**
 * "Não lida" no nosso domínio: a última palavra foi do contato, OU o atendente
 * marcou à mão pelo menu do cartão (`naoLidaEm`, o `UNREAD` da origem). Não
 * guardamos a CONTAGEM de não lidas (só quem falou por último), então a ficha e
 * o negrito do cartão saem daqui.
 */
export function naoLida(c: ConversationOfList): boolean {
  return c.lastMessageFrom === 'contato' || c.naoLidaEm !== null;
}

/** Fixada pelo atendente no topo da lista (`PIN` da origem). */
export function fixada(c: ConversationOfList): boolean {
  return c.fixadaEm !== null;
}

export function emEspera(c: ConversationOfList): boolean {
  return c.estado === 'em_espera';
}

/**
 * "Inativo" é a conversa cuja janela de 24 h já fechou: o contato sumiu e o
 * atendente só volta a falar por template. É o mais próximo do `inactive` da
 * referência que o nosso domínio distingue.
 */
export function inativa(c: ConversationOfList, agora: Date): boolean {
  return !windowAberta(c.janelaExpiraEm, c.canalTipo, agora);
}

/**
 * A conversa aceita texto livre? A regra é a de `@pipe/core` (`janela/janela.ts`),
 * a mesma que a `api` aplica ao enviar: canal sem janela (e-mail, chat) está
 * sempre aberto; WhatsApp sem `janelaExpiraEm` (o contato nunca falou) está
 * fechado. Instagram segue o WhatsApp.
 */
export function windowAberta(
  windowExpiraIn: string | null,
  channelTipo: TypeChannelDatabase,
  agora: Date,
): boolean {
  const channel = channelTipo === 'instagram' ? 'whatsapp_cloud' : channelTipo;
  if (!channelTemWindow(channel)) return true;
  return janelaAbertaDoCore(windowExpiraIn ? new Date(windowExpiraIn) : null, agora);
}

/** Quanto falta da janela, em horas cheias (para o aviso); `null` se já fechou ou não há janela. */
export function horasRestantes(windowExpiraIn: string | null, agora: Date): number | null {
  if (!windowExpiraIn) return null;
  const restante = new Date(windowExpiraIn).getTime() - agora.getTime();
  if (restante <= 0) return null;
  return Math.min(WINDOW_HORAS, Math.ceil(restante / HORA_MS));
}

export function aplicarFilter(
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

/** A contagem de cada ficha, sobre a lista INTEIRA (a ficha diz quantos há, não quantos aparecem). */
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

/** Só dígitos — para comparar telefone digitado com `+55…` guardado. */
function digitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * A busca da coluna: "Busque pelo nome ou telefone..." (placeholder da
 * referência). Nome sem acento e sem caixa; telefone por dígitos, para
 * `(31) 99471` achar `+5531994714471`.
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
 * A ordem da lista. `ultima-mensagem` ("Ver novas mensagens no topo") é o
 * padrão da preferência de lá; `abertura` ("Ver mensagens por ordem de
 * abertura do ticket") é a outra. Conversa sem mensagem usa a abertura.
 *
 * As FIXADAS vêm antes de tudo, entre si na ordem em que foram fixadas (a mais
 * recente por cima) — é o `pinnedTickets` / `notPinnedTickets` da lista da
 * origem (`blip-desk-regras-tecnicas.md` §6.2: "mantém fixados no topo").
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
 * Nome de exibição do contato — a cadeia de recurso da referência
 * (`referencias-blip/pesquisa/blip-desk-medidas.md` §11): nome → telefone → e-mail → o que
 * houver antes do `@`. Nunca fica em branco.
 */
export function displayName(c: {
  contactName: string | null;
  contactTelefone: string | null;
  contactEmail?: string | null;
  contactId?: string;
}): string {
  if (c.contactName?.trim()) return c.contactName.trim();
  if (c.contactTelefone?.trim()) return telefoneInternacional(c.contactTelefone);
  if (c.contactEmail?.trim()) return c.contactEmail.trim();
  return (c.contactId ?? '').split('@')[0] ?? '';
}

/** `+5531994714471` → `+55 31 99471-4471`; o que não for BR de 13 dígitos volta como veio. */
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
