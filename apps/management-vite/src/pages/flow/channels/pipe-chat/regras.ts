/**
 * Pure rules for the Pipe Chat configuration page: the origin allow-list text and the embed snippet. No `./api` import so the tests run without `import.meta.env`.
 */

export const GREETING_MAX = 200;

/** One origin per line; only http(s) origins are valid. Valid values are normalized to `scheme://host[:port]` and de-duplicated. */
export function parseOrigins(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let origin: string | null = null;
    try {
      const url = new URL(line);
      if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
    } catch {
      origin = null;
    }
    if (origin) {
      if (!valid.includes(origin)) valid.push(origin);
    } else if (!invalid.includes(line)) {
      invalid.push(line);
    }
  }
  return { valid, invalid };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The script tag the admin pastes on the customer site. */
export function pipeChatSnippet({ scriptOrigin, key }: { scriptOrigin: string; key: string }): string {
  return `<script src="${escapeAttribute(scriptOrigin)}/pipe-chat.js" data-key="${escapeAttribute(key)}" async></script>`;
}
