/**
 * Janela de atendimento de 24 horas do WhatsApp.
 *
 * `2026-09-05-pipe-design.md` §4.3: conceito de primeira classe, não detalhe de
 * integração. Governa a tela (texto livre × seletor de template), o custo
 * (categoria de cobrança por mensagem) e o relatório (a janela conta a partir do
 * envio, não pelo dia do calendário).
 *
 * Regras levantadas em `referencias-blip/pesquisa/regras-blip.md` §1.1:
 * - 24 horas corridas a partir da **última mensagem do cliente**;
 * - fora dela, só template pré-aprovado pela Meta;
 * - qualquer mensagem nova do cliente reabre a janela.
 *
 * Preço não entra aqui: a tabela da Meta muda com frequência e é configuração
 * por categoria, nunca constante de código.
 */

import { HORA } from '../comum/time.js';

export const WINDOW_HORAS = 24;
export const WINDOW_SEG = WINDOW_HORAS * HORA;

export type TipoChannel = 'whatsapp_cloud' | 'email' | 'widget';

export type CategoriaTemplate = 'utilidade' | 'marketing' | 'autenticacao';

/** `mensagem.categoria_cobranca` do modelo de dados (§3). */
export type CategoriaCobranca = 'livre' | CategoriaTemplate;

/** O que o Desk pode oferecer ao atendente neste instante. */
export type ModoDeEnvio = 'texto_livre' | 'somente_template';

export interface StateWindow {
  /** `conversa.janela_expira_em`. `null` = canal sem janela. */
  expiraEm: Date | null;
  /** `conversa.janela_aberta_por_mensagem_id`. */
  abertaByMessageId?: string | null;
}

/**
 * Expiração a partir da última mensagem do contato.
 * `null` de entrada devolve `null` — sem mensagem do cliente não há janela.
 */
export function calcularExpiration(contactInUltimaMessage: Date | null): Date | null {
  if (!contactInUltimaMessage) return null;
  return new Date(contactInUltimaMessage.getTime() + WINDOW_SEG * 1000);
}

/** Recalcula a janela a cada mensagem de entrada do contato. */
export function contactRegistrarMessage(em: Date, messageId?: string): StateWindow {
  const state: StateWindow = { expiraEm: calcularExpiration(em) };
  if (messageId) state.abertaByMessageId = messageId;
  return state;
}

/**
 * A janela está aberta?
 *
 * Comparação **estrita**: no exato instante da expiração a janela já está
 * fechada. Empatar a favor do envio é o jeito de tomar erro da Meta depois do
 * envio, que é justamente o que a tela deve evitar.
 */
export function windowAberta(expiraEm: Date | null | undefined, agora: Date): boolean {
  if (!expiraEm) return false;
  return agora.getTime() < expiraEm.getTime();
}

/** Segundos restantes da janela. Zero quando fechada ou inexistente. */
export function segundosRestantes(expiraEm: Date | null | undefined, agora: Date): number {
  if (!expiraEm) return 0;
  return Math.max(0, (expiraEm.getTime() - agora.getTime()) / 1000);
}

/** Conversa perto de expirar — a que a lista do Desk destaca. */
export function pertoDeExpirar(
  expiraEm: Date | null | undefined,
  agora: Date,
  limiarSeg = HORA,
): boolean {
  if (!windowAberta(expiraEm, agora)) return false;
  return segundosRestantes(expiraEm, agora) <= limiarSeg;
}

export interface QueryEnvio {
  channel: TipoChannel;
  expiraEm: Date | null;
  agora: Date;
  /** O que o atendente quer mandar. */
  conteudo: 'texto_livre' | 'template';
  /** Obrigatória quando `conteudo` é `template`. */
  categoriaTemplate?: CategoriaTemplate | null;
}

export type MotivoBloqueio = 'janela_fechada' | 'template_sem_categoria';

export interface EvaluationEnvio {
  permitido: boolean;
  /** O que a tela deve oferecer agora. */
  modo: ModoDeEnvio;
  motivo: MotivoBloqueio | null;
  restanteSeg: number;
  /** Como a mensagem entra no relatório de custo, se for enviada. */
  categoriaCobranca: CategoriaCobranca | null;
  windowDentro: boolean;
}

/**
 * E-mail e widget não têm janela: `janela_expira_em` fica nulo, a regra é do
 * canal e a tela é a mesma.
 */
export function channelTemWindow(channel: TipoChannel): boolean {
  return channel === 'whatsapp_cloud';
}

/**
 * Classificação de custo de uma mensagem de saída.
 *
 * Template sempre cobra pela própria categoria, inclusive dentro da janela —
 * quem define isso é a Meta, não nós. Texto livre dentro da janela é `livre`.
 */
export function classificarCusto(inbound: {
  conteudo: 'texto_livre' | 'template';
  windowDentro: boolean;
  categoriaTemplate?: CategoriaTemplate | null;
}): CategoriaCobranca | null {
  if (inbound.conteudo === 'template') return inbound.categoriaTemplate ?? null;
  return inbound.windowDentro ? 'livre' : null;
}

/**
 * Decide se o envio é permitido, o que a tela deve mostrar e como o custo entra.
 *
 * Fora da janela, o campo de texto livre é substituído pelo seletor de template
 * **com o motivo escrito** — não um erro depois do envio.
 */
export function avaliarEnvio(query: QueryEnvio): EvaluationEnvio {
  const temWindow = channelTemWindow(query.channel);
  const windowDentro = temWindow ? windowAberta(query.expiraEm, query.agora) : true;
  const restanteSeg = temWindow ? segundosRestantes(query.expiraEm, query.agora) : 0;
  const modo: ModoDeEnvio = windowDentro ? 'texto_livre' : 'somente_template';

  if (query.conteudo === 'template') {
    const categoria = query.categoriaTemplate ?? null;
    if (temWindow && !categoria) {
      return {
        permitido: false,
        modo,
        motivo: 'template_sem_categoria',
        restanteSeg,
        categoriaCobranca: null,
        windowDentro,
      };
    }
    return {
      permitido: true,
      modo,
      motivo: null,
      restanteSeg,
      categoriaCobranca: classificarCusto({
        conteudo: 'template',
        windowDentro,
        categoriaTemplate: categoria,
      }),
      windowDentro,
    };
  }

  if (!windowDentro) {
    return {
      permitido: false,
      modo,
      motivo: 'janela_fechada',
      restanteSeg,
      categoriaCobranca: null,
      windowDentro,
    };
  }

  return {
    permitido: true,
    modo,
    motivo: null,
    restanteSeg,
    categoriaCobranca: 'livre',
    windowDentro,
  };
}
