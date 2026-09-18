/**
 * O cliente HTTP da Gestão: `fetch` para a `api` NestJS, sempre com o cookie.
 *
 * É a fronteira do README ("Quem fala com o banco"): o front não abre conexão,
 * ele PEDE. Toda chamada vai para `/v1/...` na mesma origem — em
 * desenvolvimento o Vite faz o proxy para a `api` (3010); em produção os dois
 * vivem sob o mesmo domínio-pai e o cookie atravessa por `Domain`.
 *
 * O que sai daqui é o tipo de `@pipe/contracts` ou o tipo declarado pelo
 * endpoint da `api`. Nada é reimplementado; nada é adivinhado.
 */

const BASE = (import.meta.env['VITE_URL_API'] as string | undefined)?.replace(/\/$/, '') ?? '';

/** URL absoluta de um caminho da `api` — para navegação de topo (login) e para o `fetch`. */
export function urlDaApi(caminho: string): string {
  return `${BASE}${caminho}`;
}

/**
 * Uma resposta que a API deu e que não é sucesso. Diferente de rede fora do ar:
 * 401/403 dizem que a sessão acabou de verdade; `TypeError` do fetch não diz nada.
 */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: unknown,
    mensagem?: string,
  ) {
    super(mensagem ?? `A api respondeu ${status}.`);
  }
}

export async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(urlDaApi(caminho), {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body !== undefined && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!resposta.ok) {
    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      /* corpo vazio ou não-JSON: o status já diz o bastante */
    }
    const mensagem =
      corpo && typeof corpo === 'object' && 'mensagem' in corpo
        ? String((corpo as { mensagem: unknown }).mensagem)
        : undefined;
    throw new ErroDaApi(resposta.status, corpo, mensagem);
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export const api = {
  get: <T>(caminho: string) => pedir<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: 'POST',
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
  put: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: 'PUT',
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
  patch: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: 'PATCH',
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
  delete: <T>(caminho: string) => pedir<T>(caminho, { method: 'DELETE' }),
};

/**
 * Uma chamada à `api` no formato cru do `fetch` — para quem precisa ler o
 * `Response` (status, corpo em texto, CSV). O cookie vai sozinho.
 */
export function chamarApi(caminho: string, init: RequestInit = {}): Promise<Response> {
  return fetch(urlDaApi(caminho), { ...init, credentials: 'include' });
}

/** O `erro.mensagem` que a `api` põe no corpo, ou o status. */
export async function motivoDaFalha(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { erro?: { mensagem?: string } };
    return corpo.erro?.mensagem ?? `A API respondeu ${resposta.status}.`;
  } catch {
    return `A API respondeu ${resposta.status}.`;
  }
}
