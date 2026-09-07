import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sem cookie de sessão, a pessoa vai para `/entrar`. É a porta, e ela é uma só.
 *
 * Aqui só se confere a PRESENÇA do cookie — nada de validar sessão: o
 * middleware roda em toda requisição, e uma ida à API por navegação de
 * imagem seria caro e frágil. Quem valida é `exigirEu()`, no servidor, contra
 * `GET /v1/eu`: cookie vencido ou forjado cai lá e volta para cá.
 *
 * Duas rotas ficam de fora, e são as duas públicas do produto: a de entrada e a
 * do convite. Sem essa exceção, quem não tem sessão seria mandado para `/entrar`
 * e de lá para `/entrar`, para sempre.
 */
const PUBLICO = /^\/(entrar|convite)(\/|$)/;

export function middleware(requisicao: NextRequest): NextResponse {
  const { pathname, search } = requisicao.nextUrl;
  if (PUBLICO.test(pathname)) return NextResponse.next();
  if (requisicao.cookies.has('pipe_sessao')) return NextResponse.next();

  const url = requisicao.nextUrl.clone();
  url.pathname = '/entrar';
  url.search = '';
  // Para onde a pessoa queria ir. A API confere que é caminho interno antes de
  // usá-lo, e a tela confere de novo antes de mandar.
  if (pathname !== '/') url.searchParams.set('destino', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/**
 * Fora do matcher: o que não é navegação de página. Arquivo do build e ícone
 * não têm para onde ser redirecionados — e mandá-los para `/entrar` quebraria a
 * própria tela de entrada.
 *
 * Não há `public/` em nenhum dos três aplicativos (a marca é SVG em componente,
 * a fonte vem do Google), então `_next/` e o ícone cobrem tudo.
 */
export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};
