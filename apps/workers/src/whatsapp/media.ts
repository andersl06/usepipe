/**
 * Validate media before calling Meta. Source: `referencias-blip/pesquisa/regras-blip.md` §1.6, Blip's media-upload policy. Research marks the format list ⚠️ because it changed before. It is a documented DEFAULT, not a fixed invariant: `validateMedia` accepts a policy parameter, so a future per-tenant list can be read from the database. Blip documents 100 MB for documents and 16 MB for video and audio. There is NO documented image size; do not guess one. Images have no size ceiling here, but their format is still validated.
 */

export type TypeMedia = 'imagem' | 'audio' | 'video' | 'documento';

export interface PolicyMedia {
  /** MIME types aceitos por tipo. */
  formatos: Readonly<Record<TypeMedia, readonly string[]>>;
  /** Teto em bytes por tipo. Ausente = sem teto documentado. */
  tamanhoMaximoBytes: Readonly<Partial<Record<TypeMedia, number>>>;
}

const MB = 1024 * 1024;

export const POLICY_MEDIA_DEFAULT: PolicyMedia = {
  formatos: {
    imagem: [
      'image/gif',
      'image/jpeg',
      'image/jpg',
      'image/jfif',
      'image/png',
      'image/svg+xml',
      'image/tiff',
      'image/vnd.dwg',
      'image/webp',
    ],
    audio: [
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
      'audio/amr',
    ],
    video: [
      'video/3gpp',
      'video/avi',
      'video/mpeg',
      'video/mpg',
      'video/mp4',
      'video/mov',
      'video/quicktime',
      'video/m4v',
      'video/wmv',
      'video/webm',
      'video/ogg',
    ],
    documento: [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-outlook',
      'application/zip',
      'application/vnd.rar',
      'application/x-rar-compressed',
      'text/csv',
      'text/html',
      'text/plain',
    ],
  },
  tamanhoMaximoBytes: {
    documento: 100 * MB,
    video: 16 * MB,
    audio: 16 * MB,
  },
};

export interface Media {
  tipo: TypeMedia;
  mime: string;
  bytes: number;
}

export interface FailsMedia {
  codigo: 'midia_formato_recusado' | 'midia_grande_demais';
  texto: string;
}

/** Return `null` for accepted media. Never throw: the caller records failure on the message. */
export function validateMedia(
  media: Media,
  politica: PolicyMedia = POLICY_MEDIA_DEFAULT,
): FailsMedia | null {
  const aceitos = politica.formatos[media.tipo];
  const mime = media.mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!aceitos.includes(mime)) {
    return {
      codigo: 'midia_formato_recusado',
      texto:
        `Formato ${media.mime} não é aceito para ${media.tipo}. ` +
        `Aceitos: ${aceitos.join(', ')}.`,
    };
  }

  const teto = politica.tamanhoMaximoBytes[media.tipo];
  if (teto !== undefined && media.bytes > teto) {
    return {
      codigo: 'midia_grande_demais',
      texto:
        `Arquivo de ${emMegabytes(media.bytes)} MB passa do limite de ` +
        `${emMegabytes(teto)} MB para ${media.tipo}.`,
    };
  }

  return null;
}

function emMegabytes(bytes: number): string {
  return (bytes / MB).toFixed(1).replace('.', ',');
}
