import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function loadWords(file: string): Set<string> {
  return new Set(
    readFileSync(new URL(file, import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map((word) => word.trim())
      .filter(Boolean),
  );
}

const PT_LEXICON = loadWords('./pt-lexicon.txt');

export const EN_ALLOW = new Set([
  'status', 'total', 'normal', 'email', 'global', 'local', 'final', 'real', 'social',
  'regional', 'animal', 'capital', 'legal', 'original', 'manual', 'visual', 'formal',
  'principal', 'id', 'ok', 'api', 'url', 'http', 'ws', 'db', 'sql', 'v1', 'pipe',
  'blip', 'meta', 'whatsapp', 'instagram', 'messenger', 'desk', 'vite', 'crm', 'twenty',
  'bullmq', 'redis', 'drizzle', 'jsx', 'tsx', 'css', 'uuid', 'jwt', 'sso', 'oauth', 'google',
]);

export const EN_WORDS = loadWords('./en-words.txt');

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function splitIdentifier(name: string): string[] {
  return stripDiacritics(name)
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

export function isPtToken(token: string, extra?: Set<string>): boolean {
  const normalized = stripDiacritics(token).toLowerCase();
  if (EN_ALLOW.has(normalized)) return false;
  return (
    PT_LEXICON.has(normalized) ||
    extra?.has(normalized) === true ||
    (normalized.length >= 5 && /(cao|coes|mento|mentos|dade|dades|agem|eiro|eira|oes|ais)$/.test(normalized))
  );
}

const PT_FUNCTION_WORDS = new Set([
  'a', 'que', 'nao', 'para', 'com', 'quando', 'porque', 'uma', 'dos', 'das', 'esta', 'entao',
  'tambem', 'isso', 'sao', 'pelo', 'pela', 'sem', 'mais', 'ja', 'ainda',
]);

export function ptCommentScore(text: string): number {
  const words = stripDiacritics(text).toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter((word) => PT_FUNCTION_WORDS.has(word)).length;
}

export function isPtComment(text: string): boolean {
  return ptCommentScore(text) >= 2 || /[ãõçáéíóúâêôà]/i.test(text);
}

export function buildExtraLexicon(rows: { old: string; new: string }[]): Set<string> {
  const translated = new Set(
    rows.flatMap((row) =>
      row.new && !['KEEP', 'REMOVE', 'STATE'].includes(row.new)
        ? splitIdentifier(stripDiacritics(row.new))
        : [],
    ),
  );
  const extra = new Set<string>();
  for (const row of rows) {
    for (const token of splitIdentifier(stripDiacritics(row.old))) {
      if ((isPtToken(token) || !translated.has(token)) && token.length >= 3 && !EN_WORDS.has(token) && !EN_ALLOW.has(token)) {
        extra.add(token);
      }
    }
  }
  return extra;
}

export function lexiconHash(set: Set<string>): string {
  return createHash('sha1').update([...set].sort().join('\n')).digest('hex');
}
