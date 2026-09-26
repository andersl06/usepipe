/**
 * Attachment limits copied from the REAL Blip Desk values.
 *
 * Source: `supernova.desk.blip.ai/static/settings.<hash>.json`, the same file behind `referencias-blip/pesquisa/blip-desk-regras.md` section "Anexos e Mídia". We did not choose these values: Blip parity is the owner's benchmark, and the values here are literal.
 *
 * Despite Blip's name (`..._ACCEPT_EXTENSION`), the contents are **MIME types**, not extensions. Their inaccurate name remains there; our variable names describe the actual data.
 */

/** `MAX_ATTACHMENT_SIZE` = 104857600 bytes = 100 MB. */
export const MAX_BYTES_BY_FILE = 104_857_600;

/**
 * Audio and video have a LOWER limit: 16 MB.
 *
 * This is absent from Blip's `settings.json`, which is where Blip Desk gets it wrong: its client checks only the 100 MB `MAX_ATTACHMENT_SIZE`, allowing an 80 MB audio upload that the platform later rejects (`referencias-blip/pesquisa/regras-blip.md`, section "documentos 100 MB, vídeo e áudio 16 MB"). Rejecting early with the correct limit is better than failing after upload.
 */
export const MAX_BYTES_AUDIO_VIDEO = 16_777_216;


export function maxBytesDoMime(mime: string): number {
  const tipo = tipoDoMime(mime);
  return tipo === 'audio' || tipo === 'video' ? MAX_BYTES_AUDIO_VIDEO : MAX_BYTES_BY_FILE;
}

/** `MAX_ATTACHMENT_COUNT` = 10 arquivos por mensagem. */
export const MAX_FILES_BY_MESSAGE = 10;

/**
 * `DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS` = 900000 = 15 minutes.
 *
 * This is both Blip's model and ours: a file is NEVER served through a public URL guessable by ID. Access uses an expiring token, and expiry is enforced.
 */
export const VALIDITY_LINK_MS = 900_000;

/** `IMAGE_ACCEPT_EXTENSION` — o que o seletor de imagem aceita. */
export const MIME_TYPES_IMAGE = [
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/jfif',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/vnd.dwg',
  'image/webp',
] as const;

/** `ARCHIEVE_ACCEPT_EXTENSION` — o que o seletor de arquivo aceita (inclui as imagens). */
export const MIME_TYPES_FILE = [
  'audio/aac',
  'audio/midi',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/wma',
  'audio/webm',
  'audio/opus',
  'audio/x-aac',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/jfif',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/vnd.dwg',
  'image/webp',
  'video/3gpp',
  'video/avi',
  'video/mpeg',
  'video/mpg',
  'video/mp4',
  'video/mov',
  'video/m4v',
  'video/wmv',
  'video/webm',
  'video/ogg',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-outlook',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'text/csv',
  'text/html',
  'text/plain',
] as const;

export type MimeAceito = (typeof MIME_TYPES_FILE)[number];

export function mimeAceito(mime: string): mime is MimeAceito {
  return (MIME_TYPES_FILE as readonly string[]).includes(mime);
}

/**
 * The Pipe message type for this MIME.
 *
 * `svg+xml` intentionally maps to `documento`, not `imagem`: SVG is executable XML, and a `<script>` inside it becomes XSS for anyone opening the "image" inline. It remains ACCEPTED, as on Blip, but we never render it as an image.
 */
export function tipoDoMime(mime: string): 'imagem' | 'audio' | 'video' | 'documento' {
  if (mime === 'image/svg+xml') return 'documento';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'documento';
}
