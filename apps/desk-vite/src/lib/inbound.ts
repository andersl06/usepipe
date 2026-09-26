import type { RespostaDaDescoberta } from '@pipe/contracts';
import { urlDaApi } from './api';

/**
 * Por onde se entra — copiado de `apps/management-vite/src/lib/entrada.ts`; só o
 * destino padrão muda (o Desk abre em `/`, os Atendimentos). É a parte que continua
 * valendo com o front no navegador. Sem cookie lido à mão: a sessão é o cookie
 * HttpOnly que a `api` emite, e o navegador o carrega sozinho.
 */
const DESTINATION_DEFAULT = '/';

/** Only an internal path is a valid return destination; `//outro.site` must not become a redirect target. */
export function caminhoInterno(destination: string | undefined | null): string {
  return destination && destination.startsWith('/') && !destination.startsWith('//') ? destination : DESTINATION_DEFAULT;
}

/** Este aplicativo, visto pelo navegador — vai na ida do login como `?origem=`. */
function origemDesteApp(): string {
  return window.location.origin;
}

/** Build the `Entrar com Google` URL; when `convite` is present, sign in while accepting the invitation. */
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

export type InboundDescoberta = RespostaDaDescoberta | { metodo: 'invalido' | 'falha' };

/**
 * Discover how this email signs in. The API deliberately answers identically for known and unknown addresses; only a verified domain with active SSO returns `sso`.
 */
export async function descobrirInbound(email: string): Promise<InboundDescoberta> {
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
