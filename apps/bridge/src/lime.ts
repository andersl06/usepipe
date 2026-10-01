/**
 * LIME protocol envelopes as expected by the Blip screen. The copy does not use REST: it sends `{ id, method, to, uri }` commands and reads `{ status, type, resource }`. `type` determines the screen component: `application/vnd.iris.ticket+json` builds a ticket card and `application/vnd.lime.collection+json` builds a list. The wrong type displays the wrong component or nothing. Names and values here are protocol fields consumed by the client, so preserve their spelling.
 */

export const TYPE_COLLECTION = 'application/vnd.lime.collection+json';
export const TYPE_DOCUMENT = 'application/vnd.lime.document+json';
export const TIPO_TICKET = 'application/vnd.iris.ticket+json';
export const TIPO_ACCOUNT = 'application/vnd.lime.account+json';

export interface ComandoLime {
  id?: string;
  method: 'get' | 'set' | 'merge' | 'delete' | 'subscribe' | 'unsubscribe' | 'observe';
  to?: string;
  uri: string;
  type?: string;
  resource?: unknown;
}

export interface RespostaLime {
  status: 'success' | 'failure';
  type?: string;
  resource?: unknown;
  reason?: { code: number; description: string };
}

export function ok(recurso: unknown, tipo?: string): RespostaLime {
  return { status: 'success', type: tipo ?? 'application/json', resource: recurso };
}

/**
 * A protocol collection's `total` is the query total, not page size. The screen uses it for its counter ("3 clientes aguardando"); using page size becomes false after the first page.
 */
export function collection(itens: unknown[], tipoItem?: string, total?: number): RespostaLime {
  return ok(
    {
      total: total ?? itens.length,
      itemType: tipoItem ?? 'application/json',
      items: itens,
    },
    TYPE_COLLECTION,
  );
}

/** Reads `$skip`/`$take` from the query; `$take` is capped at 100 as the source platform does. */
export function pagina(query: URLSearchParams): { skip: number; take: number } {
  const num = (k: string, padrao: number) => {
    const n = Number.parseInt(query.get(k) ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : padrao;
  };
  return { skip: num('$skip', 0), take: Math.min(num('$take', 100), 100) };
}

/** Only a `Closed*` status maps to an operation the domain has (closing the conversation). */
export function statusEncerra(status: unknown): boolean {
  return String(status ?? '').startsWith('Closed');
}

export function empty(tipoItem?: string): RespostaLime {
  return collection([], tipoItem);
}

/**
 * Missing resource. Code 67 is Blip's response, and screens handle it intentionally: Builder treats 67 as "no saved flow yet" and creates one. A generic 404 would break that path.
 */
export function ausente(): RespostaLime {
  return { status: 'failure', reason: { code: 67, description: 'The requested resource was not found' } };
}

export function falha(codigo: number, description: string): RespostaLime {
  return { status: 'failure', reason: { code: codigo, description: description } };
}

/** Desmonta `lime://bot@msging.net/caminho?a=1` em caminho e query. */
export function partirUri(uri: string): { caminho: string; query: URLSearchParams } {
  const semEsquema = String(uri ?? '').replace(/^lime:\/\/[^/]*/, '');
  const corte = semEsquema.indexOf('?');
  return {
    caminho: decodeURIComponent(corte < 0 ? semEsquema : semEsquema.slice(0, corte)),
    query: new URLSearchParams(corte < 0 ? '' : semEsquema.slice(corte + 1)),
  };
}
