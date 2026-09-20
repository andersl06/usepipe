import type { ConversaDaLista, TipoCanalBanco } from '@pipe/contracts';
import { canalTemJanela, janelaAberta as janelaAbertaDoCore } from '@pipe/core';

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

export type Filtro = 'todos' | 'nao-lidos' | 'em-espera' | 'inativos';

/** Rótulo de cada ficha, com a contagem entre parênteses como lá ("Todos (3)"). */
export const ROTULOS_DE_FILTRO: Record<Filtro, string> = {
  todos: 'Todos',
  'nao-lidos': 'Não lidos',
  'em-espera': 'Em espera',
  inativos: 'Inativos',
};

export const FILTROS: readonly Filtro[] = ['todos', 'nao-lidos', 'em-espera', 'inativos'];

/** Milissegundos de uma hora; a janela livre do WhatsApp é de 24 delas. */
const HORA_MS = 3_600_000;
const JANELA_HORAS = 24;

/**
 * "Não lida" no nosso domínio: a última palavra foi do contato, OU o atendente
 * marcou à mão pelo menu do cartão (`naoLidaEm`, o `UNREAD` da origem). Não
 * guardamos a CONTAGEM de não lidas (só quem falou por último), então a ficha e
 * o negrito do cartão saem daqui.
 */
export function naoLida(c: ConversaDaLista): boolean {
  return c.ultimaMensagemDe === 'contato' || c.naoLidaEm !== null;
}

/** Fixada pelo atendente no topo da lista (`PIN` da origem). */
export function fixada(c: ConversaDaLista): boolean {
  return c.fixadaEm !== null;
}

export function emEspera(c: ConversaDaLista): boolean {
  return c.estado === 'em_espera';
}

/**
 * "Inativo" é a conversa cuja janela de 24 h já fechou: o contato sumiu e o
 * atendente só volta a falar por template. É o mais próximo do `inactive` da
 * referência que o nosso domínio distingue.
 */
export function inativa(c: ConversaDaLista, agora: Date): boolean {
  return !janelaAberta(c.janelaExpiraEm, c.canalTipo, agora);
}

/**
 * A conversa aceita texto livre? A regra é a de `@pipe/core` (`janela/janela.ts`),
 * a mesma que a `api` aplica ao enviar: canal sem janela (e-mail, chat) está
 * sempre aberto; WhatsApp sem `janelaExpiraEm` (o contato nunca falou) está
 * fechado. Instagram segue o WhatsApp.
 */
export function janelaAberta(
  janelaExpiraEm: string | null,
  canalTipo: TipoCanalBanco,
  agora: Date,
): boolean {
  const canal = canalTipo === 'instagram' ? 'whatsapp_cloud' : canalTipo;
  if (!canalTemJanela(canal)) return true;
  return janelaAbertaDoCore(janelaExpiraEm ? new Date(janelaExpiraEm) : null, agora);
}

/** Quanto falta da janela, em horas cheias (para o aviso); `null` se já fechou ou não há janela. */
export function horasRestantes(janelaExpiraEm: string | null, agora: Date): number | null {
  if (!janelaExpiraEm) return null;
  const restante = new Date(janelaExpiraEm).getTime() - agora.getTime();
  if (restante <= 0) return null;
  return Math.min(JANELA_HORAS, Math.ceil(restante / HORA_MS));
}

export function aplicarFiltro(
  conversas: readonly ConversaDaLista[],
  filtro: Filtro,
  agora: Date,
): ConversaDaLista[] {
  switch (filtro) {
    case 'nao-lidos':
      return conversas.filter(naoLida);
    case 'em-espera':
      return conversas.filter(emEspera);
    case 'inativos':
      return conversas.filter((c) => inativa(c, agora));
    default:
      return [...conversas];
  }
}

/** A contagem de cada ficha, sobre a lista INTEIRA (a ficha diz quantos há, não quantos aparecem). */
export function contagens(
  conversas: readonly ConversaDaLista[],
  agora: Date,
): Record<Filtro, number> {
  return {
    todos: conversas.length,
    'nao-lidos': conversas.filter(naoLida).length,
    'em-espera': conversas.filter(emEspera).length,
    inativos: conversas.filter((c) => inativa(c, agora)).length,
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
export function buscar(conversas: readonly ConversaDaLista[], termo: string): ConversaDaLista[] {
  const t = termo.trim();
  if (!t) return [...conversas];
  const nome = semAcento(t).toLowerCase();
  const tel = digitos(t);
  return conversas.filter((c) => {
    const n = semAcento(c.contatoNome ?? '').toLowerCase();
    if (nome && n.includes(nome)) return true;
    if (tel.length >= 2 && (c.contatoTelefone ?? '').replace(/\D/g, '').includes(tel)) return true;
    return false;
  });
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export type Ordem = 'ultima-mensagem' | 'abertura';

/**
 * A ordem da lista. `ultima-mensagem` ("Ver novas mensagens no topo") é o
 * padrão da preferência de lá; `abertura` ("Ver mensagens por ordem de
 * abertura do ticket") é a outra. Conversa sem mensagem usa a abertura.
 *
 * As FIXADAS vêm antes de tudo, entre si na ordem em que foram fixadas (a mais
 * recente por cima) — é o `pinnedTickets` / `notPinnedTickets` da lista da
 * origem (`blip-desk-regras-tecnicas.md` §6.2: "mantém fixados no topo").
 */
export function ordenar(conversas: readonly ConversaDaLista[], ordem: Ordem): ConversaDaLista[] {
  const instante = (c: ConversaDaLista) =>
    new Date(ordem === 'abertura' ? c.criadaEm : (c.ultimaMensagemEm ?? c.criadaEm)).getTime();
  const fixadaEm = (c: ConversaDaLista) => (c.fixadaEm ? new Date(c.fixadaEm).getTime() : null);
  return [...conversas].sort((a, b) => {
    const fa = fixadaEm(a);
    const fb = fixadaEm(b);
    if (fa !== null || fb !== null) {
      if (fa === null) return 1;
      if (fb === null) return -1;
      if (fa !== fb) return fb - fa;
    }
    const d = ordem === 'abertura' ? instante(a) - instante(b) : instante(b) - instante(a);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Nome de exibição do contato — a cadeia de recurso da referência
 * (`docs/pesquisa/blip-desk-medidas.md` §11): nome → telefone → e-mail → o que
 * houver antes do `@`. Nunca fica em branco.
 */
export function nomeDeExibicao(c: {
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail?: string | null;
  contatoId?: string;
}): string {
  if (c.contatoNome?.trim()) return c.contatoNome.trim();
  if (c.contatoTelefone?.trim()) return telefoneInternacional(c.contatoTelefone);
  if (c.contatoEmail?.trim()) return c.contatoEmail.trim();
  return (c.contatoId ?? '').split('@')[0] ?? '';
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
