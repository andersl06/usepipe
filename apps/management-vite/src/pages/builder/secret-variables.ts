/**
 * Builder "Variáveis sensíveis" (P11): per-flow secrets read as `{{secret.<name>}}`, only in HTTP
 * actions. Values are write-only: the API never returns them, so a saved row shows a fixed mask and
 * any edit (including a rename) must re-enter the value, as Blip's text says. Pure logic only; the
 * API client lives in `secret-variables-gravar.ts`, so `node --test` can import this file.
 */

/** Mirrors the api's `NAME` regex (`domain/management/flow-secrets.ts`). */
const NAME = /^[\p{L}\p{N}_.]{1,190}$/u;

/** What a saved row shows instead of its value. */
export const SECRET_VALUE_MASK = '••••••••';

export interface SecretDraft {
  name: string;
  /** Empty = keep the stored value (only allowed when nothing changed). */
  value: string;
}

/**
 * Why a draft can't be saved, in Portuguese, or null when it can. `originalName` is the saved name
 * for an existing row, or null for a new one.
 */
export function secretDraftError(draft: SecretDraft, originalName: string | null): string | null {
  const name = draft.name.trim();
  if (!name) return 'Informe o nome da variável.';
  if (!NAME.test(name)) {
    return 'O nome deve conter apenas letras, números, "_" ou ".", sem espaços, hífen ou emojis.';
  }
  if (!draft.value.trim()) {
    return originalName !== null && originalName !== name
      ? 'Para alterar o nome, insira o valor novamente.'
      : 'Informe o valor da variável.';
  }
  return null;
}

/** The text a flow uses to read the secret, shown next to the row. */
export function secretUsage(name: string): string {
  return `{{secret.${name.trim()}}}`;
}
