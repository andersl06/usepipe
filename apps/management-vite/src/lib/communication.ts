/** As categorias de modelo da Meta — o mesmo `CATEGORIAS_TEMPLATE` de `@pipe/db/schema`. */
export const CATEGORIAS_TEMPLATE = ['utilidade', 'marketing', 'autenticacao'] as const;
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

export function headerOffset(cabecalho: string): 0 | 1 {
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

export interface ChannelWhatsapp {
  id: string;
  name: string;
}

/** Limites que o servidor também confere (`communication.ts` da API). */
export const LIMITES_RESPOSTA = { atalho: 50, titulo: 100, corpo: 4096, categoria: 100 } as const;

export interface CategoriaDeRespostas {
  /** `null`: respostas antigas sem categoria. */
  nome: string | null;
  respostas: RespostaProntaListada[];
}

/** Agrupa as respostas por categoria, em ordem alfabética; "sem categoria" vai por último. */
export function agruparPorCategoria(respostas: readonly RespostaProntaListada[]): CategoriaDeRespostas[] {
  const mapa = new Map<string | null, RespostaProntaListada[]>();
  for (const r of respostas) {
    const nome = r.category?.trim() || null;
    mapa.set(nome, [...(mapa.get(nome) ?? []), r]);
  }
  return [...mapa.entries()]
    .map(([nome, lista]) => ({ nome, respostas: lista }))
    .sort((x, y) => {
      if (x.nome === null) return 1;
      if (y.nome === null) return -1;
      return x.nome.localeCompare(y.nome, 'pt-BR');
    });
}

/** Valida o nome de uma categoria nova ou renomeada; devolve o motivo ou `null`. */
export function motivoDoNomeDeCategoria(
  nome: string,
  existentes: readonly (string | null)[],
  atual?: string | null,
): string | null {
  const limpo = nome.trim();
  if (!limpo) return 'Informe o nome da categoria.';
  if (limpo.length > LIMITES_RESPOSTA.categoria) {
    return `O nome aceita até ${LIMITES_RESPOSTA.categoria} caracteres.`;
  }
  if (limpo !== atual && existentes.includes(limpo)) return `Já existe a categoria "${limpo}".`;
  return null;
}

/** Valida uma resposta de texto; devolve o motivo ou `null`. */
export function motivoDaResposta(r: { shortcut: string; title: string; body: string }): string | null {
  const atalho = r.shortcut.trim().replace(/^#/, '');
  if (!r.title.trim()) return 'Informe o título.';
  if (r.title.trim().length > LIMITES_RESPOSTA.titulo) return `O título aceita até ${LIMITES_RESPOSTA.titulo} caracteres.`;
  if (!atalho) return 'Informe o atalho.';
  if (/\s/.test(atalho)) return 'O atalho não pode ter espaço.';
  if (atalho.length > LIMITES_RESPOSTA.atalho) return `O atalho aceita até ${LIMITES_RESPOSTA.atalho} caracteres.`;
  if (!r.body.trim()) return 'Informe o texto da resposta.';
  if (r.body.trim().length > LIMITES_RESPOSTA.corpo) return `O texto aceita até ${LIMITES_RESPOSTA.corpo} caracteres.`;
  return null;
}

/** Quebra o texto do modelo em trechos para destacar `{{n}}` sem HTML (a tela renderiza como texto). */
export function trechosDoModelo(texto: string): { texto: string; variavel: boolean }[] {
  return texto
    .split(/(\{\{\s*\w+\s*\}\})/g)
    .filter((t) => t !== '')
    .map((t) => ({ texto: t, variavel: /^\{\{\s*\w+\s*\}\}$/.test(t) }));
}
