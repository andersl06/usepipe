/**
 * O vocabulário e as réguas da área de configurações.
 *
 * Este arquivo é PURO: nenhum import de `pg`, de `@pipe/db` nem de `next`. É por
 * isso que o componente de cliente (`'use client'`) pode importar daqui sem
 * arrastar o driver do Postgres para dentro do pacote do navegador, e é por isso
 * que o teste roda sem banco.
 *
 * Toda função de recusa devolve **a queixa em português** ou `null`. A tela mostra
 * a queixa direto; a server action chama a mesma função antes de gravar, porque
 * validação de navegador é conveniência e a do servidor é a que conta.
 */

/* ------------------------------------------------------------------ tema */

/**
 * Os três modos. `sistema` não é um tema: é a ausência de escolha, e é o que
 * deixa o `@media (prefers-color-scheme: dark)` de `tokens.css` decidir.
 *
 * O valor vive no navegador de propósito. Tema é preferência de aparelho — a
 * mesma pessoa quer escuro no notebook à noite e claro no monitor da mesa —, e
 * `usuario` não tem coluna para isso nem deveria ter.
 */
export const TEMAS = ['sistema', 'claro', 'escuro'] as const;
export type Tema = (typeof TEMAS)[number];

export const CHAVE_TEMA = 'pipe-tema';

export function temaValido(valor: unknown): valor is Tema {
  return typeof valor === 'string' && (TEMAS as readonly string[]).includes(valor);
}

/* ------------------------------------------------------------ texto e id */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** Espaço nas pontas some; em branco vira `null`, que é o que apaga o campo. */
export function normalizar(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Nome de pessoa, de espaço, de papel: obrigatório e com teto. */
export function recusarNome(valor: string | null, oQue = 'O nome'): string | null {
  if (valor === null) return `${oQue} não pode ficar em branco.`;
  if (valor.length > 120) return `${oQue} passa de 120 caracteres.`;
  return null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Minúsculo e sem espaço: e-mail é chave, e `Ana@X.com` e `ana@x.com` são a mesma. */
export function normalizarEmail(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? '').trim().toLowerCase();
  return limpo === '' ? null : limpo;
}

export function recusarEmail(valor: string | null): string | null {
  if (valor === null) return 'Informe um e-mail.';
  if (!EMAIL.test(valor)) return 'Este e-mail não parece válido.';
  if (valor.length > 254) return 'Este e-mail passa de 254 caracteres.';
  return null;
}

/**
 * URL de imagem e de webhook.
 *
 * `https` é exigido no webhook porque o corpo assinado sai da nossa rede com
 * dado de cliente dentro; em `http` a assinatura protege contra adulteração e
 * não protege contra leitura. No logo, `http` passa — é imagem pública — mas
 * `javascript:` e `data:` não, que é o vetor clássico de `<img src>`.
 */
export function recusarUrl(
  valor: string | null,
  { exigirHttps = false, obrigatoria = true }: { exigirHttps?: boolean; obrigatoria?: boolean } = {},
): string | null {
  if (valor === null) return obrigatoria ? 'Informe uma URL.' : null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return 'Isto não é uma URL. Comece com https://';
  }
  if (exigirHttps) {
    if (url.protocol !== 'https:') return 'A URL precisa ser https://';
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'A URL precisa começar com http:// ou https://';
  }
  if (valor.length > 2000) return 'Esta URL passa de 2000 caracteres.';
  return null;
}

/* -------------------------------------------------- campo personalizado */

/**
 * Os tipos que o campo personalizado do lead aceita.
 *
 * A lista é curta de propósito. No Twenty o usuário cria objeto e campo de vinte
 * tipos; aqui o schema é fixo e o valor mora em `lead.customizados`, que é
 * `jsonb`. Cinco tipos cobrem o que um formulário de lead coleta, e cada um tem
 * uma representação óbvia em JSON — que é a condição para a linguagem de
 * consulta (`dicionario_campo`) continuar sabendo o que fazer com o valor.
 */
export const TIPOS_DE_CAMPO = [
  { codigo: 'texto', rotulo: 'Texto' },
  { codigo: 'numero', rotulo: 'Número' },
  { codigo: 'data', rotulo: 'Data' },
  { codigo: 'booleano', rotulo: 'Sim ou não' },
  { codigo: 'selecao', rotulo: 'Seleção' },
] as const;

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number]['codigo'];

export function tipoDeCampoValido(valor: unknown): valor is TipoDeCampo {
  return TIPOS_DE_CAMPO.some((t) => t.codigo === valor);
}

const CODIGO_DE_CAMPO = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * O código é a CHAVE dentro do `jsonb`, e por isso não é livre.
 *
 * Acento, espaço e maiúscula viram três grafias da mesma ideia dentro do mesmo
 * objeto — e a consulta passa a depender de qual delas quem cadastrou usou. O
 * `sugerirCodigo` transforma o rótulo digitado numa chave aceitável, para que
 * ninguém precise aprender a regra para cadastrar um campo.
 */
export function sugerirCodigo(rotulo: string): string {
  const sem = rotulo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const comecaBem = /^[a-z]/.test(sem) ? sem : `campo_${sem}`;
  return comecaBem.slice(0, 40);
}

export function recusarCodigoDeCampo(valor: string | null): string | null {
  if (valor === null) return 'Informe o código do campo.';
  if (!CODIGO_DE_CAMPO.test(valor)) {
    return 'O código começa com letra e usa só letras minúsculas, números e _ (2 a 40).';
  }
  return null;
}

/* ------------------------------------------------------------ chave de API */

/**
 * O catálogo de escopos, o mesmo de `apps/api/src/autenticacao.ts`.
 *
 * Está repetido aqui, e não importado, porque `apps/crm` não depende de
 * `apps/api` — um aplicativo importar o outro é o começo do monólito que o
 * `pnpm-workspace` existe para evitar. Quando a lista mudar lá, muda aqui; o
 * teste de baixo é o que faz a divergência aparecer.
 */
export const CATALOGO_DE_ESCOPOS = [
  { codigo: 'conversas:ler', rotulo: 'Ler conversas' },
  { codigo: 'conversas:escrever', rotulo: 'Criar e alterar conversa' },
  { codigo: 'mensagens:ler', rotulo: 'Ler mensagens' },
  { codigo: 'mensagens:escrever', rotulo: 'Enviar mensagem' },
  { codigo: 'contatos:ler', rotulo: 'Ler contatos' },
  { codigo: 'contatos:escrever', rotulo: 'Criar e alterar contato' },
  { codigo: 'filas:ler', rotulo: 'Ler filas' },
  { codigo: 'atendentes:ler', rotulo: 'Ler atendentes' },
  { codigo: 'webhooks:escrever', rotulo: 'Gerenciar webhooks' },
] as const;

export function escoposValidos(codigos: readonly string[]): string[] {
  const conhecidos = new Set(CATALOGO_DE_ESCOPOS.map((e) => e.codigo as string));
  return [...new Set(codigos)].filter((c) => conhecidos.has(c));
}

/* -------------------------------------------------------------- webhook */

/**
 * Os eventos que `apps/api/src/webhooks-saida.ts` emite. Mesma razão da lista de
 * escopos para estar repetida aqui: assinar um evento que ninguém emite é um
 * webhook que nunca dispara e ninguém entende por quê.
 */
export const CATALOGO_DE_EVENTOS = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
  'mensagem.criada',
  'mensagem.estado_entrega_alterado',
  'contato.criado',
  'modelo.recategorizado',
  'sla.alertou',
  'sla.estourou',
] as const;

export function eventosValidos(eventos: readonly string[]): string[] {
  const conhecidos = new Set(CATALOGO_DE_EVENTOS as readonly string[]);
  return [...new Set(eventos)].filter((e) => conhecidos.has(e));
}

/* ----------------------------------------------------------------- fuso */

/**
 * O fuso é validado contra o banco de fusos do próprio runtime, não contra uma
 * lista escrita à mão: lista à mão envelhece a cada mudança de horário de verão
 * e passa a recusar um fuso que existe.
 */
export function fusoValido(valor: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- tipos */

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
  ultimoAcessoEm: Date | null;
  papeis: string[];
}

export interface Espaco {
  id: string;
  nome: string;
  slug: string;
  fuso: string;
  idioma: string;
  logoUrl: string | null;
  plano: string;
  implantacao: string;
  membros: number;
  dominios: { dominio: string; verificado: boolean }[];
}

export interface Membro {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  ultimoAcessoEm: Date | null;
  papelId: string | null;
  papel: string | null;
}

export interface ConvitePendente {
  id: string;
  email: string;
  papel: string;
  expiraEm: Date;
  convidadoPor: string | null;
}

export interface ResumoDePapel {
  id: string;
  nome: string;
  descricao: string | null;
  deSistema: boolean;
  permissoes: number;
  membros: number;
}

export interface PermissaoDoCatalogo {
  codigo: string;
  descricao: string;
  grupo: string;
}

export interface PapelDetalhado extends ResumoDePapel {
  concedidas: string[];
  nomesDosMembros: string[];
}

export interface CampoPersonalizado {
  id: string;
  codigo: string;
  rotulo: string;
  tipo: string;
  descricao: string | null;
  /** Quantos leads têm valor gravado nesta chave. É o que impede excluir às cegas. */
  preenchidos: number;
}

export interface ChaveDeApi {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  criadoEm: Date | null;
  expiraEm: Date | null;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
}

export interface WebhookDeSaida {
  id: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  criadoEm: Date | null;
  entregas: { pendentes: number; falhas: number };
}

/** O que a tela devolve de toda escrita. `erro` já vem em português. */
export interface Resultado {
  ok: boolean;
  erro?: string;
  /** Segredo mostrado UMA vez: token de chave, de convite ou de webhook. */
  segredo?: string;
}
