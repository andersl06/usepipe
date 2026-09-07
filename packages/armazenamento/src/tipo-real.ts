/**
 * Carimbo do tipo REAL do arquivo, pelos primeiros bytes.
 *
 * Antivírus não; isto sim — foi a decisão. O motivo é direto: extensão e
 * `Content-Type` do upload são texto que o cliente escreveu, e um `.png` que na
 * verdade é HTML vira XSS na hora em que alguém abre o "anexo" no navegador. O que
 * mandamos para o `Content-Type` na leitura é o que os BYTES dizem, não o que o
 * upload prometeu.
 *
 * A tabela é curta de propósito: cobre os formatos que a Blip aceita e que têm
 * assinatura estável. O que não tem assinatura reconhecível (texto, csv, svg) não é
 * adivinhado — volta `null`, e quem chamou decide, sabendo que não sabe.
 *
 * ponytail: sniffing por magic number de tabela fixa; se um dia entrar formato exótico,
 * troque por `file-type` em vez de crescer a tabela.
 */

interface Assinatura {
  mime: string;
  /** Bytes esperados. `null` em uma posição é curinga. */
  bytes: (number | null)[];
  deslocamento?: number;
}

const ASSINATURAS: Assinatura[] = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // OOXML (docx/xlsx/pptx) e zip têm a MESMA assinatura: é tudo zip. Distinguir
  // exigiria abrir o pacote; para o que precisamos (não é HTML, não é executável),
  // `application/zip` já responde.
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45] },
  { mime: 'video/avi', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x49, 0x20] },
  // `ftyp` na posição 4 é a família ISO-BMFF: mp4, m4v, mov, 3gp e o áudio m4a.
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], deslocamento: 4 },
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

/** O MIME que os bytes revelam, ou `null` quando não há assinatura reconhecível. */
export function tipoReal(dados: Uint8Array): string | null {
  for (const assinatura of ASSINATURAS) {
    const inicio = assinatura.deslocamento ?? 0;
    if (dados.length < inicio + assinatura.bytes.length) continue;
    const bate = assinatura.bytes.every(
      (esperado, i) => esperado === null || dados[inicio + i] === esperado,
    );
    if (bate) return assinatura.mime;
  }
  return null;
}

/**
 * Conteúdo que o navegador executa se for servido inline.
 *
 * HTML é aceito pela Blip e por nós, mas servi-lo com o próprio `Content-Type` no
 * nosso domínio é entregar execução de script na sessão de quem abriu. Estes vão
 * sempre como `application/octet-stream` + `Content-Disposition: attachment`.
 */
const PERIGOSOS_INLINE = new Set(['text/html', 'image/svg+xml', 'application/xhtml+xml']);

export function servirComoAnexo(mime: string): boolean {
  return PERIGOSOS_INLINE.has(mime);
}

/**
 * O MIME com que o arquivo será SERVIDO.
 *
 * Regra: se os bytes dizem uma coisa e o upload disse outra, ganham os bytes. Quando
 * os bytes não dizem nada (texto, csv), fica o declarado — mas só se ele estiver na
 * lista de aceitos, o que quem chama já garantiu.
 */
export function mimeParaServir(declarado: string, dados: Uint8Array): string {
  const real = tipoReal(dados);
  if (real && real !== declarado) return real;
  return real ?? declarado;
}
