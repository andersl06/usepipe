/**
 * The settings area's vocabulary and rulers.
 *
 * This file is PURE: no import of `pg`, `@pipe/db`, or `next`. That's why the
 * client component (`'use client'`) can import from here without dragging the
 * Postgres driver into the browser package, and why the test runs without a
 * database.
 *
 * Every rejection function returns **the complaint in Portuguese** or `null`.
 * The screen shows the complaint directly; the server action calls the same
 * function before saving, because browser validation is a convenience and the
 * server's is what counts.
 */

/* ------------------------------------------------------------------ tema */

/**
 * The three modes. `sistema` isn't a theme: it's the absence of a choice, and
 * it's what lets `tokens.css`'s `@media (prefers-color-scheme: dark)` decide.
 *
 * The value lives in the browser on purpose. Theme is a device preference —
 * the same person wants dark on their laptop at night and light on their desk
 * monitor — and `usuario` has no column for that, nor should it.
 */
export const TEMAS = ['sistema', 'claro', 'escuro'] as const;
export type Tema = (typeof TEMAS)[number];

export const KEY_THEME = 'pipe-tema';

export function temaValido(value: unknown): value is Tema {
  return typeof value === 'string' && (TEMAS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------ texto e id */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Leading/trailing space disappears; blank becomes `null`, which is what clears the field. */
export function normalizar(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Person, workspace, or role name: required and capped. */
export function recusarNome(value: string | null, oQue = 'O nome'): string | null {
  if (value === null) return `${oQue} não pode ficar em branco.`;
  if (value.length > 120) return `${oQue} passa de 120 caracteres.`;
  return null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lowercase and no spaces: email is a key, and `Ana@X.com` and `ana@x.com` are the same one. */
export function normalizarEmail(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? '').trim().toLowerCase();
  return limpo === '' ? null : limpo;
}

export function recusarEmail(value: string | null): string | null {
  if (value === null) return 'Informe um e-mail.';
  if (!EMAIL.test(value)) return 'Este e-mail não parece válido.';
  if (value.length > 254) return 'Este e-mail passa de 254 caracteres.';
  return null;
}

/**
 * Image and webhook URLs.
 *
 * `https` is required on the webhook because the signed body leaves our network
 * with customer data inside; over `http` the signature protects against
 * tampering but not against reading. On the logo, `http` is allowed — it's a
 * public image — but `javascript:` and `data:` aren't, which is the classic
 * `<img src>` vector.
 */
export function recusarUrl(
  value: string | null,
  { exigirHttps = false, obrigatoria = true }: { exigirHttps?: boolean; obrigatoria?: boolean } = {},
): string | null {
  if (value === null) return obrigatoria ? 'Informe uma URL.' : null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Isto não é uma URL. Comece com https://';
  }
  if (exigirHttps) {
    if (url.protocol !== 'https:') return 'A URL precisa ser https://';
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'A URL precisa começar com http:// ou https://';
  }
  if (value.length > 2000) return 'Esta URL passa de 2000 caracteres.';
  return null;
}

/* -------------------------------------------------- campo personalizado */

/**
 * The types the lead's custom field accepts.
 *
 * The list is short on purpose. In Twenty the user creates an object and a
 * field out of twenty types; here the schema is fixed and the value lives in
 * `lead.customizados`, which is `jsonb`. Five types cover what a lead form
 * collects, and each has an obvious JSON representation — which is the
 * condition for the query language (`dicionario_campo`) to keep knowing what
 * to do with the value.
 */
export const TIPOS_DE_CAMPO = [
  { codigo: 'texto', rotulo: 'Texto' },
  { codigo: 'numero', rotulo: 'Número' },
  { codigo: 'data', rotulo: 'Data' },
  { codigo: 'booleano', rotulo: 'Sim ou não' },
  { codigo: 'selecao', rotulo: 'Seleção' },
] as const;

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number]['codigo'];

export function tipoDeCampoValido(value: unknown): value is TipoDeCampo {
  return TIPOS_DE_CAMPO.some((t) => t.codigo === value);
}

const CODIGO_DE_CAMPO = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * The code is the KEY inside the `jsonb`, and that's why it isn't free-form.
 *
 * Accent, space, and capitalization would turn into three spellings of the
 * same idea inside the same object — and the query would start depending on
 * which one whoever registered it used. `sugerirCodigo` turns the typed label
 * into an acceptable key, so nobody needs to learn the rule to register a
 * field.
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

export function recusarCodigoDeCampo(value: string | null): string | null {
  if (value === null) return 'Informe o código do campo.';
  if (!CODIGO_DE_CAMPO.test(value)) {
    return 'O código começa com letra e usa só letras minúsculas, números e _ (2 a 40).';
  }
  return null;
}

/* ------------------------------------------------------------ chave de API */

/**
 * The scope catalog, the same one in `apps/api/src/autenticacao.ts`.
 *
 * It's repeated here, not imported, because `apps/crm` doesn't depend on
 * `apps/api` — one app importing the other is the start of the monolith
 * `pnpm-workspace` exists to prevent. When the list changes there, it changes
 * here; the test below is what surfaces the drift.
 */
export const CATALOG_OF_SCOPES = [
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

export function scopesValid(codigos: readonly string[]): string[] {
  const conhecidos = new Set(CATALOG_OF_SCOPES.map((e) => e.codigo as string));
  return [...new Set(codigos)].filter((c) => conhecidos.has(c));
}

/* -------------------------------------------------------------- webhook */

/**
 * The events `apps/api/src/webhooks-saida.ts` emits. Same reason as the scope
 * list for being duplicated here: subscribing to an event nobody emits is a
 * webhook that never fires and nobody understands why.
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
 * The timezone is validated against the runtime's own timezone database, not
 * against a hand-written list: a hand-written list ages with every
 * daylight-saving change and starts rejecting a timezone that exists.
 */
export function fusoValido(value: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
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
  lastAccessIn: Date | null;
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
  deployment: string;
  members: number;
  dominios: { domain: string; verificado: boolean }[];
}

export interface Member {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  lastAccessIn: Date | null;
  roleId: string | null;
  role: string | null;
}

export interface InvitationPending {
  id: string;
  email: string;
  role: string;
  expiraEm: Date;
  guestBy: string | null;
}

export interface RoleSummary {
  id: string;
  nome: string;
  description: string | null;
  deSistema: boolean;
  permissions: number;
  members: number;
}

export interface CatalogPermission {
  codigo: string;
  description: string;
  grupo: string;
}

export interface RoleDetailed extends RoleSummary {
  concedidas: string[];
  membersNames: string[];
}

export interface CampoPersonalizado {
  id: string;
  codigo: string;
  rotulo: string;
  tipo: string;
  description: string | null;
  /**
   * How many leads have a value saved under this key. It's what stops someone
   * from blindly deleting it.
   */
  preenchidos: number;
}

export interface ApiKey {
  id: string;
  nome: string;
  prefix: string;
  scopes: string[];
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

/** What the screen gets back from every write. `erro` already comes in Portuguese. */
export interface Resultado {
  ok: boolean;
  error?: string;
  /** Segredo mostrado UMA vez: token de chave, de convite ou de webhook. */
  secret?: string;
}
