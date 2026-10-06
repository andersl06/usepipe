import type { VersionOfFlow } from '@pipe/contracts';

/**
 * "VERSÃ•ES PUBLICADAS" (F-2.1): the last 10 published versions, from the newest to the oldest, and the
 * `dd/MM/yyyy - HH:mm:ss` date shown on each card.
 */

/** A `VersionOfFlow` known to have been published â€” `publicadaEm` narrowed from `string | null`. */
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

/** Limits of the Blip "Nomear versão" modal (`@pipe/contracts`: VERSION_TITLE_MAX / VERSION_DESCRIPTION_MAX). */
export const TITLE_MAX = 50;
export const DESCRIPTION_MAX = 200;

/** The title and description of the "Nomear versão" form, trimmed; an empty text clears the field. */
export function normalizeVersionName(titulo: string, descricao: string): { titulo: string; descricao: string } | { error: string } {
  const t = titulo.trim();
  const d = descricao.trim();
  if (t.length > TITLE_MAX) return { error: `O título aceita no máximo ${TITLE_MAX} caracteres.` };
  if (d.length > DESCRIPTION_MAX) return { error: `A descrição aceita no máximo ${DESCRIPTION_MAX} caracteres.` };
  return { titulo: t, descricao: d };
}
