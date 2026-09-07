import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * A sessão do Pipe.
 *
 * O token vai no cookie do navegador; no banco fica só o **hash**. É a mesma
 * regra da chave de API: quem lê o banco não consegue se passar por ninguém.
 *
 * A busca é PELO HASH, com índice único — e não pelo id da sessão com
 * comparação depois. Isso mantém a consulta em uma linha e evita o padrão de
 * "achou o registro, agora compara", que é onde nasce comparação vazando tempo.
 */

/** 8 horas. É o teto honesto de revogação sem SCIM: quem sai da empresa cliente
 *  perde o acesso na próxima revalidação, não no instante do desligamento. */
export const DURACAO_PADRAO_MS = 8 * 60 * 60 * 1000;

export const NOME_DO_COOKIE = 'pipe_sessao';

export interface TokenDeSessao {
  /** Vai para o cookie. Nunca é gravado. */
  token: string;
  /** Vai para o banco. Nunca sai de lá. */
  hash: string;
  expiraEm: Date;
}

export function criarToken(duracaoMs = DURACAO_PADRAO_MS, agora = new Date()): TokenDeSessao {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashDoToken(token),
    expiraEm: new Date(agora.getTime() + duracaoMs),
  };
}

/**
 * SHA-256 puro, sem custo de derivação, e isso é deliberado: o token tem 256
 * bits de entropia gerada por nós, não é senha escolhida por gente. Derivação
 * lenta protege contra dicionário, e não há dicionário que alcance isto.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensIguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface OpcoesDeCookie {
  /**
   * O domínio-pai, com ponto na frente: `.pipe.com.br`.
   *
   * É o que faz o cookie emitido por `api.pipe.com.br` viajar para
   * `gestao.pipe.com.br`, `app.pipe.com.br` e `crm.pipe.com.br`. Cada aplicativo
   * mora numa URL própria, e sem isto cada um precisaria do próprio login.
   *
   * A alternativa seria `SameSite=None` com CORS de credencial, e ela é pior:
   * `None` manda o cookie em requisição de QUALQUER site, e é justamente o que
   * o `Lax` existe para impedir. Subdomínio do mesmo pai é o mesmo site.
   *
   * Em desenvolvimento fica indefinido: `localhost` não aceita domínio de
   * cookie, e as portas diferentes já são a mesma origem para este fim.
   */
  dominio?: string | undefined;
  /** Fora só em `http://localhost`, onde não existe HTTPS para exigir. */
  seguro?: boolean;
}

/**
 * O cookie, com os atributos que importam.
 *
 * `HttpOnly` tira o token do alcance de qualquer script — sem ele, um XSS vira
 * sequestro de sessão. `SameSite=Lax` deixa o retorno do Google funcionar (é
 * navegação de topo) e barra envio em requisição de terceiro.
 */
export function cookieDeSessao(
  token: string,
  expiraEm: Date,
  opcoes: OpcoesDeCookie = {},
): string {
  return montarCookie(token, opcoes, `Expires=${expiraEm.toUTCString()}`);
}

/** O cookie que apaga o cookie. `Max-Age=0` some com ele em qualquer navegador. */
export function cookieDeSaida(opcoes: OpcoesDeCookie = {}): string {
  return montarCookie('', opcoes, 'Max-Age=0');
}

function montarCookie(valor: string, opcoes: OpcoesDeCookie, prazo: string): string {
  const partes = [`${NOME_DO_COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', prazo];
  // O domínio precisa vir ANTES do Secure? Não — a ordem é livre. Mas ele só
  // entra quando existe: `Domain=localhost` invalida o cookie em vários
  // navegadores, e o sintoma é login que "não faz nada".
  if (opcoes.dominio) partes.push(`Domain=${opcoes.dominio}`);
  if (opcoes.seguro ?? true) partes.push('Secure');
  return partes.join('; ');
}

/**
 * As origens que podem chamar a API com credencial.
 *
 * Lista fechada, montada do ambiente. Nunca `*`: com credencial, curinga é
 * recusado pelo navegador — e mesmo que não fosse, seria abrir a API para
 * qualquer site fazer requisição autenticada em nome de quem está logado.
 */
export function origensPermitidas(env: NodeJS.ProcessEnv = process.env): string[] {
  const cru = env['PIPE_ORIGENS'] ?? '';
  return cru
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function origemPermitida(origem: string | undefined, permitidas: string[]): boolean {
  if (!origem) return false;
  return permitidas.includes(origem.replace(/\/$/, ''));
}

export interface SessaoAtiva {
  id: string;
  tenantId: string;
  usuarioId: string;
  expiraEm: Date;
  origem: string;
}

/** Uma sessão vale enquanto não expirou e não foi encerrada à mão. */
export function estaValida(
  sessao: { expiraEm: Date; encerradaEm: Date | null },
  agora = new Date(),
): boolean {
  if (sessao.encerradaEm) return false;
  return sessao.expiraEm.getTime() > agora.getTime();
}
