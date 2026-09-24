export async function carregar() { return import('./uso.js'); }
export type ErroImportado = typeof import('../../../packages/core/src/erros.js').ErroPipe;
