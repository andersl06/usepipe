/**
 * As regras de "Chaves de acesso" — o controlador `lP` de portal.js (estado
 * `configurations.accessToken`), sem a tela. `tests/configuracoes-regras.test.ts`
 * trava o que sai daqui.
 */

/** `MAX_TOKENS = 3`. */
export const LIMITE_DE_CHAVES = 3;

/**
 * O cabeçalho troca o botão "Nova chave" pelo `bds-banner` de limite quando
 * `keys.length >= MAX_TOKENS`.
 */
export function noLimite(totalDeChaves: number) {
  return totalDeChaves >= LIMITE_DE_CHAVES;
}

/**
 * `createKey()`: com o limite atingido, `tokenLimitReached`; sem nome,
 * `tokenNameRequired`; senão cria.
 */
export function erroAoCriar(nome: string, totalDeChaves: number): 'limite' | 'nome' | null {
  if (noLimite(totalDeChaves)) return 'limite';
  if (!nome || nome.trim() === '') return 'nome';
  return null;
}

/** `deleteKey()`: a chave padrão (`isDefault`, a primeira da lista) não sai. */
export function podeExcluir(chave: { padrao: boolean }) {
  return !chave.padrao;
}

/** `parseKeyItem`: a primeira chave da lista é a padrão. */
export function marcarPadrao<T>(chaves: T[]): (T & { padrao: boolean })[] {
  return chaves.map((chave, indice) => ({ ...chave, padrao: indice === 0 }));
}
