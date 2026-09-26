/**
 * Converts a conversation to a model-readable transcript with speaker, time, and content. Two case-sync lessons shape this: give each line a short label (`m1`, `m2`, etc.) instead of a message UUID, then resolve citations by index, saving tokens and making unknown labels explicit errors; and mark audio without a transcript as untranscribed rather than omitting it. In case-sync, 229 omitted audio clips left a summary confidently describing a conversation no one had read.
 */

export type DirectionMessage = 'entrada' | 'saida' | 'interna';
export type AuthorMessage = 'contato' | 'atendente' | 'bot' | 'sistema';
export type TypeMessage =
  'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'template';

export interface AttachmentTranscription {
  nameFile?: string | null;
  durationSeg?: number | null;
  /** Audio text when already transcribed; otherwise the line says the transcript is missing. */
  transcription?: string | null;
}

/** Espelha o essencial de `mensagem` (§4 do modelo de dados). */
export interface MessageTranscription {
  id: string;
  criadaEm: Date;
  direction: DirectionMessage;
  autorTipo: AuthorMessage;
  autorNome?: string | null;
  tipo: TypeMessage;
  conteudo?: string | null;
  attachment?: AttachmentTranscription | null;
}

export interface TranscriptionRow {
  /** Short label used by the model to cite evidence. */
  rotulo: string;
  messageId: string;
  texto: string;
}

export interface Transcription {

  texto: string;
  linhas: TranscriptionRow[];
  /** `rotulo` → `mensagem.id`, mapping cited evidence back to the database. */
  indice: Record<string, string>;
  truncada: boolean;
  messagesOmitted: number;
  totalMessages: number;
}

export interface OptionsTranscription {
  /** Total character budget for the transcript. */
  maxCaracteres?: number;
  /** Teto por mensagem, antes de qualquer truncamento global. */
  maxCharactersByMessage?: number;
  /**
   * Share of the budget reserved for the beginning when truncating; the remainder goes to the end. The request and outcome are usually at these two ends.
   */
  fractionStart?: number;
}

export const MAX_CARACTERES_PADRAO = 24_000;
export const MAX_CHARACTERS_BY_MESSAGE_DEFAULT = 2_000;
export const FRACTION_START_DEFAULT = 0.4;

const MARCA_CORTE = '…(cortado)';


export function rotuloDoAutor(m: MessageTranscription): string {
  const nome = m.autorNome?.trim();
  switch (m.autorTipo) {
    case 'contato':
      return nome || 'Cliente';
    case 'atendente':
      return nome || 'Atendente';
    case 'bot':
      return nome || 'Bot';
    case 'sistema':
      return 'Sistema';
  }
}

function duration(segundos: number | null | undefined): string {
  return typeof segundos === 'number' && segundos > 0
    ? `${Math.round(segundos)}s`
    : 'duração desconhecida';
}

/** `dd/mm HH:MM` in UTC, avoiding an implicit timezone so transcripts are deterministic. */
export function carimboDeHora(em: Date): string {
  const iso = em.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

/**
 * Resolved message body: audio uses its transcript when available, media becomes a description, and an empty message is identified as empty.
 */
export function messageBody(m: MessageTranscription): string {
  const texto = m.conteudo?.trim() ?? '';
  const file = m.attachment?.nameFile?.trim();

  switch (m.tipo) {
    case 'audio': {
      const transcrito = m.attachment?.transcription?.trim();
      if (transcrito) return `(áudio de ${duration(m.attachment?.durationSeg)}, transcrito) ${transcrito}`;
      return `(áudio de ${duration(m.attachment?.durationSeg)}, NÃO TRANSCRITO — conteúdo desconhecido)`;
    }
    case 'imagem':
    case 'video':
    case 'documento': {
      const rotulo = file ? `${m.tipo}: ${file}` : m.tipo;
      return texto ? `(${rotulo}) ${texto}` : `(${rotulo}, sem legenda)`;
    }
    case 'localizacao':
      return texto ? `(localização) ${texto}` : '(localização)';
    case 'texto':
    case 'template':
      return texto || '(mensagem vazia)';
  }
}

function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  return texto.slice(0, Math.max(0, max - MARCA_CORTE.length)) + MARCA_CORTE;
}


export function montarLinha(
  m: MessageTranscription,
  rotulo: string,
  maxCharactersByMessage: number,
): TranscriptionRow {
  const marcaInterna = m.direction === 'interna' ? ' (nota interna)' : '';
  const cabecalho = `[${rotulo}] ${carimboDeHora(m.criadaEm)} ${rotuloDoAutor(m)}${marcaInterna}: `;
  const corpo = cortar(messageBody(m).replace(/\s+/g, ' ').trim(), maxCharactersByMessage);
  return { rotulo, messageId: m.id, texto: cabecalho + corpo };
}

/**
 * Index only lines retained after truncation. A cited label outside this index is a hallucination that evaluation rejects.
 */
function indexar(linhas: readonly TranscriptionRow[]): Record<string, string> {
  const indice: Record<string, string> = {};
  for (const linha of linhas) indice[linha.rotulo] = linha.messageId;
  return indice;
}

function semTruncar(linhas: TranscriptionRow[]): Transcription {
  return {
    texto: linhas.map((l) => l.texto).join('\n'),
    linhas,
    indice: indexar(linhas),
    truncada: false,
    messagesOmitted: 0,
    totalMessages: linhas.length,
  };
}

/**
 * Normalize the conversation and, if it exceeds the budget, retain its beginning and end while reporting the number of omitted messages. Enforce chronological order here; input order is not trusted.
 */
export function buildTranscription(
  messages: readonly MessageTranscription[],
  options: OptionsTranscription = {},
): Transcription {
  const maxCaracteres = options.maxCaracteres ?? MAX_CARACTERES_PADRAO;
  const maxByMessage = options.maxCharactersByMessage ?? MAX_CHARACTERS_BY_MESSAGE_DEFAULT;
  const fractionStart = options.fractionStart ?? FRACTION_START_DEFAULT;

  const ordenadas = [...messages].sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
  const todas = ordenadas.map((m, i) => montarLinha(m, `m${i + 1}`, maxByMessage));

  const total = todas.reduce((soma, l) => soma + l.texto.length + 1, 0);
  if (total <= maxCaracteres || todas.length <= 2) return semTruncar(todas);

  const budgetStart = Math.floor(maxCaracteres * fractionStart);
  const budgetEnd = maxCaracteres - budgetStart;

  let fimDoInicio = 0;
  let gasto = 0;
  while (fimDoInicio < todas.length) {
    const custo = todas[fimDoInicio]!.texto.length + 1;
    if (fimDoInicio > 0 && gasto + custo > budgetStart) break;
    gasto += custo;
    fimDoInicio++;
  }

  let inicioDoFim = todas.length;
  gasto = 0;
  while (inicioDoFim > fimDoInicio) {
    const custo = todas[inicioDoFim - 1]!.texto.length + 1;
    if (inicioDoFim < todas.length && gasto + custo > budgetEnd) break;
    gasto += custo;
    inicioDoFim--;
  }

  const omitidas = Math.max(0, inicioDoFim - fimDoInicio);
  if (omitidas === 0) return semTruncar(todas);

  const inicio = todas.slice(0, fimDoInicio);
  const fim = todas.slice(inicioDoFim);
  const texto = [
    ...inicio.map((l) => l.texto),
    `[… ${omitidas} mensagens omitidas do meio da conversa …]`,
    ...fim.map((l) => l.texto),
  ].join('\n');

  const linhas = [...inicio, ...fim];
  return {
    texto,
    linhas,
    indice: indexar(linhas),
    truncada: true,
    messagesOmitted: omitidas,
    totalMessages: todas.length,
  };
}
