import type { Eu } from '@pipe/contracts';

/**
 * A fronteira com a `api` para tudo que é entrada: quem está logado, por onde
 * esta empresa entra, e para quem é um convite.
 *
 * Nada aqui sabe de tela — nem JSX, nem `revalidatePath`, nem cookie lido do
 * ambiente do Next. O cookie chega como TEXTO, por parâmetro, e é isso que
 * mantém o arquivo mudável de lugar sem virar reescrita quando a tela migrar
 * para o Vite (README, "Quem fala com o banco").
 *
 * Todo endpoint usado aqui já existe: `GET /v1/eu`, `POST /v1/auth/sair`,
 * `POST /v1/auth/descobrir`, `GET /v1/convites/:token` e os dois pontos de
 * partida do login (`/v1/auth/google` e `/v1/auth/sso/:slug`). Nada foi
 * inventado, e nada é reimplementado.
 */

/** A API vista por ESTE servidor. Atrás de proxy é o nome interno do serviço. */
const URL_API = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');

/**
 * A mesma API vista pelo NAVEGADOR.
 *
 * Entrar com o Google é navegação de topo: o link sai no HTML e o navegador vai
 * sozinho, sem passar por este servidor. Se a base fosse a interna, o botão
 * apontaria para um nome que só existe dentro da rede do Docker. Em
 * desenvolvimento as duas são a mesma, e por isso uma cai na outra.
 */
const URL_API_PUBLICA = (process.env['PIPE_URL_API_PUBLICA'] ?? URL_API).replace(/\/$/, '');

/**
 * ESTE aplicativo, visto pelo navegador.
 *
 * Vai na ida do login como `?origem=`, e é o que faz a volta cair aqui e não no
 * front de outro módulo: a API atende os três e não tem como adivinhar de qual
 * deles a pessoa saiu. Do lado de lá só é aceita origem que esteja em
 * `PIPE_ORIGENS` — a mesma lista fechada do CORS.
 */
const ORIGEM_DESTE_APP = (
  process.env['PIPE_URL_ESTE_APP'] ?? 'http://localhost:3200'
).replace(/\/$/, '');

/** O cookie de sessão emitido pela API. `HttpOnly`; a tela só o repassa. */
export const COOKIE_SESSAO = 'pipe_sessao';

/** O que `POST /v1/auth/descobrir` responde, mais os dois modos de falha da tela. */
export interface EntradaDescoberta {
  /** `sso` manda ao IdP da empresa; `senha` mostra o caminho do Google. */
  metodo: 'sso' | 'senha' | 'invalido' | 'falha';
  /** Caminho na API, quando `sso`. Falta só a base pública. */
  irPara?: string;
}

/** O mínimo que `GET /v1/convites/:token` mostra a quem ainda está do lado de fora. */
export interface ConviteVisivel {
  email: string;
  papel: string;
  tenant: { nome: string; slug: string };
  /** ISO-8601, como sai da API. Quem formata é a tela. */
  expiraEm: string;
}

function cabecalhoDeSessao(cookie: string): HeadersInit {
  return { cookie, accept: 'application/json' };
}

/**
 * Quem está logado. `null` quando não há sessão — e isso NÃO é erro: a tela de
 * entrada é pública e chega aqui sem cookie o tempo todo.
 */
export async function buscarEu(cookie: string): Promise<Eu | null> {
  const resposta = await fetch(`${URL_API}/v1/eu`, {
    headers: cabecalhoDeSessao(cookie),
    cache: 'no-store',
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as Eu;
}

/**
 * Encerra a sessão do lado da API. Sair duas vezes não é erro lá, e não é aqui.
 *
 * Engole a falha de rede de propósito: quem clicou em Sair vai ter o cookie
 * apagado deste navegador de qualquer jeito, e travar a saída porque a API não
 * respondeu deixaria a pessoa logada na tela — que é o pior dos dois.
 *
 * ponytail: a sessão sobreviveria no banco até vencer sozinha. Se um dia isso
 * importar, a saída é uma fila de revogação, não um `throw` aqui.
 */
export async function encerrarSessao(cookie: string): Promise<void> {
  try {
    await fetch(`${URL_API}/v1/auth/sair`, {
      method: 'POST',
      headers: cabecalhoDeSessao(cookie),
      cache: 'no-store',
    });
  } catch {
    /* sem rede, o cookie local já resolve o que a pessoa pediu */
  }
}

/**
 * Por onde este e-mail entra.
 *
 * A API responde igual para e-mail conhecido e desconhecido, de propósito — só
 * domínio verificado com SSO ativo devolve `sso`. Não há o que a tela possa
 * deduzir daqui sobre quem é cliente do Pipe, e é assim que tem de ser.
 */
export async function descobrirEntrada(email: string): Promise<EntradaDescoberta> {
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
  // 400 é sempre `email_invalido` nesta rota — a única validação que ela faz.
  if (resposta.status === 400) return { metodo: 'invalido' };
  if (!resposta.ok) return { metodo: 'falha' };
  return (await resposta.json()) as EntradaDescoberta;
}

/**
 * Para quem é o convite. `null` cobre vencido, já usado e inexistente: para
 * quem está do lado de fora os três são a mesma coisa — peça outro — e separar
 * contaria se aquele token um dia existiu.
 */
export async function verConvite(token: string): Promise<ConviteVisivel | null> {
  const resposta = await fetch(`${URL_API}/v1/convites/${encodeURIComponent(token)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as ConviteVisivel;
}

/**
 * O destino é sempre CAMINHO INTERNO. `//outro.site` num redirecionamento é
 * phishing usando o nosso domínio de trampolim; a API confere de novo do lado
 * dela, e conferir dos dois lados custa uma linha.
 */
export function caminhoInterno(destino: string | undefined | null): string {
  return destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
}

/** O botão "Entrar com Google". Com `convite`, entra aceitando o convite. */
export function urlDeEntradaComGoogle(opcoes: { destino?: string; convite?: string } = {}): string {
  const url = new URL(`${URL_API_PUBLICA}/v1/auth/google`);
  if (opcoes.convite) url.searchParams.set('convite', opcoes.convite);
  url.searchParams.set('destino', caminhoInterno(opcoes.destino));
  url.searchParams.set('origem', ORIGEM_DESTE_APP);
  return url.toString();
}

/** `irPara` vem da descoberta como caminho; aqui ele ganha a base pública. */
export function urlNaApi(caminho: string, destino?: string): string {
  const url = new URL(`${URL_API_PUBLICA}${caminho}`);
  url.searchParams.set('destino', caminhoInterno(destino));
  url.searchParams.set('origem', ORIGEM_DESTE_APP);
  return url.toString();
}
