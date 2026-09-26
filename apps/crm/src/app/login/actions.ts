'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_SESSION,
  caminhoInterno,
  descobrirInbound,
  encerrarSession,
  urlNaApi,
} from '../../lib/session';

/**
 * The two sign-in actions: discover how this email signs in, and sign out.
 *
 * The API call doesn't live here — it lives in `src/lib/sessao.ts`, and this file is
 * just the form's shell: it reads `FormData`, touches the cookie, and redirects.
 *
 * Discovery happens on the SERVER, not in the browser, for a practical reason:
 * `PIPE_ORIGENS` is a closed list and the three screens' origins aren't on it. A
 * browser `fetch` to `/v1/auth/descobrir` would die on CORS.
 */

/** O e-mail decide o caminho: IdP da empresa, ou o Google. */
export async function continuar(data: FormData): Promise<void> {
  const email = String(data.get('email') ?? '').trim();
  const destination = caminhoInterno(String(data.get('destino') ?? ''));
  const inbound = await descobrirInbound(email);

  if (inbound.metodo === 'sso' && inbound.irPara) {
    redirect(urlNaApi(inbound.irPara, destination));
  }

  // Without SSO, the person goes back to the same screen with the reason and the email already
  // typed in. Sending them back to a blank screen would make whoever got the domain wrong start over
  // do zero.
  const volta = new URLSearchParams({ method: inbound.metodo, email });
  if (destination !== '/') volta.set('destino', destination);
  redirect(`/login?${volta.toString()}`);
}

/**
 * Sign out: ends the session on the API and deletes this browser's cookie.
 *
 * The cookie is deleted HERE, not via the `Set-Cookie` the API returns: that response
 * reached this server, not the browser. The `Domain` has to match the one it was
 * issued with — without that the browser keeps a second, empty cookie, the original
 * one stays valid, and the person "signs out" without actually signing out.
 */
export async function sair(): Promise<void> {
  const pote = await cookies();
  const cookie = pote.get(COOKIE_SESSION);
  if (cookie) await encerrarSession(`${COOKIE_SESSION}=${cookie.value}`);

  pote.set({
    name: COOKIE_SESSION,
    value: '',
    path: '/',
    maxAge: 0,
    domain: process.env['PIPE_COOKIE_DOMINIO'] || undefined,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
  });

  redirect('/login');
}
