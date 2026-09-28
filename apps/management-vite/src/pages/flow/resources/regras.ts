import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import { normalizar } from '../../builder/variables';

/**
 * Blip "Recursos" (`portal.js`'s `ResourceService`/`ContentController`): a per-flow key/value store
 * of `key` (here `name`), `type` (a MIME type) and `content` (here `value`), read by the builder as
 * `{{resource.<name>}}` (and `resource.<name>@<prop>` for a JSON value). Pure logic only — the API
 * client lives in `gravar.ts`, so `tests/flow-resources-regras.test.ts` runs under `node --test`
 * without `import.meta.env`, the same split `flow-functions.ts`/`flow-functions-gravar.ts` make.
 */

/** Mirrors the api's `NAME` regex (`domain/management/flow-resources.ts`): what `{{resource.<name>}}` can parse back. */
const NAME = /^[\p{L}\p{N}_.]{1,190}$/u;

export function nameError(name: string): 'invalido' | 'vazio' | null {
  const trimmed = name.trim();
  if (!trimmed) return 'vazio';
  if (!NAME.test(trimmed)) return 'invalido';
  return null;
}

export const NAME_ERROR_MESSAGE: Record<'invalido' | 'vazio', string> = {
  vazio: 'Informe a chave do recurso.',
  invalido: 'A chave deve conter apenas letras, números, "_" ou ".", sem espaços, hífen ou emojis.',
};

/** "Pesquise por um recurso" (`resources.filterPlaceholder`): matches the name only, no accent/case. */
export function filterResources(list: readonly FlowResource[], query: string): FlowResource[] {
  const alvo = normalizar(query.trim());
  if (!alvo) return [...list];
  return list.filter((r) => normalizar(r.name).includes(alvo));
}

function typeOf(value: unknown): string {
  return value !== null && typeof value === 'object' ? 'application/json' : 'text/plain';
}

function valueOf(value: unknown): string {
  return typeOf(value) === 'application/json' ? JSON.stringify(value) : String(value);
}

/**
 * "Importar recursos" (Blip lets you export/import the whole list, `resources.duplicatedKeyModal`
 * and friends confirm round-tripping the same shape). Accepts two JSON shapes, both plain
 * `JSON.parse` output with no extra tooling:
 *   - an ARRAY of `{ key|name, type?, content|value }` — Blip's own export shape;
 *   - an OBJECT map `{ name: value }` — the simpler shape a person would type by hand, where an
 *     object/array value becomes an `application/json` resource and anything else `text/plain`.
 * Returns every row's own name error inline (`errors`) rather than failing the whole import on one
 * bad key, so pasting a mostly-good export still saves the rest.
 */
export function parseImportedResources(
  text: string,
): { ok: true; items: FlowResourceInput[]; errors: string[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Este conteúdo deve ser um JSON válido.' };
  }
  const rows: { name: unknown; type: unknown; value: unknown }[] = Array.isArray(parsed)
    ? parsed.map((item) => {
        const row = item as Record<string, unknown>;
        return { name: row['key'] ?? row['name'], type: row['type'], value: row['content'] ?? row['value'] };
      })
    : parsed !== null && typeof parsed === 'object'
      ? Object.entries(parsed as Record<string, unknown>).map(([name, value]) => ({ name, type: undefined, value }))
      : [];
  if (rows.length === 0) {
    return { ok: false, error: 'Nenhum recurso encontrado neste JSON.' };
  }
  const items: FlowResourceInput[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const erro = nameError(name);
    if (erro) {
      errors.push(`"${name || '(vazio)'}": ${NAME_ERROR_MESSAGE[erro]}`);
      continue;
    }
    const value = row.value;
    items.push({
      name,
      type: typeof row.type === 'string' && row.type ? row.type : typeOf(value),
      value: valueOf(value),
    });
  }
  return { ok: true, items, errors };
}
