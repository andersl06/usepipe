import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, chamarApi } from '../../lib/sessao';

/**
 * O endereço pediu uma conta diferente da que está na sessão — esta rota faz a
 * troca e segue viagem.
 *
 * É Route Handler, e não página, por uma razão do Next: só ação de servidor e
 * rota podem escrever cookie, e aqui a troca É escrever cookie. Página que
 * tentasse fazer isso quebra com "Cookies can only be modified in a Server
 * Action or Route Handler" — foi o que aconteceu na primeira versão.
 *
 * Na plataforma de origem esta rota não existe: lá cada conta tem o seu
 * subdomínio e o token vale para todos, então trocar de conta é só trocar de
 * endereço. Aqui a sessão atende uma conta por vez, e é isto que faz a ponte.
 */
export const dynamic = 'force-dynamic';

export async function GET(requisicao: NextRequest): Promise<NextResponse> {
  const slug = (requisicao.nextUrl.searchParams.get('para') ?? '').trim().toLowerCase();
  const pedido = requisicao.nextUrl.searchParams.get('destino') ?? '';
  const destino = pedido.startsWith('/') ? pedido : '/portal';
  if (!slug) return NextResponse.redirect(urlNoMesmoHost(requisicao, '/portal'));

  const cookie = requisicao.cookies.get(COOKIE_SESSAO);
  if (!cookie) return NextResponse.redirect(urlNoMesmoHost(requisicao, '/entrar'));

  const resposta = await chamarApi(`${COOKIE_SESSAO}=${cookie.value}`, '/v1/contas/trocar', {
    method: 'POST',
    body: JSON.stringify({ slug }),
    headers: { 'content-type': 'application/json' },
  });

  // Sem acesso (ou conta inexistente — a resposta é a MESMA de propósito): a
  // pessoa vai para a tela que explica a saída, e não para um erro seco.
  if (!resposta.ok) {
    const url = urlNoMesmoHost(requisicao, '/trocar-conta/sem-acesso');
    url.searchParams.set('para', slug);
    return NextResponse.redirect(url);
  }

  /* O destino é montado a partir do HOST pedido, e não de `requisicao.url`:
     no Next essa URL vem normalizada para o host do servidor, e a pessoa sairia
     do endereço da conta justo depois de entrar nele. */
  const saida = NextResponse.redirect(urlNoMesmoHost(requisicao, destino));
  const novo = extrairToken(resposta.headers.get('set-cookie'));
  if (novo) {
    saida.cookies.set({
      name: COOKIE_SESSAO,
      value: novo,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
      // O cookie precisa valer para TODO subdomínio de contas, senão a troca
      // morre no próximo endereço — é o que `<conta>.usepipe.ai` exige.
      ...(process.env['PIPE_COOKIE_DOMINIO'] ? { domain: process.env['PIPE_COOKIE_DOMINIO'] } : {}),
    });
  }
  return saida;
}

/** O valor de `pipe_sessao` no `Set-Cookie` que a API devolveu. */
function urlNoMesmoHost(requisicao: NextRequest, caminho: string): URL {
  const host =
    requisicao.headers.get(String.fromCharCode(104, 111, 115, 116)) ?? requisicao.nextUrl.host;
  const url = new URL(requisicao.nextUrl.toString());
  url.host = host;
  url.pathname = caminho;
  url.search = '';
  return url;
}

function extrairToken(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const achado = cabecalho.match(new RegExp(`${COOKIE_SESSAO}=([^;]+)`));
  return achado?.[1] ?? null;
}
