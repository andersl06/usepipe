/**
 * Splits a knowledge document into passages (`trecho_conhecimento`) for search (P15). Passages
 * follow paragraphs: consecutive paragraphs are joined up to `CHUNK_TARGET` characters, and a
 * paragraph longer than `CHUNK_MAX` is cut at sentence ends (or hard, as a last resort). Each
 * passage stands alone for the model, so no text is dropped or merged across a hard cut.
 */

export const CHUNK_TARGET = 900;
export const CHUNK_MAX = 1_400;

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_MAX) return [paragraph];
  const out: string[] = [];
  let current = '';
  const sentences = paragraph.split(/(?<=[.!?;:])\s+/);
  for (const sentence of sentences) {
    for (let rest = sentence; rest.length > 0; ) {
      const piece = rest.slice(0, CHUNK_MAX);
      rest = rest.slice(CHUNK_MAX);
      if (current && current.length + 1 + piece.length > CHUNK_TARGET) {
        out.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

export function chunkText(body: string): string[] {
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim())
    .filter(Boolean)
    .flatMap(splitLong);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + 2 + paragraph.length > CHUNK_TARGET) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
