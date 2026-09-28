import type { RespostaDaDescoberta } from '@pipe/contracts';
import { urlDaApi } from './api';
import { APPLICATION } from './application-paths';

/**
 * Browser sign-in preserves the useful part of `apps/gestao/src/lib/sessao.ts`. Never read the cookie manually: `api` issues an HttpOnly session cookie and the browser carries it.
 */
const DESTINATION_DEFAULT = APPLICATION;

/**
 * Only an internal path is a valid return destination (T-01-44-01). A single leading `/` isn't
 * enough: `//evil` and `/\evil` are both protocol-relative in a browser (backslash normalizes to
 * forward slash), so either becomes an external redirect target the same as a full URL would.
 */
export function caminhoInterno(destination: string | undefined | null): string {
  if (!destination || !destination.startsWith('/')) return DESTINATION_DEFAULT;
  if (destination.startsWith('//') || destination.startsWith('/\\')) return DESTINATION_DEFAULT;
  return destination;
}

/** Este aplicativo, visto pelo navegador — vai na ida do login como `?origem=`. */
function origemDesteApp(): string {
  return window.location.origin;
}

/** Build the `Entrar com Google` URL; when `invitation` is present, sign in while accepting the invitation. */
export function inboundWithGoogleUrl(options: { destination?: string; invitation?: string } = {}): string {
  const url = new URL(urlDaApi('/v1/auth/google'), window.location.origin);
  if (options.invitation) url.searchParams.set('invite', options.invitation);
  url.searchParams.set('returnTo', caminhoInterno(options.destination));
  url.searchParams.set('origin', origemDesteApp());
  return url.toString();
}

/** Discovery supplies `irPara` as a path; add the API base and browser origin here. */
export function urlNaApi(caminho: string, destination?: string): string {
  const url = new URL(urlDaApi(caminho), window.location.origin);
  url.searchParams.set('returnTo', caminhoInterno(destination));
  url.searchParams.set('origin', origemDesteApp());
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
