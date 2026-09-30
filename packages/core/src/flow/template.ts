/**
 * `ExecuteTemplate` (P9): Blip renders the template with Handlebars. Core stays pure and builds only
 * the data object; the `api` compiles and renders the template in the script isolate
 * (`ServicosDoMotor.renderTemplate`), so production and the Builder test run behave the same.
 */

/** Time limit for one render, the same as `ExecuteScript` (V1). */
export const TEMPLATE_TIMEOUT_MS = 5_000;

/** Largest template accepted; the rendered text has the same ceiling as a script result. */
export const MAX_TEMPLATE_BYTES = 65_536;

const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored variable is text; JSON text becomes the value it encodes so `#each`/`#if` see real data. */
export function parseTemplateValue(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * The Handlebars data for the input variables, in `inputVariables` order. Every input keeps its raw
 * name (`{{[contact.name]}}`), and a dotted name also becomes a nested path (`{{contact.name}}`).
 * The more specific input wins over a field of the same name inside a JSON input. A path that
 * crosses a non-object value or names a prototype key is left raw only.
 */
export function templateData(inputs: Iterable<readonly [string, unknown]>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const dotted: (readonly [string, unknown])[] = [];
  for (const [name, value] of inputs) {
    if (!name || BLOCKED_SEGMENTS.has(name)) continue;
    data[name] = value;
    if (name.includes('.')) dotted.push([name, value]);
  }
  for (const [name, value] of dotted) {
    const segments = name.split('.');
    if (segments.some((s) => !s || BLOCKED_SEGMENTS.has(s))) continue;
    let node: Record<string, unknown> = data;
    let ok = true;
    for (const segment of segments.slice(0, -1)) {
      const next = Object.prototype.hasOwnProperty.call(node, segment) ? node[segment] : undefined;
      if (next === undefined || next === null) {
        const created: Record<string, unknown> = {};
        node[segment] = created;
        node = created;
      } else if (isPlainObject(next)) {
        node = next;
      } else {
        ok = false;
        break;
      }
    }
    if (ok) node[segments[segments.length - 1]!] = value;
  }
  return data;
}
