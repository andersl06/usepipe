import type { Eu } from '@pipe/contracts';

/**
 * The boundary with the `api` for everything sign-in related: who's logged in,
 * how this company signs in, and who an invite is for.
 *
 * Nothing here knows about the screen — no JSX, no `revalidatePath`, no cookie
 * read from the Next environment. The cookie arrives as TEXT, as a parameter,
 * and that's what keeps the file movable without becoming a rewrite when the
 * screen migrates to Vite (README, "Who talks to the database").
 *
 * Every endpoint used here already exists: `GET /v1/eu`, `POST /v1/auth/sair`,
 * `POST /v1/auth/descobrir`, `GET /v1/convites/:token`, and the two sign-in
 * entry points (`/v1/auth/google` and `/v1/auth/sso/:slug`). Nothing was
 * invented, and nothing is reimplemented.
 */

/** The API as seen by THIS server. Behind the proxy it's the service's internal name. */
/*
 * 3000, not 3100: the `api` lives on 3000 — 3100 is Gestão. The wrong default
 * here is half an hour behind a login that "does nothing", because
 * `GET /v1/eu` hits a front end that doesn't serve the route and comes back
 * 404. It's the same value Gestão and Desk already use.
 */
const URL_API = (process.env['PIPE_URL_API'] ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * The same API as seen by the BROWSER.
 *
 * Signing in with Google is a top-level navigation: the link goes out in the
 * HTML and the browser goes on its own, without passing through this server. If
 * the base were the internal one, the button would point at a name that only
 * exists inside the Docker network. In development the two are the same, which
 * is why one falls back to the other.
 */
const URL_API_PUBLICA = (process.env['PIPE_URL_API_PUBLICA'] ?? URL_API).replace(/\/$/, '');

/**
 * THIS app, as seen by the browser.
 *
 * Goes out on the way into login as `?origem=`, and it's what makes the return
 * land here and not on another module's front end: the API serves all three
 * and has no way to guess which one the person left from. On the API side,
 * only an origin that's in `PIPE_ORIGENS` is accepted — the same closed CORS
 * list.
 */
const ORIGEM_DESTE_APP = (
  process.env['PIPE_URL_ESTE_APP'] ?? 'http://localhost:3300'
).replace(/\/$/, '');

/** The session cookie the API issues. `HttpOnly`; the screen only passes it along. */
export const COOKIE_SESSION = 'pipe_session';

/**
 * What `POST /v1/auth/descobrir` returns, plus the screen's two failure modes.
 *
 * The first two are the contract (`MetodoDeEntrada` in
 * `packages/contracts/src/sessao.ts`): `sso` sends to the company's IdP,
 * `google` is the path for everyone else. The other two never come from the
 * API — they're what THIS screen needs to say when there was no response to
 * route on.
 */
export interface InboundDiscovery {
  metodo: 'sso' | 'google' | 'invalido' | 'falha';
  /** API path, when `sso`. Only missing the public base. */
  irPara?: string;
}

/** The minimum `GET /v1/convites/:token` shows to someone still on the outside. */
export interface InvitationVisible {
  email: string;
  role: string;
  tenant: { nome: string; slug: string };
  /** ISO-8601, as it comes from the API. The screen is what formats it. */
  expiraEm: string;
}

function sessionHeader(cookie: string): HeadersInit {
  return { cookie, accept: 'application/json' };
}

/**
 * Who's logged in. `null` when there's no session — and that is NOT an error:
 * the sign-in screen is public and reaches here with no cookie all the time.
 */
export async function buscarEu(cookie: string): Promise<Eu | null> {
  const resposta = await fetch(`${URL_API}/v1/eu`, {
    headers: sessionHeader(cookie),
    cache: 'no-store',
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as Eu;
}

/**
 * Ends the session on the API side. Signing out twice isn't an error there, and
 * isn't one here either.
 *
 * Swallows a network failure on purpose: whoever clicked Sign out will get
 * their cookie deleted from this browser regardless, and blocking sign-out
 * because the API didn't respond would leave the person logged in on screen —
 * which is the worse of the two outcomes.
 *
 * ponytail: the session would survive in the database until it expires on its
 * own. If that ever matters, sign-out becomes a revocation queue, not a
 * `throw` here.
 */
export async function closeSession(cookie: string): Promise<void> {
  try {
    await fetch(`${URL_API}/v1/auth/sair`, {
      method: 'POST',
      headers: sessionHeader(cookie),
      cache: 'no-store',
    });
  } catch {
    /* without a network call, the local cookie already answers what the person asked */
  }
}

/**
 * How this email signs in.
 *
 * The API answers the same way for a known and an unknown email, on purpose —
 * only a verified domain with SSO active returns `sso`. There's nothing the
 * screen can deduce from this about who is a Pipe customer, and that's how it
 * has to be.
 */
export async function discoverInbound(email: string): Promise<InboundDiscovery> {
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API}/v1/auth/descobrir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
  } catch {
    return { metodo: 'falha' };
  }
  // 400 is always `email_invalido` on this route — the only validation it does.
  if (resposta.status === 400) return { metodo: 'invalido' };
  if (!resposta.ok) return { metodo: 'falha' };
  return (await resposta.json()) as InboundDiscovery;
}

/**
 * Who the invite is for. `null` covers expired, already used, and nonexistent:
 * from the outside all three are the same thing — ask for another — and
 * telling them apart would reveal whether that token ever existed.
 */
export async function viewInvitation(token: string): Promise<InvitationVisible | null> {
  const resposta = await fetch(`${URL_API}/v1/convites/${encodeURIComponent(token)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as InvitationVisible;
}

/**
 * The destination is always an INTERNAL PATH. `//outro.site` in a redirect is
 * phishing using our domain as a springboard; the API checks again on its own
 * side, and checking on both sides costs one line.
 */
export function caminhoInterno(destination: string | undefined | null): string {
  return destination && destination.startsWith('/') && !destination.startsWith('//') ? destination : '/';
}

/** The "Sign in with Google" button. With `invitation`, it signs in accepting the invite. */
export function inboundWithGoogleUrl(options: { destination?: string; invitation?: string } = {}): string {
  const url = new URL(`${URL_API_PUBLICA}/v1/auth/google`);
  if (options.invitation) url.searchParams.set('invite', options.invitation);
  url.searchParams.set('returnTo', caminhoInterno(options.destination));
  url.searchParams.set('origin', ORIGEM_DESTE_APP);
  return url.toString();
}

/** `irPara` comes from discovery as a path; here it gets the public base. */
export function urlNaApi(caminho: string, destination?: string): string {
  const url = new URL(`${URL_API_PUBLICA}${caminho}`);
  url.searchParams.set('returnTo', caminhoInterno(destination));
  url.searchParams.set('origin', ORIGEM_DESTE_APP);
  return url.toString();
}
