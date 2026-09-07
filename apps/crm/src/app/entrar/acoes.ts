'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_SESSAO,
  caminhoInterno,
  descobrirEntrada,
  encerrarSessao,
  urlNaApi,
} from '../../lib/sessao';

/**
 * As duas ações da entrada: descobrir por onde este e-mail entra, e sair.
 *
 * A chamada à API não mora aqui — mora em `src/lib/sessao.ts`, e este arquivo é
 * só a casca do formulário: lê `FormData`, mexe no cookie e redireciona.
 *
 * A descoberta acontece no SERVIDOR, e não no navegador, por um motivo prático:
 * `PIPE_ORIGENS` é lista fechada e as origens das três telas não estão nela.
 * Um `fetch` do navegador para `/v1/auth/descobrir` morreria no CORS.
 */

/** O e-mail decide o caminho: IdP da empresa, ou o Google. */
export async function continuar(dados: FormData): Promise<void> {
  const email = String(dados.get('email') ?? '').trim();
  const destino = caminhoInterno(String(dados.get('destino') ?? ''));
  const entrada = await descobrirEntrada(email);

  if (entrada.metodo === 'sso' && entrada.irPara) {
    redirect(urlNaApi(entrada.irPara, destino));
  }

  // Sem SSO, a pessoa volta para a mesma tela com o motivo e o e-mail já
  // digitado. Mandar de volta em branco é fazer quem errou o domínio começar
  // do zero.
  const volta = new URLSearchParams({ metodo: entrada.metodo, email });
  if (destino !== '/') volta.set('destino', destino);
  redirect(`/entrar?${volta.toString()}`);
}

/**
 * Sair: encerra a sessão na API e apaga o cookie deste navegador.
 *
 * O cookie é apagado AQUI, e não pelo `Set-Cookie` que a API devolve: aquela
 * resposta chegou a este servidor, não ao navegador. O `Domain` tem de ser o
 * mesmo com que ele foi emitido — sem isso o navegador guarda um segundo
 * cookie vazio, o original continua valendo, e a pessoa "sai" sem sair.
 */
export async function sair(): Promise<void> {
  const pote = await cookies();
  const cookie = pote.get(COOKIE_SESSAO);
  if (cookie) await encerrarSessao(`${COOKIE_SESSAO}=${cookie.value}`);

  pote.set({
    name: COOKIE_SESSAO,
    value: '',
    path: '/',
    maxAge: 0,
    domain: process.env['PIPE_COOKIE_DOMINIO'] || undefined,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
  });

  redirect('/entrar');
}
