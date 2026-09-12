/**
 * Os envelopes do protocolo LIME, do jeito que a tela da Blip espera receber.
 *
 * A cópia não fala REST: ela manda comandos `{ id, method, to, uri }` e lê
 * `{ status, type, resource }`. O `type` não é enfeite — a tela escolhe o
 * componente pelo content type (`application/vnd.iris.ticket+json` monta cartão de
 * atendimento; `application/vnd.lime.collection+json` monta lista). Responder com
 * o tipo errado faz a tela montar a coisa errada, ou nada.
 *
 * Os nomes e os valores aqui são os que o cliente lê; por isso ficam em inglês,
 * como no protocolo. O resto do arquivo é nosso e fica em português.
 */

export const TIPO_COLECAO = 'application/vnd.lime.collection+json';
export const TIPO_DOCUMENTO = 'application/vnd.lime.document+json';
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
 * Coleção no formato do protocolo. `total` é o total da CONSULTA, não da página:
 * a tela usa esse número no contador ("3 clientes aguardando"), e mandar o tamanho
 * da página faz o contador mentir assim que a lista passar de uma página.
 */
export function colecao(itens: unknown[], tipoItem?: string, total?: number): RespostaLime {
  return ok(
    {
      total: total ?? itens.length,
      itemType: tipoItem ?? 'application/json',
      items: itens,
    },
    TIPO_COLECAO,
  );
}

export function vazio(tipoItem?: string): RespostaLime {
  return colecao([], tipoItem);
}

/**
 * Recurso ausente. O código 67 é o que a Blip devolve, e as telas tratam ele de
 * propósito: o Builder, por exemplo, lê 67 como "ainda não existe fluxo salvo" e
 * segue para o caminho de criar um. Trocar por 404 genérico quebraria esse desvio.
 */
export function ausente(): RespostaLime {
  return { status: 'failure', reason: { code: 67, description: 'The requested resource was not found' } };
}

export function falha(codigo: number, descricao: string): RespostaLime {
  return { status: 'failure', reason: { code: codigo, description: descricao } };
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
