import { ApiError } from '@pipe/ui/api';

/**
 * A true REST write returns status 400/403/404/409 for `POST`/`PATCH`/`DELETE`, unlike legacy `acoes.ts` `Resultado` with `{ok,erro}` in a 200 for `useActionState`. Match the per-call result shape in `paginas/fluxo/configuracoes/basicas/gravar.ts`.
 */
export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

/** Return `erro.mensagem` from `api` `ErroPipe` or the default text. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}
