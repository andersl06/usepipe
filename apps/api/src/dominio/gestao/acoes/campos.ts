/**
 * O que um formulário da Gestão manda: o `FormData` de antes, agora como JSON.
 *
 * Mesma interface de leitura (`get`/`getAll`) para as ações continuarem
 * iguais às Server Actions de onde vieram. Chave repetida vira lista; caixa
 * de seleção marcada vem como `'on'` e desmarcada não vem — como no FormData.
 */
export type CamposCrus = Record<string, string | string[] | undefined>;

export class Campos {
  constructor(private readonly crus: CamposCrus) {}

  get(chave: string): string | null {
    const v = this.crus[chave];
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

/** O que toda ação devolve: deu certo, ou o motivo em texto para a tela. */
export interface Resultado {
  ok: boolean;
  erro?: string;
}
