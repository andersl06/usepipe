import { and, asc, eq, ne } from 'drizzle-orm';
import { channel, flow, respostaPronta, templateMessage as templateMessage } from '@pipe/db/schema';
import type { CATEGORIAS_TEMPLATE } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/** Do catálogo — migração 0030: nenhuma permissão cobria resposta pronta antes dela. */
export const RESPONSE_READY_MANAGE = 'resposta_pronta.gerenciar';

/**
 * Comunicação: respostas prontas e modelos de mensagem do WhatsApp.
 *
 * Duas leituras que moldam as duas telas:
 *
 * 1. `resposta_pronta.atalho` tem só `index`, não `uniqueIndex` — a tabela NÃO
 *    garante unicidade por tenant. É por isso que `salvarRespostaPronta` (em
 *    `app/comunicacao/acoes.ts`) faz o `select` de conflito ele mesmo, antes do
 *    `insert`, dentro da mesma transação.
 * 2. `resposta_pronta.escopo` separa "empresa" (o gestor cadastra, aqui) de
 *    "pessoal" (o atendente cria no Desk — ver §5 de `2026-09-05-desk-requisitos.md`
 *    e o comentário de `estrutura-gestao.tsx`). Esta tela só lista e só cria
 *    `escopo = 'empresa'`; a pessoal não é de gestão.
 */

export type CategoriaTemplate = (typeof CATEGORIAS_TEMPLATE)[number];

export const ROTULO_CATEGORIA_TEMPLATE: Record<CategoriaTemplate, string> = {
  utilidade: 'Utilidade',
  marketing: 'Marketing',
  autenticacao: 'Autenticação',
};

export const ROTULO_STATUS_META: Record<string, string> = {
  aprovado: 'Aprovado',
  pendente: 'Pendente',
  rejeitado: 'Rejeitado',
  pausado: 'Pausado',
};

export const CABECALHOS_TEMPLATE = ['nenhum', 'texto', 'imagem', 'video', 'documento'] as const;
export type CabecalhoTemplate = (typeof CABECALHOS_TEMPLATE)[number];

export const ROTULO_CABECALHO: Record<CabecalhoTemplate, string> = {
  nenhum: 'Sem cabeçalho',
  texto: 'Texto',
  imagem: 'Imagem',
  video: 'Vídeo',
  documento: 'Documento',
};

/**
 * Só cabeçalho de MÍDIA consome a posição 1 do envio. A mesma regra vive em
 * `apps/workers/src/whatsapp/template.ts` (quem de fato dispara) — este arquivo
 * não importa de lá porque não há fronteira de pacote entre apps, mas a conta é
 * a mesma, e é ela que faz a tela avisar o cadastro antes do disparo errar em
 * produção.
 */
export function headerHasMedia(cabecalho: string): boolean {
  return cabecalho === 'imagem' || cabecalho === 'video' || cabecalho === 'documento';
}

export function offsetOfHeader(cabecalho: string): 0 | 1 {
  return headerHasMedia(cabecalho) ? 1 : 0;
}

export interface RespostaProntaListada {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category: string | null;
  ativa: boolean;
}

export async function carregarRespostasProntas(
  tx: TransactionPipe,
): Promise<RespostaProntaListada[]> {
  return consultar(tx, async (tx) => {
    return tx
      .select({
        id: respostaPronta.id,
        atalho: respostaPronta.atalho,
        titulo: respostaPronta.titulo,
        corpo: respostaPronta.corpo,
        categoria: respostaPronta.categoria,
        ativa: respostaPronta.active,
      })
      .from(respostaPronta)
      .where(eq(respostaPronta.scope, 'empresa'))
      .orderBy(asc(respostaPronta.titulo));
  });
}

export interface TemplateListed {
  id: string;
  channelId: string;
  body: string;
  name: string;
  idioma: string;
  category: string;
  statusMeta: string;
  headerType: string;
  variables: string[];
  channelName: string;
}

/** `variaveis` é `jsonb` sem `check`: uma linha corrompida não pode derrubar a lista inteira. */
function readVariables(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function carregarModelos(
  tx: TransactionPipe,
  channelId?: string,
): Promise<TemplateListed[]> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: templateMessage.id,
        canalId: templateMessage.canalId,
        corpo: templateMessage.corpo,
        nome: templateMessage.nome,
        idioma: templateMessage.idioma,
        categoria: templateMessage.categoria,
        statusMeta: templateMessage.statusMeta,
        cabecalhoTipo: templateMessage.cabecalhoTipo,
        variaveis: templateMessage.variables,
        canalNome: channel.nome,
      })
      .from(templateMessage)
      .innerJoin(channel, eq(channel.id, templateMessage.canalId))
      .where(channelId ? eq(templateMessage.canalId, channelId) : undefined)
      .orderBy(asc(templateMessage.nome));

    return linhas.map((l) => ({ ...l, variaveis: readVariables(l.variaveis) }));
  });
}

export async function loadChannelOfFlow(
  tx: TransactionPipe,
  tid: string,
  flowId: string,
): Promise<string | null> {
  return consultar(tx, async (tx) => {
    const [bot] = await tx
      .select({ canalId: flow.channelId })
      .from(flow)
      .where(and(eq(flow.id, flowId), eq(flow.tenantId, tid)))
      .limit(1);
    return bot?.canalId ?? null;
  });
}

export interface ChannelWhatsapp {
  id: string;
  name: string;
}

/** Só canal WhatsApp: modelo de mensagem é coisa da Cloud API, os outros canais não têm. */
export async function loadChannelsWhatsapp(tx: TransactionPipe): Promise<ChannelWhatsapp[]> {
  return consultar(tx, async (tx) => {
    return tx
      .select({ id: channel.id, nome: channel.nome })
      .from(channel)
      .where(and(eq(channel.tipo, 'whatsapp_cloud'), eq(channel.ativo, true)))
      .orderBy(asc(channel.nome));
  });
}

/* ===================================================== escrita — respostas prontas
   Item 2 da tarefa de cadastros do Atendimento: criar, editar, excluir. Mesmo
   padrão REST de `ciclo-de-vida-do-fluxo.ts` — `ErroPipe` com status de
   verdade — e não o `Resultado` em 200 das `acoes/*` (que segue existindo só
   para `salvarRespostaPronta`, a criação antiga, sem quebrar quem já chama). */

export interface PedidoDeRespostaPronta {
  shortcut: string;
  title: string;
  body: string;
  category?: string | null;
  active?: boolean;
}

export interface RequestOfEditOfResponseReady {
  shortcut?: string;
  title?: string;
  body?: string;
  category?: string | null;
  ativa?: boolean;
}

function atalhoConferido(bruto: unknown): string {
  const atalho = String(bruto ?? '')
    .trim()
    .replace(/^#/, '');
  if (!atalho) throw PipeError.request('shortcut_required', 'Informe o atalho.');
  if (/\s/.test(atalho)) {
    throw PipeError.request(
      'shortcut_with_space',
      'O atalho não pode ter espaço — é o que o atendente digita direto depois do #.',
    );
  }
  return atalho;
}

function tituloConferido(bruto: unknown): string {
  const titulo = String(bruto ?? '').trim();
  if (!titulo) throw PipeError.request('title_required', 'Informe o título.');
  return titulo;
}

function corpoConferido(bruto: unknown): string {
  const corpo = String(bruto ?? '').trim();
  if (!corpo) throw PipeError.request('body_required', 'Informe o corpo da resposta.');
  return corpo;
}

/**
 * `resposta_pronta.atalho` só tem `index`, não `uniqueIndex` (ver o comentário
 * no topo do arquivo) — a unicidade por tenant é regra desta função, checada
 * antes do `insert`/`update`, e não da constraint.
 */
async function atalhoEmUso(
  tx: TransactionPipe,
  tid: string,
  atalho: string,
  excetoId?: string,
): Promise<string | null> {
  const [conflito] = await tx
    .select({ titulo: respostaPronta.titulo })
    .from(respostaPronta)
    .where(
      and(
        eq(respostaPronta.tenantId, tid),
        eq(respostaPronta.scope, 'empresa'),
        eq(respostaPronta.atalho, atalho),
        excetoId ? ne(respostaPronta.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito?.titulo ?? null;
}

async function respostaProntaViva(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<RespostaProntaListada> {
  const [atual] = await tx
    .select({
      id: respostaPronta.id,
      atalho: respostaPronta.atalho,
      titulo: respostaPronta.titulo,
      corpo: respostaPronta.corpo,
      categoria: respostaPronta.categoria,
      ativa: respostaPronta.active,
    })
    .from(respostaPronta)
    .where(
      and(
        eq(respostaPronta.tenantId, tid),
        eq(respostaPronta.scope, 'empresa'),
        eq(respostaPronta.id, id),
      ),
    )
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('resposta pronta');
  return atual;
}

export async function createResponseReady(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  pedido: PedidoDeRespostaPronta,
): Promise<{ id: string }> {
  await exigirPermission(tx, userId, RESPONSE_READY_MANAGE);

  const atalho = atalhoConferido(pedido.shortcut);
  const titulo = tituloConferido(pedido.title);
  const corpo = corpoConferido(pedido.body);
  const categoria = pedido.category ? String(pedido.category).trim() || null : null;
  const active = pedido.active ?? true;

  const conflito = await atalhoEmUso(tx, tid, atalho);
  if (conflito) {
    throw PipeError.conflito(
      'shortcut_in_use',
      `O atalho "#${atalho}" já é usado por "${conflito}". Escolha outro.`,
    );
  }

  const [criada] = await tx
    .insert(respostaPronta)
    .values({ tenantId: tid, escopo: 'empresa', categoria, atalho, titulo, corpo, active })
    .returning({ id: respostaPronta.id });
  if (!criada) throw PipeError.request('response_not_created', 'Não consegui gravar a resposta.');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: userId },
    acao: 'criou',
    objetoTipo: 'resposta_pronta',
    objetoId: criada.id,
    depois: { atalho, titulo, categoria, active },
  });
  return { id: criada.id };
}

export async function editarRespostaPronta(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEditOfResponseReady,
): Promise<RespostaProntaListada> {
  const atual = await respostaProntaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RESPONSE_READY_MANAGE);

  // Sem anotação de tipo — literal fresco aceita `Record<string, unknown>` em `diferenca`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.shortcut !== undefined) depois.shortcut = atalhoConferido(pedido.shortcut);
  if (pedido.title !== undefined) depois.title = tituloConferido(pedido.title);
  if (pedido.body !== undefined) depois.body = corpoConferido(pedido.body);
  if (pedido.category !== undefined) {
    depois.category = pedido.category ? String(pedido.category).trim() || null : null;
  }
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.shortcut !== antes.shortcut) {
    const conflito = await atalhoEmUso(tx, tid, depois.shortcut, id);
    if (conflito) {
      throw PipeError.conflito(
        'shortcut_in_use',
        `O atalho "#${depois.shortcut}" já é usado por "${conflito}". Escolha outro.`,
      );
    }
  }

  const [gravada] = await tx
    .update(respostaPronta)
    .set({
      atalho: depois.shortcut,
      titulo: depois.title,
      corpo: depois.body,
      categoria: depois.category,
      active: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(respostaPronta.tenantId, tid), eq(respostaPronta.id, id)))
    .returning({
      id: respostaPronta.id,
      atalho: respostaPronta.atalho,
      titulo: respostaPronta.titulo,
      corpo: respostaPronta.corpo,
      categoria: respostaPronta.categoria,
      ativa: respostaPronta.active,
    });
  if (!gravada) throw PipeError.naoEncontrado('resposta pronta');

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'resposta_pronta',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravada;
}

export async function excluirRespostaPronta(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await respostaProntaViva(tx, tid, id);
  await exigirPermission(tx, usuarioId, RESPONSE_READY_MANAGE);

  await tx.delete(respostaPronta).where(and(eq(respostaPronta.tenantId, tid), eq(respostaPronta.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'resposta_pronta',
    objetoId: id,
    antes: { atalho: atual.shortcut, titulo: atual.title },
  });
}
