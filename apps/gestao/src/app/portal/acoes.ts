'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESSAO, chamarApi } from '../../lib/sessao';
import { cookieDaSessao } from '../../lib/conta';

/**
 * Trocar a conta em vigor — o que o seletor do canto superior esquerdo faz.
 *
 * Quem troca a sessão é a `api`: ela confere que o e-mail desta sessão tem
 * usuário ativo na conta de destino e emite um token novo. Aqui só se transporta
 * o cookie, porque a resposta com `Set-Cookie` chegou a ESTE servidor, não ao
 * navegador — é o mesmo motivo pelo qual o "sair" apaga o cookie por aqui.
 */
export async function trocarDeConta(dados: FormData): Promise<void> {
  const tenantId = String(dados.get('tenantId') ?? '').trim();
  if (!tenantId) return;

  const resposta = await chamarApi(await cookieDaSessao(), '/v1/contas/trocar', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
    headers: { 'content-type': 'application/json' },
  });
  if (!resposta.ok) redirect('/portal?erro=troca');

  const novo = extrairToken(resposta.headers.get('set-cookie'));
  if (novo) {
    (await cookies()).set({
      name: COOKIE_SESSAO,
      value: novo,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // O mesmo critério do cookie emitido no login: em desenvolvimento, sem
      // HTTPS, `secure` faria o navegador descartar em silêncio.
      secure: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
      ...(process.env['PIPE_COOKIE_DOMINIO'] ? { domain: process.env['PIPE_COOKIE_DOMINIO'] } : {}),
    });
  }

  /* Para o portal da conta NOVA, e não para a mesma tela: o que a pessoa quer
     ver depois de trocar é o que existe do outro lado. Conta que ainda não
     passou pelo onboarding é desviada lá, pelo guard de sempre. */
  redirect('/portal');
}

/** O valor de `pipe_sessao` no `Set-Cookie` que a API devolveu. */
function extrairToken(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const achado = cabecalho.match(new RegExp(`${COOKIE_SESSAO}=([^;]+)`));
  return achado?.[1] ?? null;
}
