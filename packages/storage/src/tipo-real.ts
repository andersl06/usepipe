/**
 * Determine the file's REAL type from its first bytes.
 *
 * The decision was byte sniffing rather than antivirus. Upload extensions and `Content-Type` are client-supplied text; a `.png` that is actually HTML can cause XSS when someone opens the "attachment" in a browser. The response `Content-Type` follows the BYTES, not the upload claim.
 *
 * The table is intentionally short: it covers Blip-accepted formats with stable signatures. Formats without a recognizable signature (text, CSV, SVG) are not guessed: return `null` and let the caller decide while knowing the type is unknown.
 *
 * ponytail: sniffing uses a fixed magic-number table; if an exotic format is needed, use `file-type` instead of growing this table.
 */

interface Assinatura {
  mime: string;

  bytes: (number | null)[];
  offset?: number;
}

const ASSINATURAS: Assinatura[] = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // OOXML (docx/xlsx/pptx) and ZIP have the SAME signature: both are ZIP. Distinguishing them
  // would require opening the archive; for our purpose (it is not HTML or an executable),
  // `application/zip` is sufficient.
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45] },
  { mime: 'video/avi', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x49, 0x20] },
  // `ftyp` at offset 4 identifies the ISO-BMFF family: mp4, m4v, mov, 3gp, and m4a audio.
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];


export function tipoReal(data: Uint8Array): string | null {
  for (const assinatura of ASSINATURAS) {
    const inicio = assinatura.offset ?? 0;
    if (data.length < inicio + assinatura.bytes.length) continue;
    const bate = assinatura.bytes.every(
      (esperado, i) => esperado === null || data[inicio + i] === esperado,
    );
    if (bate) return assinatura.mime;
  }
  return null;
}

/**
 * Content that a browser executes if served inline.
 *
 * Blip and Pipe accept HTML, but serving it with its own `Content-Type` on our domain would allow script execution in the opener's session. Always serve these as `application/octet-stream` with `Content-Disposition: attachment`.
 */
const PERIGOSOS_INLINE = new Set(['text/html', 'image/svg+xml', 'application/xhtml+xml']);

export function serveAsAttachment(mime: string): boolean {
  return PERIGOSOS_INLINE.has(mime);
}

/**
 * The MIME type used to SERVE the file.
 *
 * If the bytes and upload declaration disagree, the bytes win. If the bytes identify no type (text, CSV), retain the declared type, but only if it is accepted, as the caller has already ensured.
 */
export function mimeParaServir(declarado: string, dados: Uint8Array): string {
  const real = tipoReal(dados);
  if (real && real !== declarado) return real;
  return real ?? declarado;
}
