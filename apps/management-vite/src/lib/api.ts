/**
 * Gestao HTTP client uses browser `fetch` with the session cookie to call NestJS `api`. Under the README database boundary (`Quem fala com o banco`), the front requests data rather than opening a DB connection. `/v1/...` uses Vite proxy to `api` on 3010 in development; production shares a parent domain so the cookie crosses via `Domain`. Return types come from `@pipe/contracts` or the endpoint contract, never guessed here.
 */

const BASE = (import.meta.env?.['VITE_URL_API'] as string | undefined)?.replace(/\/$/, '') ?? '';

/** Build an `api` URL from the configured base, or a same-origin path if no base is set, for top-level login and `fetch`. */
export function urlDaApi(caminho: string): string {
  return `${BASE}${caminho}`;
}

/**
 * A non-success API response differs from a network outage: server 401/403 can prove the session ended, while `fetch` `TypeError` cannot.
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
      /* An empty or non-JSON body is acceptable here; the status already identifies failure. */
    }
    const message =
      corpo && typeof corpo === 'object' && 'mensagem' in corpo
        ? String((corpo as { mensagem: unknown }).mensagem)
        : undefined;
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
 * Raw `fetch`-style `api` call for callers needing `Response` status, text body, or CSV. The browser includes the cookie.
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
