/**
 * Desk HTTP client for the NestJS `api`: browser `fetch` sends the session cookie. The front end requests data; it does not connect to the database (README's "Quem fala com o banco" boundary). Calls use `/v1/...` through `VITE_URL_API` when configured, otherwise the current origin; Vite proxies development requests to `api`; in production the front and API share a parent domain and the cookie crosses via `Domain`. Return types come from `@pipe/contracts` or the endpoint contract rather than being guessed here.
 */

const BASE = (import.meta.env['VITE_URL_API'] as string | undefined)?.replace(/\/$/, '') ?? '';

/** Build an `api` URL from the configured base, or a same-origin path when no base is configured, for top-level login navigation and `fetch`. */
export function urlDaApi(caminho: string): string {
  return `${BASE}${caminho}`;
}

/**
 * A non-successful API response differs from a network outage: server 401/403 can prove the session ended, while a `fetch` `TypeError` cannot.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly corpo: unknown,
    message?: string,
  ) {
    super(message ?? `A api respondeu ${status}.`);
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
      /* An empty or non-JSON body is acceptable here; the status already identifies the failure. */
    }
    const errorBody =
      corpo && typeof corpo === 'object' && 'error' in corpo
        ? (corpo as { error?: { message?: unknown } }).error
        : undefined;
    const message = typeof errorBody?.message === 'string' ? errorBody.message : undefined;
    throw new ApiError(resposta.status, corpo, message);
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
 * Raw `fetch`-style `api` call for callers that need the `Response` status, text body, or CSV. The browser includes the cookie.
 */
export function chamarApi(caminho: string, init: RequestInit = {}): Promise<Response> {
  return fetch(urlDaApi(caminho), { ...init, credentials: 'include' });
}


export async function motivoDaFalha(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { error?: { message?: string } };
    return corpo.error?.message ?? `A API respondeu ${resposta.status}.`;
  } catch {
    return `A API respondeu ${resposta.status}.`;
  }
}
