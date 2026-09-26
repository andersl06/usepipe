import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { carimbos, id, listaCheck, moment } from './comum.js';

/**
 * Module 1, identity and tenancy, is the foundation and depends on no other module. `tenant` holds name, logo, color, timezone, and language customization: white-labeling is configuration, never a separate build.
 */

/**
 * Where the tenant is hosted.
 *
 * `compartilhada` is the shared database with RLS, the default for most tenants. `dedicada` is a tenant moved to its own instance for contractual or load reasons. See `referencias-blip/pesquisa/arquitetura-multi-tenant.md`.
 *
 * Adding this column while the table is small is cheap; doing so just before the first migration would be costly. The code needs this field to locate a tenant without consulting a spreadsheet.
 */
export const DEPLOYMENTS = ['compartilhada', 'dedicada'] as const;

/**
 * Three plans with limits used for billing, per `docs/specs/2026-09-07-preco.md`. Keep them in code, not environment configuration: the AI conversation cap must share a source with enforcement, and environment-based prices can diverge from the screen and invoice.
 *
 * `conversasIaPorAtendente` is the allowance protecting margin. AI is the cost that scales with use; without a cap a high-volume tenant could consume the margin before the bill reveals it.
 */
export const PLANOS = ['essencial', 'operacao', 'escala'] as const;
export type Plano = (typeof PLANOS)[number];

export interface LimitesDoPlano {
  priceByAgentCentavos: number;
  minimumOfAgents: number;
  conversationsAiByAgent: number;

  samplingOfQualityReview: number;
  excessCentavosByConversation: number;
  sso: boolean;
}

export const LIMITES_DO_PLANO: Readonly<Record<Plano, LimitesDoPlano>> = {
  essencial: {
    priceByAgentCentavos: 9_700,
    minimumOfAgents: 3,
    conversationsAiByAgent: 300,
    samplingOfQualityReview: 0.2,
    excessCentavosByConversation: 25,
    sso: false,
  },
  operacao: {
    priceByAgentCentavos: 17_900,
    minimumOfAgents: 5,
    conversationsAiByAgent: 1_000,
    samplingOfQualityReview: 1,
    excessCentavosByConversation: 18,
    sso: false,
  },
  /* Contract-only plan: price and allowance live in the tenant record, not this table. */
  escala: {
    priceByAgentCentavos: 0,
    minimumOfAgents: 20,
    conversationsAiByAgent: 0,
    samplingOfQualityReview: 1,
    excessCentavosByConversation: 0,
    sso: true,
  },
};

export const tenant = pgTable(
  'tenant',
  {
    id: id(),
    nome: text('nome').notNull(),
    slug: text('slug').notNull().unique(),
    fuso: text('fuso').notNull().default('America/Sao_Paulo'),
    idioma: text('idioma').notNull().default('pt-BR'),
    logoUrl: text('logo_url'),
    corPrimaria: text('cor_primaria'),
    plano: text('plano').notNull().default('essencial'),
    deployment: text('implantacao').notNull().default('compartilhada'),
    ativo: boolean('ativo').notNull().default(true),
    /**
     * Each customer has one Twenty instance and API key, per `docs/specs/2026-09-07-integracao-twenty.md` §5. CRM isolation is physical, with no default instance. Empty means no CRM and no integration, never a silent fallback that might send one tenant's data to another tenant's CRM. `twentyChave` is encrypted at rest with the Meta-token keyring (`PIPE_CHAVES_SEGREDO`). Unlike the Meta token, this key also grants read access to the entire tenant customer base.
     */
    twentyUrl: text('twenty_url'),
    twentyKey: text('twenty_chave'),
    /**
     * Details the person supplies in "minha conta" after login. All are nullable because self-service creates the account without them, and the welcome screen then requests them; requiring them before login would defeat self-service. `funcionarios` is a text range such as "1 a 10", as in the source.
     */
    site: text('site'),
    funcionarios: text('funcionarios'),
    city: text('cidade'),
    state: text('estado'),
    pais: text('pais'),
    telefone: text('telefone'),
    optinWhatsapp: boolean('optin_whatsapp').notNull().default(false),
    /** Null means onboarding is incomplete, and Management routes to "minha conta". */
    onboardingConcluidoEm: moment('onboarding_concluido_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('tenant_implantacao_ck', t.deployment, DEPLOYMENTS),
    listaCheck('tenant_plano_ck', t.plano, PLANOS),
  ],
);

/**
 * Business tables reference the tenant through this helper. It lives in identity rather than `comum` to avoid an import cycle with the `tenant` table itself.
 */
export const refTenant = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

export const user = pgTable(
  'usuario',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    email: text('email').notNull(),
    senhaHash: text('senha_hash'),
    avatarUrl: text('avatar_url'),
    ativo: boolean('ativo').notNull().default(true),
    lastAccessAt: moment('ultimo_acesso_em'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('usuario_tenant_email_uk').on(t.tenantId, t.email)],
);

/**
 * Role scope (migration 0021).
 *
 * `conta` covers contract roles `admin`, `member`, `guest`, matching the source labels "Admin", "Pode editar", and "Pode visualizar". Each person has ONE, and only those appear in Members and invitations. `atendimento` covers manager, supervisor, agent, and reviewer roles; a person may have zero or more. Effective permissions are the union.
 */
export const SCOPES_ROLE = ['conta', 'atendimento'] as const;
export type ScopeRole = (typeof SCOPES_ROLE)[number];

/** Source `roleId` values represented here by the NAMES of the three account roles. */
export const PAPEIS_OF_ACCOUNT = ['admin', 'member', 'guest'] as const;
export type RoleOfAccount = (typeof PAPEIS_OF_ACCOUNT)[number];

export const role = pgTable(
  'papel',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    description: text('descricao'),

    deSistema: boolean('de_sistema').notNull().default(false),
    scope: text('escopo').notNull().default('atendimento'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('papel_tenant_nome_uk').on(t.tenantId, t.nome),
    /* Alvo das FKs compostas de `usuario_papel` e `convite`. */
    uniqueIndex('papel_id_escopo_uk').on(t.id, t.scope),
    listaCheck('papel_escopo_ck', t.scope, SCOPES_ROLE),
  ],
);

/**
 * Global catalog of named capabilities (`conversa.transferir`, `relatorio.esforco.ver`). It deliberately has no tenant: this product vocabulary is shared by everyone, making it the only table without RLS alongside `tenant`.
 */
export const permission = pgTable('permissao', {
  codigo: text('codigo').primaryKey(),
  descricao: text('descricao').notNull(),
  grupo: text('grupo').notNull(),
});

export const rolePermission = pgTable(
  'papel_permissao',
  {
    tenantId: refTenant(),
    roleId: uuid('papel_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionCode: text('permissao_codigo')
      .notNull()
      .references(() => permission.codigo, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

export const userRole = pgTable(
  'usuario_papel',
  {
    tenantId: refTenant(),
    userId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    /**
     * Copy of `papel.escopo`, bound by a composite foreign key, allowing the partial index below to enforce ONE account role per person without a trigger. Writers pass `'conta'` for an account role; the FK rejects a wrong scope.
     */
    escopo: text('escopo').notNull().default('atendimento'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.papelId] }),
    foreignKey({
      name: 'usuario_papel_papel_escopo_fk',
      columns: [t.papelId, t.escopo],
      foreignColumns: [role.id, role.scope],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('usuario_papel_um_da_conta_uk')
      .on(t.userId)
      .where(sql`"escopo" = 'conta'`),
  ],
);

/**
 * A person-level EXCEPTION on top of roles (migration 0046).
 *
 * The source "Permissões" page edits a per-agent table of "Tipo de permissão" by "Status" (`referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` section a.4). A role grants a set; without overrides, removing one capability from one person would require a one-person role.
 *
 * Effective permission = COALESCE(the row's `concedida`, union of roles). Missing row means roles decide. `gravarPermissoesDoAtendente` deletes an override when it again matches the role, so this table contains exceptions rather than a stale RBAC copy.
 */
export const userPermission = pgTable(
  'usuario_permissao',
  {
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    permissaoCodigo: text('permissao_codigo')
      .notNull()
      .references(() => permission.codigo, { onDelete: 'cascade' }),
    /** `true` grants what the role lacks; `false` revokes what the role grants. */
    concedida: boolean('concedida').notNull(),
    ...carimbos(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.permissaoCodigo] })],
);

export const equipe = pgTable('equipe', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  ...carimbos(),
});

export const FUNCTIONS_TEAM = ['membro', 'lider'] as const;

export const memberTeam = pgTable(
  'membro_equipe',
  {
    tenantId: refTenant(),
    equipeId: uuid('equipe_id')
      .notNull()
      .references(() => equipe.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    function: text('funcao').notNull().default('membro'),
  },
  (t) => [
    primaryKey({ columns: [t.equipeId, t.usuarioId] }),
    listaCheck('membro_equipe_funcao_ck', t.function, FUNCTIONS_TEAM),
  ],
);

export const session = pgTable(
  'sessao',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEm: moment('expira_em').notNull(),
    ip: text('ip'),
    agente: text('agente'),
    /** Records the login origin for audit and IdP-based revocation. */
    origem: text('origem').notNull().default('senha'),
    criadoEm: moment('criado_em').notNull().defaultNow(),
    encerradaEm: moment('encerrada_em'),
  },
  (t) => [
    uniqueIndex('sessao_token_hash_uk').on(t.tokenHash),
    index('sessao_usuario_idx').on(t.tenantId, t.usuarioId, t.expiraEm),
    listaCheck('sessao_origem_ck', t.origem, ORIGINS_OF_SESSION),
  ],
);

export const ORIGINS_OF_SESSION = ['senha', 'google', 'sso'] as const;

/**
 * External provider account.
 *
 * The key is NEVER email: it is `(emissor, sujeito)`; for Google the issuer is `https://accounts.google.com` and the subject is the `id_token` `sub`. Email ownership can change, so matching by email could give a successor the former user's account. `emailNoProvedor` is for display and diagnostics only.
 *
 * The schema now enforces uniqueness PER TENANT on `(tenantId, emissor, sujeito)`, so the schema permits one provider account in several Pipe tenants. The login path currently looks up `(emissor, sujeito)` without a tenant filter and selects the first match; it cannot reliably use those multiple links. The original global-uniqueness claim is outdated.
 */
export const identityExternal = pgTable(
  'identidade_externa',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    emissor: text('emissor').notNull(),
    sujeito: text('sujeito').notNull(),
    emailNoProvedor: text('email_no_provedor'),
    ultimoAcessoEm: moment('ultimo_acesso_em'),
    ...carimbos(),
  },
  (t) => [
    /**
     * Unique within a tenant, not globally (migration 0017). The schema permits one provider account across Pipe tenants, but `entrarComIdentidade` currently selects the first `(emissor, sujeito)` match without tenant context, so account switching needs slice-time verification.
     */
    uniqueIndex('identidade_externa_tenant_emissor_sujeito_uk').on(
      t.tenantId,
      t.emissor,
      t.sujeito,
    ),
    index('identidade_externa_usuario_idx').on(t.tenantId, t.usuarioId),
  ],
);

/**
 * Email domain owned by a tenant.
 *
 * It enables tenant discovery during login because the tenant is not in the subdomain (`infraestrutura.md` section 3). It counts only after TXT DNS verification; otherwise a user with `@banco.com.br` could claim the bank's tenant. Public domains such as Gmail, Hotmail, and Outlook cannot be registered; the exclusion list lives in code.
 */
export const domainTenant = pgTable(
  'dominio_tenant',
  {
    id: id(),
    tenantId: refTenant(),
    domain: text('dominio').notNull(),
    verificadoEm: moment('verificado_em'),
    tokenVerification: text('token_verificacao'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('dominio_tenant_dominio_uk').on(t.domain)],
);

/**
 * Tenant SSO connection, a thin mirror of IdP configuration.
 *
 * **One per tenant**, enforced by uniqueness on `tenant_id`. Multiple directories would make domain discovery ambiguous before anyone has signed in to disambiguate.
 *
 * **State and policy are separate.** `estado` tracks connection readiness (`rascunho` -> `testada` -> `ativa`); `politica` tracks whether password entry remains allowed (`desligado` -> `opcional` -> `obrigatorio`). Combining them can lock out an entire tenant; see `referencias-blip/pesquisa/sso-multi-tenant.md` sections 3 and 6.
 *
 * **The secret is not stored in plaintext here.** `clientSecret` is inside `config`, encrypted by `cifrarConfig` in `packages/db/src/segredo.ts`. A `pg_dump` contains an envelope rather than a credential.
 */
export const TIPOS_CONEXAO_SSO = ['oidc'] as const;
export const ESTADOS_CONEXAO_SSO = ['rascunho', 'testada', 'ativa'] as const;
export const POLITICAS_SSO = ['desligado', 'opcional', 'obrigatorio'] as const;
export const PROVEDORES_SSO = ['generico', 'entra', 'google_workspace', 'okta'] as const;

export const conexaoSso = pgTable(
  'conexao_sso',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull().default('oidc'),
    /** IdP kind changes claim parsing: in Entra, subject is `{tid}:{oid}`. */
    provedor: text('provedor').notNull().default('generico'),
    /** O emissor OIDC, de onde sai `.well-known/openid-configuration`. */
    emissor: text('emissor').notNull(),
    clienteId: text('cliente_id').notNull(),
    /** `{ clientSecret }` cifrado. Nunca texto claro. */
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    estado: text('estado').notNull().default('rascunho'),
    politica: text('politica').notNull().default('desligado'),
    /** When the test passed. It remains valid for 30 days; a test from 2024 proves nothing today. */
    testadaEm: moment('testada_em'),
    ativadaEm: moment('ativada_em'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('conexao_sso_tenant_uk').on(t.tenantId),
    listaCheck('conexao_sso_tipo_ck', t.tipo, TIPOS_CONEXAO_SSO),
    listaCheck('conexao_sso_provedor_ck', t.provedor, PROVEDORES_SSO),
    listaCheck('conexao_sso_estado_ck', t.estado, ESTADOS_CONEXAO_SSO),
    listaCheck('conexao_sso_politica_ck', t.politica, POLITICAS_SSO),
  ],
);

/**
 * API and MCP key. Never store the secret in plaintext: persist `hash` plus a visible `prefixo` for the customer to recognize the key. Separate write scopes from read scopes (spec section 4.6).
 */
export const keyApi = pgTable(
  'chave_api',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    prefix: text('prefixo').notNull(),
    hash: text('hash').notNull(),
    scopes: text('escopos').array().notNull().default(sql`'{}'::text[]`),
    /**
     * The key belongs to the ACCOUNT (`null`, the default) or ONE flow, as on the flow's "Chaves de acesso" screen (migration 0032). A foreign key to `fluxo` would cross `identidade` and `automacao`, creating a circular import as with `0003_chaves_cruzadas.sql`; migration 0032 owns the actual constraint, leaving a plain column here.
     */
    flowId: uuid('fluxo_id'),
    expiraEm: moment('expira_em'),
    ultimoUsoEm: moment('ultimo_uso_em'),
    createdBy: uuid('criada_por').references(() => user.id, { onDelete: 'set null' }),
    revogadaEm: moment('revogada_em'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('chave_api_prefixo_uk').on(t.prefix),
    index('chave_api_fluxo_idx').on(t.tenantId, t.flowId),
  ],
);

export const TIPOS_ATOR = ['usuario', 'chave', 'sistema'] as const;

export const logAuditoria = pgTable(
  'log_auditoria',
  {
    id: id(),
    tenantId: refTenant(),
    atorTipo: text('ator_tipo').notNull(),
    atorId: uuid('ator_id'),
    acao: text('acao').notNull(),
    objetoTipo: text('objeto_tipo').notNull(),
    objetoId: uuid('objeto_id'),
    antes: jsonb('antes'),
    depois: jsonb('depois'),
    ip: text('ip'),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('log_auditoria_ator_tipo_ck', t.atorTipo, TIPOS_ATOR),
    index('log_auditoria_objeto_idx').on(t.tenantId, t.objetoTipo, t.objetoId, t.em),
    index('log_auditoria_em_idx').on(t.tenantId, t.em),
  ],
);


/**
 * Invitation to join a tenant.
 *
 * An invitation is required to join an existing account without a linked identity; it prevents a verified domain alone from granting access. Google self-service can create a NEW account for an unclaimed domain or a personal email, so the original claim that invitation is the only path for those cases is outdated. See `packages/autenticacao/src/entrada.ts`.
 *
 * As with sessions and API keys, the database stores only the hash, never the token. Invitations expire after seven days and are single-use via `aceito_em`; the acceptance path uses `for update` to prevent link reuse.
 */
export const invitation = pgTable(
  'convite',
  {
    id: id(),
    tenantId: refTenant(),
    email: text('email').notNull(),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    /** Always `conta`: an invitation grants only an account role, enforced by the composite FK. */
    escopo: text('escopo').notNull().default('conta'),
    tokenHash: text('token_hash').notNull(),
    expiraEm: moment('expira_em').notNull(),
    invitationCreatedBy: uuid('criado_por').references(() => user.id, { onDelete: 'set null' }),
    aceitoEm: moment('aceito_em'),
    /** The user created from this invitation is retained for audit; using an invitation does not delete it. */
    usuarioId: uuid('usuario_id').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('convite_token_hash_uk').on(t.tokenHash),
    index('convite_tenant_email_idx').on(t.tenantId, t.email, t.expiraEm),
    listaCheck('convite_escopo_ck', t.escopo, ['conta']),
    foreignKey({
      name: 'convite_papel_escopo_fk',
      columns: [t.papelId, t.escopo],
      foreignColumns: [role.id, role.scope],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
);
