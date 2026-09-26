/**
 * WhatsApp 24-hour service window is a first-class concept (see `2026-09-05-pipe-design.md` §4.3), governing UI choice between free text and templates, billing category, and reporting measured from send time rather than calendar day. Per `referencias-blip/pesquisa/regras-blip.md` §1.1, it lasts 24 elapsed hours from the customer's latest message; outside it, only Meta-approved templates are allowed; each new customer message reopens it. Prices stay outside this code because Meta pricing changes often and is configured per category.
 */

import { HORA } from '../comum/time.js';

export const WINDOW_HOURS = 24;
export const WINDOW_SEG = WINDOW_HOURS * HORA;

export type TypeChannel = 'whatsapp_cloud' | 'email' | 'widget';

export type CategoriaTemplate = 'utilidade' | 'marketing' | 'autenticacao';

/** `mensagem.categoria_cobranca` do modelo de dados (§3). */
export type CategoriaCobranca = 'livre' | CategoriaTemplate;

/** O que o Desk pode oferecer ao atendente neste instante. */
export type ModoDeEnvio = 'texto_livre' | 'somente_template';

export interface StateWindow {
  /** `conversa.janela_expira_em`. `null` = canal sem janela. */
  expiraEm: Date | null;
  /** `conversa.janela_aberta_por_mensagem_id`. */
  openByMessageId?: string | null;
}

/**
 * Expiry from the customer's latest message. Null input returns null: without a customer message there is no window.
 */
export function calculateExpiration(contactInLastMessage: Date | null): Date | null {
  if (!contactInLastMessage) return null;
  return new Date(contactInLastMessage.getTime() + WINDOW_SEG * 1000);
}


export function contactRegisterMessage(em: Date, messageId?: string): StateWindow {
  const state: StateWindow = { expiraEm: calculateExpiration(em) };
  if (messageId) state.openByMessageId = messageId;
  return state;
}

/**
 * Window-open check is STRICT: at the exact expiry instant it is closed. Treating a tie as open would invite a Meta rejection after send, which the UI must prevent.
 */
export function windowOpen(expiraEm: Date | null | undefined, agora: Date): boolean {
  if (!expiraEm) return false;
  return agora.getTime() < expiraEm.getTime();
}

/** Segundos restantes da janela. Zero quando fechada ou inexistente. */
export function segundosRestantes(expiraEm: Date | null | undefined, agora: Date): number {
  if (!expiraEm) return 0;
  return Math.max(0, (expiraEm.getTime() - agora.getTime()) / 1000);
}

/** Conversation close to expiry, highlighted in the Desk list. */
export function pertoDeExpirar(
  expiraEm: Date | null | undefined,
  agora: Date,
  limiarSeg = HORA,
): boolean {
  if (!windowOpen(expiraEm, agora)) return false;
  return segundosRestantes(expiraEm, agora) <= limiarSeg;
}

export interface QuerySending {
  channel: TypeChannel;
  expiraEm: Date | null;
  agora: Date;
  /** O que o atendente quer mandar. */
  conteudo: 'texto_livre' | 'template';
  /** Required when `conteudo` is `template`. */
  categoriaTemplate?: CategoriaTemplate | null;
}

export type MotivoBloqueio = 'janela_fechada' | 'template_sem_categoria';

export interface EvaluationSending {
  permitido: boolean;

  modo: ModoDeEnvio;
  motivo: MotivoBloqueio | null;
  restanteSeg: number;
  /** Billing-report category if the message is sent. */
  categoriaCobranca: CategoriaCobranca | null;
  withinWindow: boolean;
}

/**
 * Email and widget have no window, so `janela_expira_em` is null; the channel rule and UI remain the same.
 */
export function channelHasWindow(channel: TypeChannel): boolean {
  return channel === 'whatsapp_cloud';
}

/**
 * Classify outbound message cost. Meta charges templates by their own category even inside the service window; free text inside the window is `livre`.
 */
export function classificarCusto(inbound: {
  conteudo: 'texto_livre' | 'template';
  withinWindow: boolean;
  categoriaTemplate?: CategoriaTemplate | null;
}): CategoriaCobranca | null {
  if (inbound.conteudo === 'template') return inbound.categoriaTemplate ?? null;
  return inbound.withinWindow ? 'livre' : null;
}

/**
 * Decide whether sending is allowed, what the UI should offer, and how cost is classified. Outside the window, replace free-text input with a template selector and an explicit reason, rather than failing only after send.
 */
export function avaliarEnvio(query: QuerySending): EvaluationSending {
  const hasWindow = channelHasWindow(query.channel);
  const withinWindow = hasWindow ? windowOpen(query.expiraEm, query.agora) : true;
  const restanteSeg = hasWindow ? segundosRestantes(query.expiraEm, query.agora) : 0;
  const modo: ModoDeEnvio = withinWindow ? 'texto_livre' : 'somente_template';

  if (query.conteudo === 'template') {
    const categoria = query.categoriaTemplate ?? null;
    if (hasWindow && !categoria) {
      return {
        permitido: false,
        modo,
        motivo: 'template_sem_categoria',
        restanteSeg,
        categoriaCobranca: null,
        withinWindow,
      };
    }
    return {
      permitido: true,
      modo,
      motivo: null,
      restanteSeg,
      categoriaCobranca: classificarCusto({
        conteudo: 'template',
        withinWindow,
        categoriaTemplate: categoria,
      }),
      withinWindow,
    };
  }

  if (!withinWindow) {
    return {
      permitido: false,
      modo,
      motivo: 'janela_fechada',
      restanteSeg,
      categoriaCobranca: null,
      withinWindow,
    };
  }

  return {
    permitido: true,
    modo,
    motivo: null,
    restanteSeg,
    categoriaCobranca: 'livre',
    withinWindow,
  };
}
