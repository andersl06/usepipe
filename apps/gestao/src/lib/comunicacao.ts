import { and, asc, eq } from 'drizzle-orm';
import { canal, respostaPronta, templateMensagem } from '@pipe/db/schema';
import type { CATEGORIAS_TEMPLATE } from '@pipe/db/schema';
import { consultar } from './banco';

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

export async function carregarRespostasProntas(): Promise<RespostaProntaListada[]> {
  return consultar(async (tx) => {
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

export async function carregarModelos(): Promise<ModeloListado[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: templateMensagem.id,
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
      .orderBy(asc(templateMensagem.nome));

    return linhas.map((l) => ({ ...l, variaveis: lerVariaveis(l.variaveis) }));
  });
}

export interface CanalWhatsapp {
  id: string;
  nome: string;
}

/** Só canal WhatsApp: modelo de mensagem é coisa da Cloud API, os outros canais não têm. */
export async function carregarCanaisWhatsapp(): Promise<CanalWhatsapp[]> {
  return consultar(async (tx) => {
    return tx
      .select({ id: canal.id, nome: canal.nome })
      .from(canal)
      .where(and(eq(canal.tipo, 'whatsapp_cloud'), eq(canal.ativo, true)))
      .orderBy(asc(canal.nome));
  });
}
