import { ApiError } from './api';

/**
 * O resultado de uma escrita REST de verdade (`POST`/`PATCH`/`DELETE` com
 * status de verdade — 400/403/404/409), diferente do `Resultado` de
 * `acoes.ts` (o `{ok,erro}` das ações antigas em 200, para `useActionState`).
 *
 * Mesmo formato de `paginas/fluxo/configuracoes/basicas/gravar.ts`: um objeto
 * novo por chamada, sem arquivo próprio até agora porque só o fluxo escrevia
 * REST — os cadastros de Atendimento (filas, respostas prontas, pausas)
 * passam a escrever assim também.
 */
export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}
