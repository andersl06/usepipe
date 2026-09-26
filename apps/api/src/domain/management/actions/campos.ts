/**
 * Management form input: former `FormData`, now JSON. Keep `get`/`getAll` so actions read it as they did in Server Actions. A repeated key becomes a list; a checked box sends `'on'` and an unchecked box is absent, as with FormData.
 */
export type CamposCrus = Record<string, string | string[] | undefined>;

export class Campos {
  constructor(private readonly crus: CamposCrus) {}

  get(key: string): string | null {
    const v = this.crus[key];
    if (v === undefined) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  getAll(chave: string): string[] {
    const v = this.crus[chave];
    if (v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  }

  has(chave: string): boolean {
    return this.crus[chave] !== undefined;
  }
}

/** Every action returns success or a text reason for the screen. */
export interface Resultado {
  ok: boolean;
  error?: string;
}
