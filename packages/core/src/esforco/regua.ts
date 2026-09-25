/**
 * Régua determinística de esforço de atendimento.
 *
 * Origem: Anexo B do `Relatorio_Capacidade_Capital_Escola_90dias.docx`, já
 * validado em produção e coletado por `~/digisac-esforco`. Repetida em
 * `2026-09-05-pipe-design.md` §4.4. Não é classificação por IA: é conta.
 *
 * B.1 — esforço por conversa (em segundos):
 *  - caracteres escritos pelo atendente ÷ 200 por minuto (digitação)
 *  - caracteres recebidos do cliente ÷ 1.000 por minuto (leitura)
 *  - duração dos áudios recebidos (escuta em 1×)
 *  - duração dos áudios gravados (fala)
 *  - áudio sem metadado de duração: estimado pelo tamanho, Opus ~16 kbps → 2 KB/s
 *
 * Ressalva do relatório original, que o produto precisa expor: a régua assume
 * texto digitado à mão. Por isso o conteúdo vindo de resposta pronta sai do
 * esforço e vai para coluna separada.
 */

import { MINUTO } from '../comum/tempo.js';

/** Caracteres por minuto digitados pelo atendente. */
export const CARACTERES_BY_MINUTO_ESCRITA = 200;

/** Caracteres por minuto lidos pelo atendente. */
export const CARACTERES_BY_MINUTO_READ = 1000;

/**
 * Bytes por segundo de áudio Opus a ~16 kbps.
 * 16.000 bits/s ÷ 8 = 2.000 bytes/s. O "2 KB/s" do relatório é decimal, não 2 KiB.
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
  /** Duração em segundos vinda do metadado do provedor. `null` quando não veio. */
  durationSeg?: number | null;
  /** Tamanho do arquivo, usado para estimar duração quando falta metadado. */
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
  /** Atendente responsável pela mensagem (mensagem de bot não tem). */
  userId?: string | null;
  /** Preenchido quando o corpo veio de resposta pronta — não foi digitado à mão. */
  respostaProntaId?: string | null;
  attachment?: AttachmentEffort | null;
}

/** Espelha `esforco_conversa` do modelo de dados (§4). */
export interface EffortConversation {
  conversationId: string;
  agentId: string | null;
  /** Caracteres digitados à mão pelo atendente (já sem resposta pronta). */
  charsEscritos: number;
  /** Caracteres do cliente lidos pelo atendente. */
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Caracteres que vieram de resposta pronta — coluna separada, fora do esforço. */
  charsDeRespostaPronta: number;
  /** Esforço total em segundos, sem o que veio de resposta pronta. */
  effortSeg: number;
  /** O que a resposta pronta acrescentaria se fosse contada como digitação. */
  effortCannedResponseSeg: number;
  /** Áudios que entraram com duração zero por falta de metadado e de tamanho. */
  audiosSemMetadado: number;
}

/** Segundos de digitação para uma quantidade de caracteres. */
export function segundosDeEscrita(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_BY_MINUTO_ESCRITA;
}

/** Segundos de leitura para uma quantidade de caracteres. */
export function readSegundos(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_BY_MINUTO_READ;
}

/**
 * Duração de um áudio: metadado quando existe, estimativa por tamanho quando não.
 * Sem nenhum dos dois, devolve `null` — a régua não inventa duração.
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
 * Aplica a régua sobre as mensagens de uma conversa.
 *
 * Decisões onde a spec não é literal:
 * - nota interna (`direcao: 'interna'`) escrita pelo atendente **conta** como
 *   digitação: o atendente digitou;
 * - mensagem de bot ou de sistema não gera esforço nenhum — nem de escrita, nem
 *   de leitura, porque ninguém a digitou nem precisou lê-la para atender;
 * - o atendente não "ouve" o próprio áudio: áudio de saída é fala, não escuta.
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
        // Resposta pronta e template não foram digitados à mão: saem do esforço
        // e vão para a coluna separada, como manda a ressalva do relatório.
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
    // bot e sistema: fora da régua.
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

/** Agrupa mensagens por conversa e aplica a régua em cada uma. */
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
