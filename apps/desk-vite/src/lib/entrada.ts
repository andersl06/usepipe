import type { RespostaDaDescoberta } from '@pipe/contracts';
import { urlDaApi } from './api';

/**
 * Por onde se entra — copiado de `apps/gestao-vite/src/lib/entrada.ts`; só o
 * destino padrão muda (o Desk abre em `/`, os Atendimentos). É a parte que continua
 * valendo com o front no navegador. Sem cookie lido à mão: a sessão é o cookie
 * HttpOnly que a `api` emite, e o navegador o carrega sozinho.
 */
const DESTINATION_DEFAULT = '/';

/** Só caminho interno vale como destino: `//outro.site` não é "para onde voltar". */
export function caminhoInterno(destination: string | undefined | null): string {
  return destination && destination.startsWith('/') && !destination.startsWith('//') ? destination : DESTINATION_DEFAULT;
}

/** Este aplicativo, visto pelo navegador — vai na ida do login como `?origem=`. */
function origemDesteApp(): string {
  return window.location.origin;
}

/** O botão "Entrar com Google". Com `convite`, entra aceitando o convite. */
export function inboundWithGoogleUrl(options: { destination?: string; invitation?: string } = {}): string {
  const url = new URL(urlDaApi('/v1/auth/google'), window.location.origin);
  if (options.invitation) url.searchParams.set('convite', options.invitation);
  url.searchParams.set('destino', caminhoInterno(options.destination));
  url.searchParams.set('origem', origemDesteApp());
  return url.toString();
}

/** `irPara` vem da descoberta como caminho; aqui ele ganha a base e a origem. */
export function urlNaApi(caminho: string, destination?: string): string {
  const url = new URL(urlDaApi(caminho), window.location.origin);
  url.searchParams.set('destino', caminhoInterno(destination));
  url.searchParams.set('origem', origemDesteApp());
  return url.toString();
}

export type InboundDescoberta = RespostaDaDescoberta | { metodo: 'invalido' | 'falha' };

/**
 * Por onde este e-mail entra. A API responde igual para e-mail conhecido e
 * desconhecido, de propósito — só domínio verificado com SSO ativo devolve `sso`.
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
