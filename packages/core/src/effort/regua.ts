/**
 * Deterministic ticket-effort measure from Annex B of `Relatorio_Capacidade_Capital_Escola_90dias.docx`, validated in production and collected by `~/digisac-esforco`, repeated in `2026-09-05-pipe-design.md` §4.4. This is arithmetic, not AI classification. Per-conversation seconds: agent-written characters ÷ 200 per minute; customer-read characters ÷ 1,000 per minute; received audio duration at 1×; recorded audio duration; and, without duration metadata, estimated Opus size at about 16 kbps or 2 KB/s. The original report assumes manually typed text, so canned-response content is excluded from effort and reported separately.
 */

import { MINUTO } from '../comum/time.js';

/** Caracteres por minuto digitados pelo atendente. */
export const CARACTERES_BY_MINUTO_ESCRITA = 200;

/** Caracteres por minuto lidos pelo atendente. */
export const CARACTERES_BY_MINUTO_READ = 1000;

/**
 * Opus audio at about 16 kbps means 16,000 bits/s ÷ 8 = 2,000 bytes/s. The report's "2 KB/s" is decimal, not 2 KiB.
 */
export const BYTES_BY_SEGUNDO_AUDIO = 2000;

export type AutorMessage = 'contato' | 'atendente' | 'bot' | 'sistema';
export type DirectionMessage = 'entrada' | 'saida' | 'interna';
export type TipoMessage =
  | 'texto'
  | 'imagem'
  | 'audio'
  | 'video'
  | 'documento'
  | 'localizacao'
  | 'template';

export interface AttachmentEffort {
  /** Duration in seconds from provider metadata; null when absent. */
  durationSeg?: number | null;
  /** File size used to estimate duration when metadata is absent. */
  bytes?: number | null;
}

export interface MessageEffort {
  conversationId: string;
  em: Date;
  autor: AutorMessage;
  direction: DirectionMessage;
  tipo: TipoMessage;
  /** Texto efetivamente trafegado. */
  conteudo?: string | null;
  /** Agent responsible for the message; bot messages have none. */
  userId?: string | null;
  /** Set when content came from a canned response rather than manual typing. */
  respostaProntaId?: string | null;
  attachment?: AttachmentEffort | null;
}

/** Espelha `esforco_conversa` do modelo de dados (§4). */
export interface EffortConversation {
  conversationId: string;
  agentId: string | null;
  /** Characters manually typed by the agent, excluding canned responses. */
  charsEscritos: number;
  /** Caracteres do cliente lidos pelo atendente. */
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Canned-response characters, reported separately and excluded from effort. */
  charsDeRespostaPronta: number;
  /** Total effort in seconds, excluding canned responses. */
  effortSeg: number;
  /** Effort that canned-response text would add if counted as typing. */
  effortCannedResponseSeg: number;
  /** Audio files recorded with zero duration because both duration metadata and size were missing. */
  audiosSemMetadado: number;
}


export function segundosDeEscrita(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_BY_MINUTO_ESCRITA;
}


export function readSegundos(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_BY_MINUTO_READ;
}

/**
 * Audio duration comes from metadata when available, otherwise estimated from size. Without either, return null rather than inventing a duration.
 */
export function audioDuration(attachment: AttachmentEffort | null | undefined): number | null {
  if (!attachment) return null;
  if (typeof attachment.durationSeg === 'number' && attachment.durationSeg >= 0) return attachment.durationSeg;
  if (typeof attachment.bytes === 'number' && attachment.bytes > 0) return attachment.bytes / BYTES_BY_SEGUNDO_AUDIO;
  return null;
}

/** Conta caracteres de um texto. `null`/vazio conta zero. */
export function contarCaracteres(texto: string | null | undefined): number {
  return texto ? texto.length : 0;
}

/**
 * Apply the measure to a conversation. Departures from the literal spec: agent-written internal notes (`direcao: 'interna'`) count as typing; bot and system messages produce no typing or reading effort; an agent's own outbound audio is speaking rather than listening.
 */
export function calcularEffortConversation(
  messages: readonly MessageEffort[],
  options: { conversationId?: string; agentId?: string | null } = {},
): EffortConversation {
  let charsEscritos = 0;
  let charsLidos = 0;
  let charsDeRespostaPronta = 0;
  let audioOuvidoSeg = 0;
  let audioGravadoSeg = 0;
  let audiosSemMetadado = 0;
  let agentId: string | null = options.agentId ?? null;

  for (const message of messages) {
    if (message.autor === 'atendente' && !agentId && message.userId) {
      agentId = message.userId;
    }

    if (message.autor === 'atendente') {
      if (message.tipo === 'audio') {
        const duration = audioDuration(message.attachment);
        if (duration === null) audiosSemMetadado += 1;
        else audioGravadoSeg += duration;
      } else {
        const caracteres = contarCaracteres(message.conteudo);
        // Canned responses and templates were not manually typed, so exclude them from effort
        // and record them separately as required by the original report.
        const veioPronto = !!message.respostaProntaId || message.tipo === 'template';
        if (veioPronto) charsDeRespostaPronta += caracteres;
        else charsEscritos += caracteres;
      }
      continue;
    }

    if (message.autor === 'contato') {
      if (message.tipo === 'audio') {
        const duration = audioDuration(message.attachment);
        if (duration === null) audiosSemMetadado += 1;
        else audioOuvidoSeg += duration;
      } else {
        charsLidos += contarCaracteres(message.conteudo);
      }
      continue;
    }
  }

  const effortSeg =
    segundosDeEscrita(charsEscritos) +
    readSegundos(charsLidos) +
    audioOuvidoSeg +
    audioGravadoSeg;

  return {
    conversationId: options.conversationId ?? messages[0]?.conversationId ?? '',
    agentId,
    charsEscritos,
    charsLidos,
    audioOuvidoSeg,
    audioGravadoSeg,
    charsDeRespostaPronta,
    effortSeg,
    effortCannedResponseSeg: segundosDeEscrita(charsDeRespostaPronta),
    audiosSemMetadado,
  };
}


export function calcularEffortByConversation(
  messages: readonly MessageEffort[],
): EffortConversation[] {
  const groups = new Map<string, MessageEffort[]>();
  for (const message of messages) {
    const atual = groups.get(message.conversationId);
    if (atual) atual.push(message);
    else groups.set(message.conversationId, [message]);
  }
  return [...groups.keys()]
    .sort()
    .map((conversationId) =>
      calcularEffortConversation(groups.get(conversationId) as MessageEffort[], { conversationId }),
    );
}
