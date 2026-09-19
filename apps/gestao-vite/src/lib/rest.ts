import { ErroDaApi } from './api';

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
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
export function motivoDe(erro: unknown, padrao: string): string {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as { erro?: { mensagem?: unknown } } | null;
    const mensagem = corpo?.erro?.mensagem;
    if (typeof mensagem === 'string' && mensagem) return mensagem;
  }
  return padrao;
}
