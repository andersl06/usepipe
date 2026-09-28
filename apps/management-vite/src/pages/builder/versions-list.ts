import type { VersionOfFlow } from '@pipe/contracts';

/**
 * "VERSÕES PUBLICADAS" (F-2.1): the last 10 published versions, from the newest to the oldest, and the
 * `dd/MM/yyyy - HH:mm:ss` date shown on each card.
 */

/** A `VersionOfFlow` known to have been published — `publicadaEm` narrowed from `string | null`. */
export type PublishedVersion = VersionOfFlow & { publicadaEm: string };

/** The last 10 published versions (`publicadaEm` set), newest first. */
export function lastPublished(versions: VersionOfFlow[]): PublishedVersion[] {
  return versions
    .filter((v): v is PublishedVersion => v.publicadaEm !== null)
    .sort((a, b) => new Date(b.publicadaEm).getTime() - new Date(a.publicadaEm).getTime())
    .slice(0, 10);
}

/** The most recently published version, or null when nothing has been published yet. */
export function latestPublished(versions: VersionOfFlow[]): PublishedVersion | null {
  return lastPublished(versions)[0] ?? null;
}

/** `dd/MM/yyyy - HH:mm:ss` in the given timezone (Brazil by default). */
export function formatPublishedAt(iso: string, timeZone = 'America/Sao_Paulo'): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hourCycle: 'h23',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(iso));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')}/${parte('year')} - ${parte('hour')}:${parte('minute')}:${parte('second')}`;
}
