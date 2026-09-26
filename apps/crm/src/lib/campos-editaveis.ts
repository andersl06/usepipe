/**
 * The catalog of record fields that get edited in place.
 *
 * **This file doesn't import the database, and that's on purpose.** The
 * inline cell is a client component; any `import` here that pulls in `pg` for
 * the browser bundle takes down the page with a 500 — the same trap
 * `busca-tipos.ts` exists to avoid. A catalog is fact (name, label, type, cap),
 * and fact doesn't need a connection.
 *
 * The catalog is also the **write allowlist**: `atualizarCampoDoLead` doesn't
 * accept a column name coming from the screen, it accepts a key from here.
 * Concatenating whatever the browser sent into an `update` is how you write to
 * the wrong table.
 */

export type TipoCampo = 'texto' | 'selecao';

export interface CampoEditavel {
  rotulo: string;
  tipo: TipoCampo;
  /** Teto de caracteres. Vale no navegador (`maxlength`) e de novo no servidor. */
  maximo: number;
}

export const CAMPOS_EDITAVEIS = {
  email: { rotulo: 'E-mail', tipo: 'texto', maximo: 254 },
  telefone: { rotulo: 'Telefone', tipo: 'texto', maximo: 32 },
  origem: { rotulo: 'Origem', tipo: 'texto', maximo: 120 },
  campanha: { rotulo: 'Campanha', tipo: 'texto', maximo: 120 },
  /** The value is the user's id, not the name: the name changes and the assignment can't change along with it. */
  proprietario: { rotulo: 'Proprietário', tipo: 'selecao', maximo: 36 },
} as const satisfies Record<string, CampoEditavel>;

export type KeyField = keyof typeof CAMPOS_EDITAVEIS;

const CHAVES: readonly string[] = Object.keys(CAMPOS_EDITAVEIS);

export function campoValido(value: string): value is KeyField {
  return CHAVES.includes(value);
}

/** Leading/trailing space stripped; a blank field is null, not an empty string. */
export function normalizar(value: string): string | null {
  const limpo = value.trim();
  return limpo === '' ? null : limpo;
}

/**
 * What the screen rejects before calling the server, and what the server
 * rejects again.
 *
 * Neither one is real email or phone validation — only sending it proves that.
 * It's the filter that stops an obvious typo from becoming saved data: an
 * email with no @, a phone with a letter in it.
 *
 * Returns the complaint, or `null` when it's fine.
 */
export function recusar(campo: KeyField, value: string | null): string | null {
  if (value === null) return null;
  if (value.length > CAMPOS_EDITAVEIS[campo].maximo) {
    return `Passa de ${CAMPOS_EDITAVEIS[campo].maximo} caracteres.`;
  }
  if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'E-mail sem arroba ou sem domínio.';
  }
  if (campo === 'telefone' && !/^[+\d][\d\s().-]*$/.test(value)) {
    return 'Telefone só aceita dígitos, espaço, parênteses, traço e +.';
  }
  return null;
}
