/** Utilidades de tempo. Tudo em segundos; nada de milissegundos vazando para fora. */

export const SEGUNDO = 1;
export const MINUTO = 60;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;

/** Seconds between instants; may be negative and callers decide how to handle it. */
export function segundosEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / 1000;
}

/** Soma segundos a um instante. */
export function somarSegundos(instante: Date, segundos: number): Date {
  return new Date(instante.getTime() + segundos * 1000);
}


export function ordenarInstantes(instantes: readonly Date[]): Date[] {
  return [...instantes].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Stable identifier comparison by code point. `localeCompare` depends on locale and ICU, so it cannot break distribution ties when results must match across machines.
 */
export function compararIdentificador(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
