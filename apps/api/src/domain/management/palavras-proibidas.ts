import { and, asc, eq, ne } from 'drizzle-orm';
import { palavraProibida } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { SETTINGS_GENERAL_MANAGE } from './settings.js';

/**
 * Forbidden terms block agent sends per `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md` §3.4. Source bucket `lime://<owner>/buckets/blip:desk:forbidden-words` is per bot owner; Pipe uses a tenant table (migration 0042). Filter only agent free text in Desk `sendTextMessage` via `envio.ts`, before delivery; bots and active-message templates bypass it. On match, block, list terms in quotes and leave input intact; Pipe returns `ErroPipe` 400 with matched terms in `detalhe`. Match source `checkForbiddenWords` (app.js:77434-77455): first phrase substrings over the whole text, returning only phrases if any match; otherwise split into `SEPARADORES` tokens and use `token.includes(termo)`. Normalize case, accents and whitespace. Source has a diacritics branch bug that loses lowercase; Pipe follows intended behavior, so `PALAVRA`, `palavra`, and `pálavra` match. Cache per tenant for five minutes (`CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME`, 300000 ms) and invalidate on CRUD. Pipe fixes source defaults for `exactMatch` and `considerDiacritics` because no screen exposes them. Do not copy source fail-open: this server filter runs in the send transaction, whose database failure already aborts the send.
 */

/**
 * Reuse the General Settings catalog permission. Forbidden terms are account-wide attendance configuration like identity and survey; Blip stores them in bot settings (`HasForbiddenWords`, `blip-gestao-regras-tecnicas.md`).
 */
export const WORD_FORBIDDEN_MANAGE = SETTINGS_GENERAL_MANAGE;

/** `CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME` da origem: 5 minutos. */
export const VALIDITY_OF_CACHE_MS = 300_000;

/**
 * Match the source tokenizer regex (`app.js:77445`) exactly, including that hyphens do not split tokens: 'bem-vindo' stays one token.
 */
const SEPARADORES = /[,\s/.!?;:'"@#$%^&*[\]{}()|`+=_ˆ]+/;

/**
 * Implement intended `StringUtils.normalizeText(texto, lower, diacritics, collapse)`: lowercase, remove accents and collapse whitespace.
 */
export function normalizarTermo(texto: string): string {
  return texto
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Like source `checkForbiddenWords`, return matching registered terms in their stored spelling for the quoted refusal; empty means sending is allowed.
 */
export function encontrarPalavrasProibidas(texto: string, termos: readonly string[]): string[] {
  const textoNormal = normalizarTermo(texto);
  if (!textoNormal) return [];

  // First pass checks phrases: `checkForbiddenPhrases` (`app.js:77427`) uses a plain substring
  // sobre o texto inteiro, sem fronteira de palavra.
  const frases = termos.filter((termo) => termo.trim().includes(' '));
  const frasesAchadas = frases.filter((frase) => textoNormal.includes(normalizarTermo(frase)));
  if (frasesAchadas.length > 0) return frasesAchadas;

  // 2ª passada: palavras soltas, token a token, por substring (`exactMatch = false`).
  const tokens = textoNormal.split(SEPARADORES).filter(Boolean);
  const palavras = termos.filter((termo) => !termo.trim().includes(' '));
  return palavras.filter((palavra) => {
    const alvo = normalizarTermo(palavra);
    return alvo !== '' && tokens.some((token) => token.includes(alvo));
  });
}

/* ------------------------------------------------------------------ cache */

interface ListaGuardada {
  termos: string[];
  expiresAt: number;
}

/** Uma lista por tenant. Vive no processo da `api`, como `cacheDeCanal` em `banco.ts`. */
const cacheByTenant = new Map<string, ListaGuardada>();

/**
 * Read this tenant's ACTIVE forbidden terms from cache or database on every `envio.ts` message. Cache avoids a database query per send for a rarely changing list.
 */
export async function termosProibidosDoTenant(tx: TransactionPipe, tid: string): Promise<string[]> {
  const guardada = cacheByTenant.get(tid);
  if (guardada && guardada.expiresAt > Date.now()) return guardada.termos;

  const linhas = await tx
    .select({ termo: palavraProibida.termo })
    .from(palavraProibida)
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.ativo, true)));
  const termos = linhas.map((l) => l.termo);
  cacheByTenant.set(tid, { termos, expiresAt: Date.now() + VALIDITY_OF_CACHE_MS });
  return termos;
}

/** Invalidate the cached list; without a tenant, clear all lists for tests. */
export function esquecerPalavrasProibidas(tid?: string): void {
  if (tid) cacheByTenant.delete(tid);
  else cacheByTenant.clear();
}

/**
 * Check text against the tenant's forbidden terms and throw when matched. Match source toast `forbiddenWords.title`/`forbiddenWords.text`: title 'Palavras proibidas' and matched terms in quotes.
 */
export async function exigirSemPalavrasProibidas(
  tx: TransactionPipe,
  tid: string,
  texto: string,
): Promise<void> {
  const termos = await termosProibidosDoTenant(tx, tid);
  if (termos.length === 0) return;
  const achadas = encontrarPalavrasProibidas(texto, termos);
  if (achadas.length === 0) return;
  const lista = achadas.map((p) => `"${p}"`).join(', ');
  throw PipeError.request(
    'word_forbidden',
    `Palavras proibidas: sua mensagem contém ${lista} e não foi enviada. Remova e tente de novo.`,
    { palavras: achadas },
  );
}

/* ------------------------------------------------------------------- CRUD */

export interface PalavraProibidaListada {
  id: string;
  term: string;
  active: boolean;
}

export interface PedidoDePalavraProibida {
  term: string;
  active?: boolean;
}

export interface RequestOfEditOfWordForbidden {
  term?: string;
  active?: boolean;
}

const COLUNAS = {
  id: palavraProibida.id,
  term: palavraProibida.termo,
  active: palavraProibida.ativo,
};

export async function carregarPalavrasProibidas(
  tx: TransactionPipe,
  tid: string,
): Promise<PalavraProibidaListada[]> {
  return tx
    .select(COLUNAS)
    .from(palavraProibida)
    .where(eq(palavraProibida.tenantId, tid))
    .orderBy(asc(palavraProibida.termo));
}

/** Trim outer whitespace and collapse inner whitespace so equivalent phrases register as one term. */
function termoConferido(bruto: unknown): string {
  const termo = String(bruto ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!termo) throw PipeError.request('term_required', 'Informe a palavra ou frase.');
  return termo;
}

/**
 * The database unique key uses `lower(termo)`, but registration also ignores accents: the filter treats 'açúcar' and 'acucar' as one term, so storing both would confuse the list.
 */
async function termoEmUso(
  tx: TransactionPipe,
  tid: string,
  termo: string,
  excetoId?: string,
): Promise<string | null> {
  const alvo = normalizarTermo(termo);
  const linhas = await tx
    .select({ id: palavraProibida.id, termo: palavraProibida.termo })
    .from(palavraProibida)
    .where(and(eq(palavraProibida.tenantId, tid), excetoId ? ne(palavraProibida.id, excetoId) : undefined));
  return linhas.find((l) => normalizarTermo(l.termo) === alvo)?.termo ?? null;
}

async function palavraViva(tx: TransactionPipe, tid: string, id: string): Promise<PalavraProibidaListada> {
  const [atual] = await tx
    .select(COLUNAS)
    .from(palavraProibida)
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('palavra proibida');
  return atual;
}

export async function createWordForbidden(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  pedido: PedidoDePalavraProibida,
): Promise<{ id: string }> {
  await requirePermission(tx, userId, WORD_FORBIDDEN_MANAGE);

  const termo = termoConferido(pedido.term);
  const ativo = pedido.active ?? true;

  const conflito = await termoEmUso(tx, tid, termo);
  if (conflito) {
    throw PipeError.conflito('term_in_use', `"${conflito}" já está na lista de palavras proibidas.`);
  }

  const [criada] = await tx
    .insert(palavraProibida)
    .values({ tenantId: tid, termo, ativo })
    .returning({ id: palavraProibida.id });
  if (!criada) throw PipeError.request('word_not_created', 'Não consegui gravar a palavra.');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: 'criou',
    objetoTipo: 'palavra_proibida',
    objetoId: criada.id,
    depois: { termo, ativo },
  });
  esquecerPalavrasProibidas(tid);
  return { id: criada.id };
}

export async function editarPalavraProibida(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfWordForbidden,
): Promise<PalavraProibidaListada> {
  const atual = await palavraViva(tx, tid, id);
  await requirePermission(tx, usuarioId, WORD_FORBIDDEN_MANAGE);

  // Leave the type unannotated: the inferred literal satisfies `Record<string, unknown>` in `diferenca`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.term !== undefined) depois.term = termoConferido(pedido.term);
  if (pedido.active !== undefined) depois.active = pedido.active;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.term !== antes.term) {
    const conflito = await termoEmUso(tx, tid, depois.term, id);
    if (conflito) {
      throw PipeError.conflito('term_in_use', `"${conflito}" já está na lista de palavras proibidas.`);
    }
  }

  const [gravada] = await tx
    .update(palavraProibida)
    .set({ termo: depois.term, ativo: depois.active, atualizadoEm: new Date() })
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)))
    .returning(COLUNAS);
  if (!gravada) throw PipeError.naoEncontrado('palavra proibida');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'palavra_proibida',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  esquecerPalavrasProibidas(tid);
  return gravada;
}

export async function excluirPalavraProibida(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await palavraViva(tx, tid, id);
  await requirePermission(tx, usuarioId, WORD_FORBIDDEN_MANAGE);

  await tx.delete(palavraProibida).where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'palavra_proibida',
    objetoId: id,
    antes: { termo: atual.term, ativo: atual.active },
  });
  esquecerPalavrasProibidas(tid);
}
