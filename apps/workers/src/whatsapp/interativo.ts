import type { Conteudo } from './cliente.js';

/**
 * Represent a flow question (Blip `select`) as a WhatsApp interactive message. Follow the source channel's "Configurações" settings (`referencias-blip/fichas/FICHA-canal-whatsapp.md` §3): with quick reply enabled, up to three options become buttons; with menu enabled, up to ten become a list; otherwise use numbered text, also stored in `mensagem.conteudo` and shown by Desk. Cloud API limits: button title 20 characters, list-row title 24, body 1024. Do NOT truncate oversized options: clients would read a different answer than the flow expects. Fall back to text for the whole question.
 */

export const LIMITE_QUICK_REPLY = 3;
export const LIMITE_MENU = 10;
const TITULO_BOTAO_MAX = 20;
const TITULO_LINHA_MAX = 24;
const CORPO_MAX = 1024;
/** Label for the button opening the list; Meta requires one of at most 20 characters. */
export const ROTULO_DA_LISTA = 'Ver opções';

export interface PreferencesInteractive {
  quickReply: boolean;
  menu: boolean;
}

/** O que o fluxo guarda em `mensagem.dados.pergunta`. */
export interface QuestionOfFlow {
  texto: string;
  opcoes: string[];
}

export function formatOfQuestion(
  options: number,
  preferences: PreferencesInteractive,
): 'botoes' | 'lista' | 'texto' {
  if (options < 1) return 'texto';
  if (preferences.quickReply && options <= LIMITE_QUICK_REPLY) return 'botoes';
  if (preferences.menu && options <= LIMITE_MENU) return 'lista';
  return 'texto';
}

/** Both switches default to enabled, matching the observed source state. */
export function preferencesInteractiveOf(config: Record<string, unknown> | null): PreferencesInteractive {
  const guardado = (config?.['preferencias'] ?? {}) as Partial<PreferencesInteractive>;
  return { quickReply: guardado.quickReply ?? true, menu: guardado.menu ?? true };
}

/** Return `null` to send text if the format is disabled, an option is too long, or the body is empty or too large. */
export function conteudoDaPergunta(
  pergunta: QuestionOfFlow,
  preferencias: PreferencesInteractive,
): Conteudo | null {
  const format = formatOfQuestion(pergunta.opcoes.length, preferencias);
  if (format === 'texto') return null;
  const texto = pergunta.texto.trim();
  if (!texto || texto.length > CORPO_MAX) return null;
  const limite = format === 'botoes' ? TITULO_BOTAO_MAX : TITULO_LINHA_MAX;
  if (pergunta.opcoes.some((o) => !o.trim() || o.length > limite)) return null;
  // Meta rejects duplicate titles, and the answer would be ambiguous for the flow.
  if (new Set(pergunta.opcoes).size !== pergunta.opcoes.length) return null;
  return { tipo: 'interativo', format, texto, options: pergunta.opcoes };
}
