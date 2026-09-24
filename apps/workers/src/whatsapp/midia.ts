/**
 * Validação de mídia antes de chamar a Meta.
 *
 * Fonte: `referencias-blip/pesquisa/regras-blip.md` §1.6 (política de upload de mídia da Blip).
 * A pesquisa marca a lista de formatos com ⚠️ — ela já mudou uma vez — então isto é
 * o **padrão documentado**, não uma constante fechada: `validarMidia` aceita uma
 * política por parâmetro, e o dia em que a lista virar configuração por tenant é só
 * ler a linha do banco e passar aqui.
 *
 * Tamanho: a Blip documenta 100 MB para documento e 16 MB para vídeo e áudio. Para
 * imagem **não há número documentado**, e a regra do levantamento é não estimar —
 * então imagem passa sem teto de tamanho, com o formato ainda sendo verificado.
 */

export type TipoMidia = 'imagem' | 'audio' | 'video' | 'documento';

export interface PoliticaMidia {
  /** MIME types aceitos por tipo. */
  formatos: Readonly<Record<TipoMidia, readonly string[]>>;
  /** Teto em bytes por tipo. Ausente = sem teto documentado. */
  tamanhoMaximoBytes: Readonly<Partial<Record<TipoMidia, number>>>;
}

const MB = 1024 * 1024;

export const POLITICA_MIDIA_PADRAO: PoliticaMidia = {
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

export interface Midia {
  tipo: TipoMidia;
  mime: string;
  bytes: number;
}

export interface FalhaMidia {
  codigo: 'midia_formato_recusado' | 'midia_grande_demais';
  texto: string;
}

/** `null` quando a mídia passa. Nunca lança: quem chama grava a falha na mensagem. */
export function validarMidia(
  midia: Midia,
  politica: PoliticaMidia = POLITICA_MIDIA_PADRAO,
): FalhaMidia | null {
  const aceitos = politica.formatos[midia.tipo];
  const mime = midia.mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!aceitos.includes(mime)) {
    return {
      codigo: 'midia_formato_recusado',
      texto:
        `Formato ${midia.mime} não é aceito para ${midia.tipo}. ` +
        `Aceitos: ${aceitos.join(', ')}.`,
    };
  }

  const teto = politica.tamanhoMaximoBytes[midia.tipo];
  if (teto !== undefined && midia.bytes > teto) {
    return {
      codigo: 'midia_grande_demais',
      texto:
        `Arquivo de ${emMegabytes(midia.bytes)} MB passa do limite de ` +
        `${emMegabytes(teto)} MB para ${midia.tipo}.`,
    };
  }

  return null;
}

function emMegabytes(bytes: number): string {
  return (bytes / MB).toFixed(1).replace('.', ',');
}
