/**
 * A validação do LOTE de anexos antes de subir — o laço de
 * `blip-desk-regras-tecnicas.md` §3.3, por arquivo e nesta ordem: tipo vazio,
 * formato, tamanho, quantidade. Lá cada falha vira um banner e a de quantidade
 * aborta o laço inteiro; aqui qualquer falha recusa o lote inteiro, porque
 * uma mensagem por arquivo já mandada e outra recusada deixaria o cliente com
 * metade dos arquivos.
 *
 * Os números são os de `@pipe/armazenamento` (`MAX_ARQUIVOS_POR_MENSAGEM`,
 * `MAX_BYTES_POR_ARQUIVO`, `MAX_BYTES_AUDIO_VIDEO`), copiados em vez de
 * importados porque aquele pacote carrega o backend em disco (`node:fs`) no
 * mesmo índice e não roda no navegador. Quem manda é o servidor de todo modo:
 * `POST /v1/anexos` confere tipo pelos BYTES e tamanho pelo tipo real, e o
 * lote só vira mensagem depois de todos passarem lá.
 */

/** `MAX_ATTACHMENT_COUNT` = 10 — `MAX_ARQUIVOS_POR_MENSAGEM`. */
export const MAX_ARQUIVOS_POR_ENVIO = 10;
/** `MAX_ATTACHMENT_SIZE` = 100 MB — `MAX_BYTES_POR_ARQUIVO`. */
export const MAX_BYTES_POR_ARQUIVO = 104_857_600;
/** 16 MB para áudio e vídeo — `MAX_BYTES_AUDIO_VIDEO`; a Meta recusa acima disso. */
export const MAX_BYTES_AUDIO_VIDEO = 16_777_216;

/** O que a tela precisa saber de um arquivo — o `File` do navegador, sem o corpo. */
export interface ArquivoDoLote {
  name: string;
  type: string;
  size: number;
}

function tetoDe(mime: string): number {
  return mime.startsWith('audio/') || mime.startsWith('video/')
    ? MAX_BYTES_AUDIO_VIDEO
    : MAX_BYTES_POR_ARQUIVO;
}

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 1);
}

/**
 * O motivo de recusar o lote, ou `null` quando ele pode subir. Sempre cita o
 * arquivo: com dez na seleção, "grande demais" sem nome não ajuda ninguém.
 */
export function recusaDoLote(arquivos: readonly ArquivoDoLote[]): string | null {
  if (arquivos.length === 0) return 'Escolha ao menos um arquivo.';
  if (arquivos.length > MAX_ARQUIVOS_POR_ENVIO) {
    return `São no máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio; você escolheu ${arquivos.length}. Nenhum arquivo foi enviado.`;
  }
  for (const f of arquivos) {
    if (f.size === 0) return `"${f.name}" está vazio. Nenhum arquivo foi enviado.`;
    const teto = tetoDe(f.type);
    if (f.size > teto) {
      return `"${f.name}" tem ${mb(f.size)} MB e o limite para este tipo é ${mb(teto)} MB. Nenhum arquivo foi enviado.`;
    }
  }
  return null;
}
