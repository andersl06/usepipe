import { and, asc, eq, ne } from 'drizzle-orm';
import { canal, fluxo, respostaPronta, templateMensagem } from '@pipe/db/schema';
import type { CATEGORIAS_TEMPLATE } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/** Do catálogo — migração 0030: nenhuma permissão cobria resposta pronta antes dela. */
export const RESPOSTA_PRONTA_GERENCIAR = 'resposta_pronta.gerenciar';

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
export function cabecalhoTemMidia(cabecalho: string): boolean {
  return cabecalho === 'imagem' || cabecalho === 'video' || cabecalho === 'documento';
}

export function deslocamentoDoCabecalho(cabecalho: string): 0 | 1 {
  return cabecalhoTemMidia(cabecalho) ? 1 : 0;
}

export interface RespostaProntaListada {
  id: string;
  atalho: string;
  titulo: string;
  corpo: string;
  categoria: string | null;
  ativa: boolean;
}

export async function carregarRespostasProntas(
  tx: TransacaoPipe,
): Promise<RespostaProntaListada[]> {
  return consultar(tx, async (tx) => {
    return tx
      .select({
        id: respostaPronta.id,
        atalho: respostaPronta.atalho,
        titulo: respostaPronta.titulo,
        corpo: respostaPronta.corpo,
        categoria: respostaPronta.categoria,
        ativa: respostaPronta.ativa,
      })
      .from(respostaPronta)
      .where(eq(respostaPronta.escopo, 'empresa'))
      .orderBy(asc(respostaPronta.titulo));
  });
}

export interface ModeloListado {
  id: string;
  canalId: string;
  corpo: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  cabecalhoTipo: string;
  variaveis: string[];
  canalNome: string;
}

/** `variaveis` é `jsonb` sem `check`: uma linha corrompida não pode derrubar a lista inteira. */
function lerVariaveis(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

export async function carregarModelos(
  tx: TransacaoPipe,
  canalId?: string,
): Promise<ModeloListado[]> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: templateMensagem.id,
        canalId: templateMensagem.canalId,
        corpo: templateMensagem.corpo,
        nome: templateMensagem.nome,
        idioma: templateMensagem.idioma,
        categoria: templateMensagem.categoria,
        statusMeta: templateMensagem.statusMeta,
        cabecalhoTipo: templateMensagem.cabecalhoTipo,
        variaveis: templateMensagem.variaveis,
        canalNome: canal.nome,
      })
      .from(templateMensagem)
      .innerJoin(canal, eq(canal.id, templateMensagem.canalId))
      .where(canalId ? eq(templateMensagem.canalId, canalId) : undefined)
      .orderBy(asc(templateMensagem.nome));

    return linhas.map((l) => ({ ...l, variaveis: lerVariaveis(l.variaveis) }));
  });
}

export async function carregarCanalDoFluxo(
  tx: TransacaoPipe,
  tid: string,
  fluxoId: string,
): Promise<string | null> {
  return consultar(tx, async (tx) => {
    const [bot] = await tx
      .select({ canalId: fluxo.canalId })
      .from(fluxo)
      .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
      .limit(1);
    return bot?.canalId ?? null;
  });
}

export interface CanalWhatsapp {
  id: string;
  nome: string;
}

/** Só canal WhatsApp: modelo de mensagem é coisa da Cloud API, os outros canais não têm. */
export async function carregarCanaisWhatsapp(tx: TransacaoPipe): Promise<CanalWhatsapp[]> {
  return consultar(tx, async (tx) => {
    return tx
      .select({ id: canal.id, nome: canal.nome })
      .from(canal)
      .where(and(eq(canal.tipo, 'whatsapp_cloud'), eq(canal.ativo, true)))
      .orderBy(asc(canal.nome));
  });
}

/* ===================================================== escrita — respostas prontas
   Item 2 da tarefa de cadastros do Atendimento: criar, editar, excluir. Mesmo
   padrão REST de `ciclo-de-vida-do-fluxo.ts` — `ErroPipe` com status de
   verdade — e não o `Resultado` em 200 das `acoes/*` (que segue existindo só
   para `salvarRespostaPronta`, a criação antiga, sem quebrar quem já chama). */

export interface PedidoDeRespostaPronta {
  atalho: string;
  titulo: string;
  corpo: string;
  categoria?: string | null;
  ativa?: boolean;
}

export interface PedidoDeEdicaoDeRespostaPronta {
  atalho?: string;
  titulo?: string;
  corpo?: string;
  categoria?: string | null;
  ativa?: boolean;
}

function atalhoConferido(bruto: unknown): string {
  const atalho = String(bruto ?? '')
    .trim()
    .replace(/^#/, '');
  if (!atalho) throw ErroPipe.requisicao('atalho_obrigatorio', 'Informe o atalho.');
  if (/\s/.test(atalho)) {
    throw ErroPipe.requisicao(
      'atalho_com_espaco',
      'O atalho não pode ter espaço — é o que o atendente digita direto depois do #.',
    );
  }
  return atalho;
}

function tituloConferido(bruto: unknown): string {
  const titulo = String(bruto ?? '').trim();
  if (!titulo) throw ErroPipe.requisicao('titulo_obrigatorio', 'Informe o título.');
  return titulo;
}

function corpoConferido(bruto: unknown): string {
  const corpo = String(bruto ?? '').trim();
  if (!corpo) throw ErroPipe.requisicao('corpo_obrigatorio', 'Informe o corpo da resposta.');
  return corpo;
}

/**
 * `resposta_pronta.atalho` só tem `index`, não `uniqueIndex` (ver o comentário
 * no topo do arquivo) — a unicidade por tenant é regra desta função, checada
 * antes do `insert`/`update`, e não da constraint.
 */
async function atalhoEmUso(
  tx: TransacaoPipe,
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
        eq(respostaPronta.escopo, 'empresa'),
        eq(respostaPronta.atalho, atalho),
        excetoId ? ne(respostaPronta.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito?.titulo ?? null;
}

async function respostaProntaViva(
  tx: TransacaoPipe,
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
      ativa: respostaPronta.ativa,
    })
    .from(respostaPronta)
    .where(
      and(
        eq(respostaPronta.tenantId, tid),
        eq(respostaPronta.escopo, 'empresa'),
        eq(respostaPronta.id, id),
      ),
    )
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('resposta pronta');
  return atual;
}

export async function criarRespostaPronta(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeRespostaPronta,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, RESPOSTA_PRONTA_GERENCIAR);

  const atalho = atalhoConferido(pedido.atalho);
  const titulo = tituloConferido(pedido.titulo);
  const corpo = corpoConferido(pedido.corpo);
  const categoria = pedido.categoria ? String(pedido.categoria).trim() || null : null;
  const ativa = pedido.ativa ?? true;

  const conflito = await atalhoEmUso(tx, tid, atalho);
  if (conflito) {
    throw ErroPipe.conflito(
      'atalho_em_uso',
      `O atalho "#${atalho}" já é usado por "${conflito}". Escolha outro.`,
    );
  }

  const [criada] = await tx
    .insert(respostaPronta)
    .values({ tenantId: tid, escopo: 'empresa', categoria, atalho, titulo, corpo, ativa })
    .returning({ id: respostaPronta.id });
  if (!criada) throw ErroPipe.requisicao('resposta_nao_criada', 'Não consegui gravar a resposta.');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'criou',
    objetoTipo: 'resposta_pronta',
    objetoId: criada.id,
    depois: { atalho, titulo, categoria, ativa },
  });
  return { id: criada.id };
}

export async function editarRespostaPronta(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeRespostaPronta,
): Promise<RespostaProntaListada> {
  const atual = await respostaProntaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, RESPOSTA_PRONTA_GERENCIAR);

  // Sem anotação de tipo — literal fresco aceita `Record<string, unknown>` em `diferenca`.
  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.atalho !== undefined) depois.atalho = atalhoConferido(pedido.atalho);
  if (pedido.titulo !== undefined) depois.titulo = tituloConferido(pedido.titulo);
  if (pedido.corpo !== undefined) depois.corpo = corpoConferido(pedido.corpo);
  if (pedido.categoria !== undefined) {
    depois.categoria = pedido.categoria ? String(pedido.categoria).trim() || null : null;
  }
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  if (depois.atalho !== antes.atalho) {
    const conflito = await atalhoEmUso(tx, tid, depois.atalho, id);
    if (conflito) {
      throw ErroPipe.conflito(
        'atalho_em_uso',
        `O atalho "#${depois.atalho}" já é usado por "${conflito}". Escolha outro.`,
      );
    }
  }

  const [gravada] = await tx
    .update(respostaPronta)
    .set({
      atalho: depois.atalho,
      titulo: depois.titulo,
      corpo: depois.corpo,
      categoria: depois.categoria,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(respostaPronta.tenantId, tid), eq(respostaPronta.id, id)))
    .returning({
      id: respostaPronta.id,
      atalho: respostaPronta.atalho,
      titulo: respostaPronta.titulo,
      corpo: respostaPronta.corpo,
      categoria: respostaPronta.categoria,
      ativa: respostaPronta.ativa,
    });
  if (!gravada) throw ErroPipe.naoEncontrado('resposta pronta');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'resposta_pronta',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravada;
}

export async function excluirRespostaPronta(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await respostaProntaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, RESPOSTA_PRONTA_GERENCIAR);

  await tx.delete(respostaPronta).where(and(eq(respostaPronta.tenantId, tid), eq(respostaPronta.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'resposta_pronta',
    objetoId: id,
    antes: { atalho: atual.atalho, titulo: atual.titulo },
  });
}
