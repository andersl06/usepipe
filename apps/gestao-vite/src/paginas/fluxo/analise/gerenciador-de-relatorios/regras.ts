export const INTERVALOS_RAPIDOS = [7, 30, 60, 90] as const;

/** Mesma conta do Data Extractor (`differenceInDays`), com no máximo 90 dias. */
export function diasDoPeriodo(inicio: string, fim: string): number | null {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  if (!inicio || !fim || Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function periodoValido(inicio: string, fim: string): boolean {
  const dias = diasDoPeriodo(inicio, fim);
  return dias !== null && dias <= 90;
}

export function inicioDoIntervalo(fim: string, dias: number): string {
  const data = new Date(`${fim}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

export function cincoAnosAntes(dia: string): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCFullYear(data.getUTCFullYear() - 5);
  return data.toISOString().slice(0, 10);
}
