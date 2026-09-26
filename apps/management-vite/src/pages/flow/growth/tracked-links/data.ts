/**
 * Click tracker (Growth) — the types and the pure rule for `GET`/`POST /v1/gestao/fluxos/:fluxoId/links-rastreados` (`apps/api/src/dominio/rastreador-de-cliques.ts`, tested in `apps/api/tests/growth.test.ts`).
 *
 * NOT the existing `growth/clicktracker` (`clicktracker/clicktracker.tsx`) — that one measures Meta's Click-to-WhatsApp ad performance, with no link to register at all; the comment at the top of the domain confirms the distinction. This is a sibling screen, new, with no equivalent Blip screen to measure against for the visual ruler — its shape follows the other Growth menu items (`mensagens-ativas`, `pagamentos`), not a captured reference.
 *
 * A SEPARATE file from `gravar.ts` (which imports `./api`, which reads `import.meta.env` and breaks outside Vite) — the same split as `cadastros.ts`/`cadastros-gravar.ts` and `regras.ts`/`disparo.ts`: here only what `node --test` can import cleanly.
 */

export interface LinkRastreado {
  id: string;
  flowId: string;
  nome: string;
  destinationUrl: string;
  codigo: string;
  urlCurta: string;
  cliques: number;
  criadoEm: string;
}

export type Resultado<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; campo?: 'nome' | 'destino' };

/**
 * This endpoint's error body (`{erro:{codigo,mensagem}}`) doesn't send `detalhe.campo` — only the `codigo` says which field it is (`createLinkTracked` in `dominio/rastreador-de-cliques.ts` and `confirmarUrlSegura` in `dominio/gestao/integracoes.ts`). Mapped here, not there: changing a field is a screen change, not a domain change.
 */
export function fieldOfErrorOfLink(codigo: string): 'nome' | 'destino' | undefined {
  if (codigo === 'name_required') return 'nome';
  if (
    codigo === 'destination_required' ||
    codigo === 'url_invalid' ||
    codigo === 'url_needs_https' ||
    codigo === 'url_forbidden'
  ) {
    return 'destino';
  }
  return undefined;
}
