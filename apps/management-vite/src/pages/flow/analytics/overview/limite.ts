/** Longest custom range, in days, the analytics API accepts for Overview and Journey. */
export const MAX_PERIOD_DAYS = 90;

/** Earliest start for a range ending on `end` (YYYY-MM-DD), so the range is at most MAX_PERIOD_DAYS long. */
export function minStartOfPeriod(end: string): string {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (MAX_PERIOD_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

export const PERIOD_LIMIT_NOTICE = `O período é limitado a ${MAX_PERIOD_DAYS} dias para este relatório.`;
