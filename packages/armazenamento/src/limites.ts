/**
 * Limites de anexo, copiados dos valores REAIS do Blip Desk.
 *
 * Fonte: `supernova.desk.blip.ai/static/settings.<hash>.json`, o mesmo arquivo que
 * gerou `referencias-blip/pesquisa/blip-desk-regras.md` §"Anexos e Mídia". Os valores não foram
 * escolhidos por nós: seguir o que a Blip faz é régua do dono, e aqui ela é literal.
 *
 * Apesar do nome que eles deram (`..._ACCEPT_EXTENSION`), o conteúdo é **tipo MIME**,
 * não extensão. O nome errado ficou lá; aqui a variável se chama pelo que ela é.
 */

/** `MAX_ATTACHMENT_SIZE` = 104857600 bytes = 100 MB. */
export const MAX_BYTES_POR_ARQUIVO = 104_857_600;

/**
 * Áudio e vídeo têm teto MENOR: 16 MB.
 *
 * Isto não está no `settings.json` deles, e é justamente onde o Desk da Blip erra: o
 * cliente valida só os 100 MB de `MAX_ATTACHMENT_SIZE`, então ele **deixa subir um
 * áudio de 80 MB que a plataforma recusa depois** (`referencias-blip/pesquisa/regras-blip.md`
 * §"documentos 100 MB, vídeo e áudio 16 MB"). Recusar cedo, com o número certo, é
 * melhor que aceitar e falhar no fim do upload.
 */
export const MAX_BYTES_AUDIO_VIDEO = 16_777_216;

/** O teto que vale para aquele MIME. */
export function maxBytesDoMime(mime: string): number {
  const tipo = tipoDoMime(mime);
  return tipo === 'audio' || tipo === 'video' ? MAX_BYTES_AUDIO_VIDEO : MAX_BYTES_POR_ARQUIVO;
}

/** `MAX_ATTACHMENT_COUNT` = 10 arquivos por mensagem. */
export const MAX_ARQUIVOS_POR_MENSAGEM = 10;

/**
 * `DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS` = 900000 = 15 minutos.
 *
 * É o modelo deles e é o nosso: o arquivo NUNCA é servido por URL pública adivinhável
 * por id. Sai token com validade, e vencido é vencido.
 */
export const VALIDADE_LINK_MS = 900_000;

/** `IMAGE_ACCEPT_EXTENSION` — o que o seletor de imagem aceita. */
export const MIMES_IMAGEM = [
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
export const MIMES_ARQUIVO = [
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

export type MimeAceito = (typeof MIMES_ARQUIVO)[number];

export function mimeAceito(mime: string): mime is MimeAceito {
  return (MIMES_ARQUIVO as readonly string[]).includes(mime);
}

/**
 * O tipo de mensagem do Pipe para aquele MIME.
 *
 * `svg+xml` cai em `documento` de propósito, e não em `imagem`: SVG é XML executável,
 * e um `<script>` dentro dele vira XSS na tela de quem abrir a "imagem" inline. Ele
 * continua ACEITO — a Blip aceita —, mas nunca é renderizado como imagem por nós.
 */
export function tipoDoMime(mime: string): 'imagem' | 'audio' | 'video' | 'documento' {
  if (mime === 'image/svg+xml') return 'documento';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'documento';
}
