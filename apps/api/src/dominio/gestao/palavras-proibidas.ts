import { and, asc, eq, ne } from 'drizzle-orm';
import { palavraProibida } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { CONFIGURACOES_GERAIS_GERENCIAR } from './configuracoes.js';

/**
 * Palavras proibidas: a lista da conta que barra o envio do atendente.
 *
 * Fonte: `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md` §3.4. O que veio de lá:
 *
 * - **Por conta.** O bucket é `lime://<owner>/buckets/blip:desk:forbidden-words`,
 *   um por dono do bot — não há lista por fila nem por atendente. Aqui é uma
 *   tabela por tenant (migração 0042).
 * - **Só o atendente.** O filtro roda dentro de `sendTextMessage` do Desk, antes
 *   de chamar o serviço de mensagem; o bot e a mensagem ativa (template) não
 *   passam por ele. É `envio.ts` quem aplica, e só para texto livre assinado por
 *   atendente.
 * - **Bloqueia, não avisa.** Achou palavra: toast de erro com a lista entre aspas
 *   e `return` — a mensagem não sai e o texto fica intacto no input. Aqui é
 *   `ErroPipe` 400 com as palavras no `detalhe`, para a tela mostrar o mesmo aviso.
 * - **Duas passadas** (`checkForbiddenWords`, app.js:77434-77455): primeiro as
 *   FRASES (termo com espaço), como substring do texto inteiro; se alguma bater,
 *   devolve só as frases. Senão, as PALAVRAS SOLTAS: o texto é quebrado nos
 *   separadores de `SEPARADORES` e cada token é comparado por SUBSTRING
 *   (`token.includes(termo)`, o `exactMatch = false` que é o default da origem).
 * - **Sem acento e sem caixa.** `normalizeText(lower, diacritics, collapse)` é o
 *   que a origem QUIS fazer; o bug documentado em §3.4 (o ramo dos diacríticos
 *   parte da string original e descarta o lowercase) faz o filtro deles rodar
 *   case-sensitive por padrão. Aqui vale a intenção, não o bug: `PALAVRA`,
 *   `palavra` e `pálavra` são a mesma coisa.
 * - **Cache de 5 min** (`CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME`, 300000 ms,
 *   `blip-desk-regras.md`): a lista é lida do banco uma vez por tenant e guardada
 *   em memória; o CRUD invalida na hora.
 *
 * Decisões Pipe, onde a origem não define:
 * - Sem `exactMatch` nem `considerDiacritics` por conta: a origem tem as duas
 *   opções no JSON do bucket, mas nenhuma tela as expõe e os defaults são os que
 *   valem. Ficam fixos nos defaults (substring, sem acento) até alguém pedir.
 * - O fail-open da origem (exceção no filtro → envia mesmo assim) NÃO é copiado:
 *   aqui o filtro roda no servidor, dentro da transação do envio, e a única falha
 *   possível é a do banco — que já derruba a transação de qualquer jeito.
 */

/**
 * Reaproveitada do catálogo — a mesma de Configurações gerais. Palavra proibida
 * é configuração do atendimento da conta, como identidade e pesquisa; na origem
 * ela mora nas configurações do bot (`HasForbiddenWords`,
 * `blip-gestao-regras-tecnicas.md`).
 */
export const PALAVRA_PROIBIDA_GERENCIAR = CONFIGURACOES_GERAIS_GERENCIAR;

/** `CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME` da origem: 5 minutos. */
export const VALIDADE_DO_CACHE_MS = 300_000;

/**
 * O regex de tokenização da origem (app.js:77445), ao pé da letra — sem hífen,
 * que lá também não separa: "bem-vindo" é um token só.
 */
const SEPARADORES = /[,\s/.!?;:'"@#$%^&*[\]{}()|`+=_ˆ]+/;

/**
 * `StringUtils.normalizeText(texto, lower, diacritics, collapse)` como foi
 * escrito para funcionar: minúsculas, sem acento, espaços colapsados.
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
 * `checkForbiddenWords`: devolve os termos da lista encontrados no texto — como
 * estão cadastrados, para a recusa mostrá-los entre aspas. Vazio = pode enviar.
 */
export function encontrarPalavrasProibidas(texto: string, termos: readonly string[]): string[] {
  const textoNormal = normalizarTermo(texto);
  if (!textoNormal) return [];

  // 1ª passada: frases. `checkForbiddenPhrases` (app.js:77427) é substring pura
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
  expiraEm: number;
}

/** Uma lista por tenant. Vive no processo da `api`, como `cacheDeCanal` em `banco.ts`. */
const cachePorTenant = new Map<string, ListaGuardada>();

/**
 * Os termos ATIVOS do tenant, do cache ou do banco. É o que `envio.ts` chama a
 * cada mensagem — e é por isso que existe cache: varrer a tabela a cada envio
 * seria uma consulta por mensagem para uma lista que muda quase nunca.
 */
export async function termosProibidosDoTenant(tx: TransacaoPipe, tid: string): Promise<string[]> {
  const guardada = cachePorTenant.get(tid);
  if (guardada && guardada.expiraEm > Date.now()) return guardada.termos;

  const linhas = await tx
    .select({ termo: palavraProibida.termo })
    .from(palavraProibida)
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.ativo, true)));
  const termos = linhas.map((l) => l.termo);
  cachePorTenant.set(tid, { termos, expiraEm: Date.now() + VALIDADE_DO_CACHE_MS });
  return termos;
}

/** Invalida a lista guardada. Sem tenant, esquece todas — existe para o teste. */
export function esquecerPalavrasProibidas(tid?: string): void {
  if (tid) cachePorTenant.delete(tid);
  else cachePorTenant.clear();
}

/**
 * A recusa: confere o texto contra a lista do tenant e lança se achar alguma.
 * A frase segue o toast da origem (`forbiddenWords.title` / `forbiddenWords.text`):
 * o título "Palavras proibidas" e a lista do que foi encontrado, entre aspas.
 */
export async function exigirSemPalavrasProibidas(
  tx: TransacaoPipe,
  tid: string,
  texto: string,
): Promise<void> {
  const termos = await termosProibidosDoTenant(tx, tid);
  if (termos.length === 0) return;
  const achadas = encontrarPalavrasProibidas(texto, termos);
  if (achadas.length === 0) return;
  const lista = achadas.map((p) => `"${p}"`).join(', ');
  throw ErroPipe.requisicao(
    'palavra_proibida',
    `Palavras proibidas: sua mensagem contém ${lista} e não foi enviada. Remova e tente de novo.`,
    { palavras: achadas },
  );
}

/* ------------------------------------------------------------------- CRUD */

export interface PalavraProibidaListada {
  id: string;
  termo: string;
  ativo: boolean;
}

export interface PedidoDePalavraProibida {
  termo: string;
  ativo?: boolean;
}

export interface PedidoDeEdicaoDePalavraProibida {
  termo?: string;
  ativo?: boolean;
}

const COLUNAS = {
  id: palavraProibida.id,
  termo: palavraProibida.termo,
  ativo: palavraProibida.ativo,
};

export async function carregarPalavrasProibidas(
  tx: TransacaoPipe,
  tid: string,
): Promise<PalavraProibidaListada[]> {
  return tx
    .select(COLUNAS)
    .from(palavraProibida)
    .where(eq(palavraProibida.tenantId, tid))
    .orderBy(asc(palavraProibida.termo));
}

/** Espaços das pontas fora e os de dentro colapsados: "muito  ruim" e "muito ruim" são o mesmo termo. */
function termoConferido(bruto: unknown): string {
  const termo = String(bruto ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!termo) throw ErroPipe.requisicao('termo_obrigatorio', 'Informe a palavra ou frase.');
  return termo;
}

/**
 * O único do banco é por `lower(termo)`; a conferência aqui é mais estrita — sem
 * acento também — porque para o filtro "açúcar" e "acucar" são o mesmo termo, e
 * cadastrar os dois só confundiria a lista.
 */
async function termoEmUso(
  tx: TransacaoPipe,
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

async function palavraViva(tx: TransacaoPipe, tid: string, id: string): Promise<PalavraProibidaListada> {
  const [atual] = await tx
    .select(COLUNAS)
    .from(palavraProibida)
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('palavra proibida');
  return atual;
}

export async function criarPalavraProibida(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDePalavraProibida,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, PALAVRA_PROIBIDA_GERENCIAR);

  const termo = termoConferido(pedido.termo);
  const ativo = pedido.ativo ?? true;

  const conflito = await termoEmUso(tx, tid, termo);
  if (conflito) {
    throw ErroPipe.conflito('termo_em_uso', `"${conflito}" já está na lista de palavras proibidas.`);
  }

  const [criada] = await tx
    .insert(palavraProibida)
    .values({ tenantId: tid, termo, ativo })
    .returning({ id: palavraProibida.id });
  if (!criada) throw ErroPipe.requisicao('palavra_nao_criada', 'Não consegui gravar a palavra.');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'criou',
    objetoTipo: 'palavra_proibida',
    objetoId: criada.id,
    depois: { termo, ativo },
  });
  esquecerPalavrasProibidas(tid);
  return { id: criada.id };
}

export async function editarPalavraProibida(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDePalavraProibida,
): Promise<PalavraProibidaListada> {
  const atual = await palavraViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, PALAVRA_PROIBIDA_GERENCIAR);

  // Sem anotação de tipo — literal fresco aceita `Record<string, unknown>` em `diferenca`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.termo !== undefined) depois.termo = termoConferido(pedido.termo);
  if (pedido.ativo !== undefined) depois.ativo = pedido.ativo;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.termo !== antes.termo) {
    const conflito = await termoEmUso(tx, tid, depois.termo, id);
    if (conflito) {
      throw ErroPipe.conflito('termo_em_uso', `"${conflito}" já está na lista de palavras proibidas.`);
    }
  }

  const [gravada] = await tx
    .update(palavraProibida)
    .set({ termo: depois.termo, ativo: depois.ativo, atualizadoEm: new Date() })
    .where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)))
    .returning(COLUNAS);
  if (!gravada) throw ErroPipe.naoEncontrado('palavra proibida');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
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
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await palavraViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, PALAVRA_PROIBIDA_GERENCIAR);

  await tx.delete(palavraProibida).where(and(eq(palavraProibida.tenantId, tid), eq(palavraProibida.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'palavra_proibida',
    objetoId: id,
    antes: { termo: atual.termo, ativo: atual.ativo },
  });
  esquecerPalavrasProibidas(tid);
}
