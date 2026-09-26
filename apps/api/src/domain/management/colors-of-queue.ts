/**
 * Queue colors are customer data recognized in Desk, but selection is closed rather than arbitrary hex. Use the extended `@pipe/ui` palette (`TEMA.grafico.serie`), which can carry hue without implying status. Store the token NAME in `fila.cor`, never hex, so palette changes update existing queues without Management color literals.
 */

export const COLORS_OF_QUEUE = [
  { valor: 'grafico-1', rotulo: 'Sage' },
  { valor: 'grafico-2', rotulo: 'Azul profundo' },
  { valor: 'grafico-3', rotulo: 'Ocre' },
  { valor: 'grafico-4', rotulo: 'Terracota' },
  { valor: 'grafico-5', rotulo: 'Verde escuro' },
] as const;

export function corValida(value: string): boolean {
  return COLORS_OF_QUEUE.some((c) => c.valor === value);
}

/**
 * Return the stored color's `var()` or `null` when it is outside the palette. Older seed rows stored raw hex in `fila.cor`; they stay readable as text but get no color dot, since using raw hex would violate the palette. Later registration replaces those values.
 */
export function colorOfQueue(valor: string | null): string | null {
  return valor !== null && corValida(valor) ? `var(--p-${valor})` : null;
}

export function rotuloDaCor(valor: string | null): string {
  if (valor === null) return 'Sem cor';
  return COLORS_OF_QUEUE.find((c) => c.valor === valor)?.rotulo ?? `Fora da paleta (${valor})`;
}
