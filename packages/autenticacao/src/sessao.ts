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

/**
 * O cookie, com os atributos que importam.
 *
 * `httpOnly` tira o token do alcance de qualquer script — sem ele, um XSS vira
 * sequestro de sessão. `sameSite=lax` deixa o retorno do Google funcionar (é
 * navegação de topo) e barra envio em requisição de terceiro. `secure` fica de
 * fora só em `http://localhost`, porque lá não existe HTTPS para exigir.
 */
export function cookieDeSessao(token: string, expiraEm: Date, seguro = true): string {
  const partes = [
    `${NOME_DO_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiraEm.toUTCString()}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

/** O cookie que apaga o cookie. `Max-Age=0` some com ele em qualquer navegador. */
export function cookieDeSaida(seguro = true): string {
  const partes = [`${NOME_DO_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
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
