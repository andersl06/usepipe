import type { RespostaDaDescoberta } from '@pipe/contracts';

/**
 * HTTP client shared by the Vite front-ends (Gestão and Desk) for the NestJS `api`: browser `fetch` sends the session cookie. The front end requests data; it does not connect to the database (README's "Quem fala com o banco" boundary). Calls use `/v1/...` through `VITE_URL_API` when configured, otherwise the current origin; Vite proxies development requests to `api`; in production the front and API share a parent domain and the cookie crosses via `Domain`. Return types come from `@pipe/contracts` or the endpoint contract rather than being guessed here.
 *
 * Lives in a subpath (`@pipe/ui/api`), not the package index, so server code importing `@pipe/ui` never pulls browser `fetch` helpers.
 */

const BASE =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_URL_API'] ?? undefined)?.replace(
    /\/$/,
    '',
  ) ?? '';

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

/** The `api` error filter answers `{ error: { code, message } }` (`apps/api/src/errors.ts`). */
function mensagemDoCorpo(corpo: unknown): string | undefined {
  const error =
    corpo && typeof corpo === 'object' && 'error' in corpo
      ? (corpo as { error?: { message?: unknown } }).error
      : undefined;
  return typeof error?.message === 'string' ? error.message : undefined;
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
    throw new ApiError(resposta.status, corpo, mensagemDoCorpo(corpo));
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
    return mensagemDoCorpo(await resposta.json()) ?? `A API respondeu ${resposta.status}.`;
  } catch {
    return `A API respondeu ${resposta.status}.`;
  }
}

/* ------------------------------------------------------------------ sign-in */

/**
 * Only an internal path is a valid return destination (T-01-44-01). A single leading `/` isn't enough: `//evil` and `/\evil` are both protocol-relative in a browser (backslash normalizes to forward slash), so either becomes an external redirect target the same as a full URL would. `padrao` is each app's landing path.
 */
export function caminhoInterno(destination: string | undefined | null, padrao: string): string {
  if (!destination || !destination.startsWith('/')) return padrao;
  if (destination.startsWith('//') || destination.startsWith('/\\')) return padrao;
  return destination;
}

/** Build the `Entrar com Google` URL; when `invitation` is present, sign in while accepting the invitation. `destination` must already be an internal path. */
export function inboundWithGoogleUrl(options: { destination: string; invitation?: string }): string {
  const url = new URL(urlDaApi('/v1/auth/google'), window.location.origin);
  if (options.invitation) url.searchParams.set('invite', options.invitation);
  url.searchParams.set('returnTo', options.destination);
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
}

/** Discovery supplies `irPara` as a path; add the API base and browser origin here. `destination` must already be an internal path. */
export function urlNaApi(caminho: string, destination: string): string {
  const url = new URL(urlDaApi(caminho), window.location.origin);
  url.searchParams.set('returnTo', destination);
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
}

export type InboundDiscovery = RespostaDaDescoberta | { metodo: 'invalido' | 'falha' };

/**
 * Discover how this email signs in. The API deliberately answers identically for known and unknown addresses; only a verified domain with active SSO returns `sso`.
 */
export async function discoverInbound(email: string): Promise<InboundDiscovery> {
  let resposta: Response;
  try {
    resposta = await fetch(urlDaApi('/v1/auth/descobrir'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { metodo: 'falha' };
  }
  if (resposta.status === 400) return { metodo: 'invalido' };
  if (!resposta.ok) return { metodo: 'falha' };
  return (await resposta.json()) as RespostaDaDescoberta;
}
