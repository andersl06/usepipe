/**
 * Types shared by all Pipe rules. Durations are integral or fractional seconds, never `interval` or milliseconds, matching data-model convention in `2026-09-05-modelo-de-dados.md` §1.
 */

/**
 * Standard result for every metric shown in a screen or report. `populacao` is the effective denominator and `excluidas` counts excluded candidates; both are mandatory by product decision (metrics spec §2): "métrica que esconde o próprio denominador não entra neste produto". `soma` is redundant with `valor × populacao` but supports weighted averages across groups without accumulating floating-point rounding error (§5).
 */
export interface ResultadoMetrica {
  /** Mean in seconds, or null when population is zero; never zero merely because data is absent. */
  value: number | null;

  population: number;
  /** Itens candidatos que ficaram fora do denominador. */
  excluidas: number;
  /** Soma dos tempos, em segundos. */
  soma: number;
}


export function resultado(soma: number, population: number, excluidas: number): ResultadoMetrica {
  return {
    value: population > 0 ? soma / population : null,
    population,
    excluidas,
    soma,
  };
}


export function resultEmpty(excluidas = 0): ResultadoMetrica {
  return { value: null, population: 0, excluidas, soma: 0 };
}
