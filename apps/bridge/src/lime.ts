/**
 * LIME protocol envelopes as expected by the Blip screen. The copy does not use REST: it sends `{ id, method, to, uri }` commands and reads `{ status, type, resource }`. `type` determines the screen component: `application/vnd.iris.ticket+json` builds a ticket card and `application/vnd.lime.collection+json` builds a list. The wrong type displays the wrong component or nothing. Names and values here are protocol fields consumed by the client, so preserve their spelling.
 */

export const TIPO_COLLECTION = 'application/vnd.lime.collection+json';
export const TIPO_DOCUMENT = 'application/vnd.lime.document+json';
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
    TIPO_COLLECTION,
  );
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
