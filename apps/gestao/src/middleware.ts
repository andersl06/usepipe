import { NextResponse, type NextRequest } from 'next/server';
import { CABECALHO_CAMINHO, CABECALHO_CONTA, contaDoHost } from './lib/rotas';

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

/**
 * Repassa o caminho pedido ao servidor.
 *
 * Server Component não enxerga a URL, e `exigirEu()` precisa dela para uma
 * decisão só: conta com onboarding em aberto vai para `/bem-vindo` — menos
 * quando já está nas telas do onboarding, senão o redirecionamento vira laço.
 */
function seguir(requisicao: NextRequest): NextResponse {
  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set(CABECALHO_CAMINHO, requisicao.nextUrl.pathname);

  /* O endereço também diz em QUE CONTA a pessoa quer estar — é o subdomínio, e
     ele copia o `<conta>.blip.ai` da origem. Quem decide o que fazer com isso é
     `exigirEu()`, que tem a sessão em mãos; aqui só se transporta. */
  const conta = contaDoHost(requisicao.headers.get('host'));
  if (conta) cabecalhos.set(CABECALHO_CONTA, conta);

  return NextResponse.next({ request: { headers: cabecalhos } });
}

export function middleware(requisicao: NextRequest): NextResponse {
  const { pathname, search } = requisicao.nextUrl;
  if (PUBLICO.test(pathname)) return NextResponse.next();
  if (requisicao.cookies.has('pipe_sessao')) return seguir(requisicao);

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
 * A Gestão passou a ter `public/` (o fundo da tela de entrada), e arquivo de lá
 * também não pode ser redirecionado: o fundo é justamente da tela pública, e
 * mandá-lo para `/entrar` devolve HTML no lugar da imagem. Por isso o matcher
 * dispensa qualquer caminho com extensão — rota de página nunca tem ponto.
 */
export const config = {
  // Duas barras invertidas: o ponto tem de chegar ESCAPADO ao padrão. Com uma
  // só, o TypeScript a come na string e o padrão vira `.*..*`, que casa quase
  // todo caminho — e desliga o middleware no aplicativo inteiro.
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
