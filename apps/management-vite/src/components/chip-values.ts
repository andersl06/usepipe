/** Characters that close a chip while typing, besides Enter (`bds-input-chips` delimiters). */
const DELIMITERS = /[,;|]/;

/** Split typed text into finished chips and the trailing text still being typed. */
export function splitChipText(text: string): { chips: string[]; rest: string } {
  const parts = text.split(DELIMITERS);
  const rest = parts.pop() ?? '';
  return { chips: parts.map((p) => p.trim()).filter(Boolean), rest };
}

/** Append chips, trimmed, skipping blanks and duplicates. */
export function addChips(current: readonly string[], chips: readonly string[]): string[] {
  const out = [...current];
  for (const chip of chips) {
    const texto = chip.trim();
    if (texto && !out.includes(texto)) out.push(texto);
  }
  return out;
}
