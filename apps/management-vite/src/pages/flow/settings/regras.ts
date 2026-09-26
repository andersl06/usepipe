/**
 * The "Chaves de acesso" rules — the `lP` controller from portal.js (`configurations.accessToken` state), without the screen. `tests/configuracoes-regras.test.ts` locks down what comes out of here.
 */

/** `MAX_TOKENS = 3`. */
export const LIMITE_DE_CHAVES = 3;

/**
 * The header swaps the "Nova chave" button for the limit `bds-banner` when `keys.length >= MAX_TOKENS`.
 */
export function noLimite(totalDeChaves: number) {
  return totalDeChaves >= LIMITE_DE_CHAVES;
}

/**
 * `createKey()`: with the limit reached, `tokenLimitReached`; without a name, `tokenNameRequired`; otherwise it creates.
 */
export function errorToCreate(nome: string, totalDeChaves: number): 'limite' | 'nome' | null {
  if (noLimite(totalDeChaves)) return 'limite';
  if (!nome || nome.trim() === '') return 'nome';
  return null;
}

/** `deleteKey()`: the default key (`isDefault`, the first in the list) can't be removed. */
export function podeExcluir(key: { padrao: boolean }) {
  return !key.padrao;
}

/** `parseKeyItem`: the first key in the list is the default one. */
export function marcarPadrao<T>(chaves: T[]): (T & { padrao: boolean })[] {
  return chaves.map((key, indice) => ({ ...key, padrao: indice === 0 }));
}
