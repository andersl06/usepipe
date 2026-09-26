/**
 * Package errors are explicit. The costliest lesson from case-sync was that eight defects shared one signature: they returned success without doing the work and never appeared in error logs. Nothing here silently returns a partial result.
 */

/** O modelo respondeu, mas fora do formato combinado. Carrega o bruto para poder gravar. */
export class FormatIaError extends Error {
  constructor(
    message: string,
    /** Raw model response for callers to record even when rejecting the result. */
    readonly bruto: unknown,
  ) {
    super(message);
    this.name = 'ErroFormatoIa';
  }
}

/** The call produced no usable response due to refusal, truncation, or network failure. */
export class CallIaError extends Error {
  constructor(
    message: string,
    readonly causa?: unknown,
  ) {
    super(message);
    this.name = 'ErroChamadaIa';
  }
}
