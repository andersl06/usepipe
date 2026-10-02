import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { atualizadoEm, carimbos, excluidoEm, id, listaCheck, moment } from './comum.js';
import { refTenant, user } from './identity.js';
import { channel, contact, conversation, inbox, queue } from './conversations.js';

/**
 * Module 6 covers automation and extraction as three distinct parts: conversation flow builder, system workflow engine, and query language backed by the data dictionary.
 */

export const STATES_FLOW = ['rascunho', 'publicado', 'arquivado'] as const;

/** Two roles for the same contact: its own conversation or routing other bots. */
export const TYPES_FLOW = ['fluxo', 'roteador'] as const;

/** Source `ng-maxlength="160"` on the "Descrição" field in "Editar Fluxo". */
export const DESCRIPTION_FLOW_MAX = 160;

export const flow = pgTable(
  'fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    channelId: uuid('canal_id').references(() => channel.id, { onDelete: 'set null' }),
    estado: text('estado').notNull().default('rascunho'),
    /**
     * `flow` or `roteador` matches the source platform's `template` values (`builder` and `master`) and labels the portal card. A router is the same bot without its own content: it references other bots and chooses the destination, so it is a column rather than a separate table.
     */
    tipo: text('tipo').notNull().default('fluxo'),
    /**
     * Contact photo URL, the source platform's `imageUri` used by the portal card avatar. It is genuinely optional: source upload runs inside `try/catch`, reports only to the console, and allows creation to continue. Migration 0020.
     */
    imageUrl: text('imagem_url'),
    /**
     * URL key per tenant, derived from the name (`nomeCurto`, `regras-de-nome.ts`). It appears in contact URLs (`/application/detail/{shortName}`) and requires names to begin with a letter. Unique among LIVE flows (`estado <> 'arquivado'`) through `fluxo_short_name_vivo_uk`; an archived flow releases its short name for reuse, matching the exception `nomeEmUso` already makes for `nome`. Migration 0020 added the column nullable; migration 0051 (D-52) backfilled it, broke ties, and added the NOT NULL and the unique index.
     */
    shortName: text('short_name').notNull(),
    /**
     * Contact description is the source "Editar Fluxo" `description` at `/configurations/basic`. Optional because the source textarea has no `required`; when present it must have 2–160 characters (`ng-minlength="2"`, `ng-maxlength="160"`). The database `check` enforces the maximum; the `api` enforces the minimum. Migration 0022.
     */
    descricao: text('descricao'),
    /**
     * Source "Utilizar o contexto do Roteador" (`builder:useTunnelOwnerContext`): as a router service, share variables for the (router, contact) pair with other services that enable this option. Otherwise variables belong only to this flow. Migration 0024.
     */
    usesContextOfRouter: boolean('usa_contexto_do_roteador').notNull().default(false),
    /**
     * Contact settings without a separate home: currently "Tela de Boas-vindas" (`{ boasVindas: { ativo, mensagem, textoBotao } }`) and "Menu Persistente" (`{ menuPersistente: { itens: [{texto,link}] } }`) at `/configurations/welcome` and `/configurations/persistentMenu`. An absent key means never configured. One column suffices because each screen has few fields and no separate history, unlike versioned `fluxo_versao.global`; this is the current contact snapshot like `nome` and `description`. Migration 0031.
     */
    configuration: jsonb('configuracao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Fila padrao do fluxo (D-04, A3); validada com fila.fluxo_id = fluxo.id na escrita. */
    queueDefaultId: uuid('fila_padrao_id').references((): AnyPgColumn => queue.id, {
      onDelete: 'set null',
    }),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_estado_ck', t.estado, STATES_FLOW),
    listaCheck('fluxo_tipo_ck', t.tipo, TYPES_FLOW),
    check('fluxo_descricao_ck', sql.raw(`char_length("descricao") <= ${DESCRIPTION_FLOW_MAX}`)),
    /** D-52: one short name per tenant among live flows. Migration 0051. */
    uniqueIndex('fluxo_short_name_vivo_uk')
      .on(t.tenantId, t.shortName)
      .where(sql`estado <> 'arquivado'`),
  ],
);

/** Additional inbound channels of a router. Its first channel stays in fluxo.canal_id for compatibility. */
export const routerChannel = pgTable(
  'roteador_canal',
  {
    id: id(),
    tenantId: refTenant(),
    routerId: uuid('roteador_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    channelId: uuid('canal_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('roteador_canal_roteador_canal_uk').on(t.routerId, t.channelId),
  ],
);

/**
 * The four stops of the source Team modal's "Permissão" slider, keyed by `team.addUserModal.slider`: `visualize`, `custom`, `edit`, `admin`.
 */
export const ROLES_IN_FLOW = ['visualizar', 'personalizado', 'editar', 'admin'] as const;

/**
 * Team for this contact: who may access this flow and at what permission. Migration 0035 explains why the source assigns permission to the BOT rather than the tenant and documents the `permissoes` shape from `PermissionsList.html` at `/team/team/edit`.
 */
export const flowMember = pgTable(
  'fluxo_membro',
  {
    id: id(),
    tenantId: refTenant(),
    flowId: uuid('fluxo_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    userId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleInFlow: text('papel_no_fluxo').notNull().default('visualizar'),
    /** `{ builder: 'escrever', analysis: 'ler', … }`: source resource to selected radio choice. */
    permissions: jsonb('permissoes')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Partial<Record<string, 'nenhum' | 'ler' | 'escrever'>>>(),
    /** Who added this person; survives their deletion via `set null`. */
    guestBy: uuid('convidado_por').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_membro_papel_ck', t.roleInFlow, ROLES_IN_FLOW),
    uniqueIndex('fluxo_membro_uk').on(t.flowId, t.userId),
    index('fluxo_membro_usuario_ix').on(t.userId),
  ],
);

/**
 * Router services mirror Blip `master.services`. Migration 0024 explains each column and why Pipe has no tunnel.
 */
export const routerService = pgTable(
  'roteador_servico',
  {
    id: id(),
    tenantId: refTenant(),
    routerId: uuid('roteador_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    serviceId: uuid('servico_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'restrict' }),
    /** Service name used as the `Redirect` `content.address`. */
    nome: text('nome').notNull(),
    principal: boolean('principal').notNull().default(false),
    /** "Não redirecionar automaticamente para o principal". */
    persistente: boolean('persistente').notNull().default(false),
    /** The source label "Expiração do redirecionamento", measured from the customer's last message. */
    expirationMin: integer('expiracao_min'),
    ...carimbos(),
  },
  (t) => [
    check('roteador_servico_distintos_ck', sql`${t.routerId} <> ${t.serviceId}`),
    check('roteador_servico_expiracao_ck', sql`${t.expirationMin} is null or ${t.expirationMin} > 0`),
    check(
      'roteador_servico_principal_ck',
      sql`not ${t.principal} or (not ${t.persistente} and ${t.expirationMin} is null)`,
    ),
    check(
      'roteador_servico_persistente_ck',
      sql`not ${t.persistente} or ${t.expirationMin} is null`,
    ),
    check(
      'roteador_servico_redirecionamento_ck',
      sql`${t.principal} or ${t.persistente} or ${t.expirationMin} is not null`,
    ),
    uniqueIndex('roteador_servico_nome_uk').on(t.routerId, t.nome),
    uniqueIndex('roteador_servico_servico_uk').on(t.routerId, t.serviceId),
    uniqueIndex('roteador_servico_principal_uk')
      .on(t.routerId)
      .where(sql`${t.principal}`),
  ],
);

/**
 * Master-State tracks which router service holds the contact. Blip's "túnel" uses the (router, contact) pair; Pipe uses the real contact, unique within the tenant. See migration 0024.
 */
export const positionInRouter = pgTable(
  'posicao_no_roteador',
  {
    id: id(),
    tenantId: refTenant(),
    roteadorId: uuid('roteador_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    contactId: uuid('contato_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    servicoId: uuid('servico_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    desde: moment('desde').notNull().defaultNow(),
    /** Null means no expiry for a primary or persistent service. */
    expiraEm: moment('expira_em'),
    /** Router context shared by services with `usa_contexto_do_roteador`. */
    context: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Pending Change-User-State: the service starts at `bloco_inicial` or at the root. */
    reiniciar: boolean('reiniciar').notNull().default(false),
    blockInitial: text('bloco_inicial'),
  },
  (t) => [uniqueIndex('posicao_no_roteador_uk').on(t.roteadorId, t.contactId)],
);

export const STATES_FLOW_VERSION = ['rascunho', 'publicada', 'arquivada'] as const;

/** Published versions stay separate from editable versions, following Blip. */
export const flowVersion = pgTable(
  'fluxo_versao',
  {
    id: id(),
    tenantId: refTenant(),
    fluxoId: uuid('fluxo_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    versao: integer('versao').notNull(),
    state: text('estado').notNull().default('rascunho'),
    publicadaEm: moment('publicada_em'),
    publishedBy: uuid('publicada_por').references(() => user.id, { onDelete: 'set null' }),
    /** Blip `Flow` global actions and `configuration`; migration 0014. */
    global: jsonb('global')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_versao_estado_ck', t.state, STATES_FLOW_VERSION),
    uniqueIndex('fluxo_versao_uk').on(t.fluxoId, t.versao),
  ],
);

export const TYPES_BLOCK = [
  'inicio',
  'mensagem',
  'pergunta',
  'condicao',
  'chamada_externa',
  'script',
  'ia',
  'transferencia',
  'fim',
] as const;

export const block = pgTable(
  'bloco',
  {
    id: id(),
    tenantId: refTenant(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => flowVersion.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull(),
    conteudo: jsonb('conteudo')
      .notNull()
      .default(sql`'{}'::jsonb`),
    position: jsonb('posicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    listaCheck('bloco_tipo_ck', t.tipo, TYPES_BLOCK),
    uniqueIndex('bloco_uk').on(t.versaoId, t.codigo),
  ],
);

export const transition = pgTable(
  'transicao',
  {
    id: id(),
    tenantId: refTenant(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => flowVersion.id, { onDelete: 'cascade' }),
    ofBlockId: uuid('de_bloco_id')
      .notNull()
      .references(() => block.id, { onDelete: 'cascade' }),
    forBlockId: uuid('para_bloco_id').references(() => block.id, { onDelete: 'cascade' }),
    /**
     * Blip `{{variável}}` destination resolved at runtime. Exactly one of the two destinations is set (migration 0014).
     */
    forVariable: text('para_variavel'),
    condition: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Exit conditions are evaluated in this order; the first match wins. */
    order: integer('ordem').notNull().default(0),
  },
  (t) => [
    index('transicao_de_bloco_idx').on(t.versaoId, t.ofBlockId, t.order),
    check('transicao_destino_ck', sql`(${t.forBlockId} is null) <> (${t.forVariable} is null)`),
  ],
);

export const STATES_EXECUTION = [
  'executando',
  'aguardando',
  'concluida',
  'falhou',
  'cancelada',
] as const;

export const executionFlow = pgTable(
  'execucao_fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    flowVersionId: uuid('fluxo_versao_id')
      .notNull()
      .references(() => flowVersion.id, { onDelete: 'restrict' }),
    conversationId: uuid('conversa_id').references(() => conversation.id, { onDelete: 'cascade' }),
    contatoId: uuid('contato_id').references(() => contact.id, { onDelete: 'set null' }),
    /** Where the contact talks to the bot, so delivery and reports do not depend on a conversation. */
    inboxId: uuid('inbox_id').references(() => inbox.id, { onDelete: 'cascade' }),
    estado: text('estado').notNull().default('executando'),
    /**
     * Variable map crosses the flow and survives handoff to a human agent, who receives what the bot already collected.
     */
    contexto: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    blockCurrentId: uuid('bloco_atual_id').references(() => block.id, { onDelete: 'set null' }),
    blockPreviousId: uuid('bloco_anterior_id').references(() => block.id, { onDelete: 'set null' }),
    iniciadaEm: moment('iniciada_em').notNull().defaultNow(),
    encerradaEm: moment('encerrada_em'),
    /**
     * Migration 0056 (P8): when the block the contact waits in expires (Blip `input.expiration`)
     * and which block it is; rewritten or cleared by every input, claimed by the expiration job.
     */
    inputExpiresAt: moment('entrada_expira_em'),
    inputExpiresBlock: text('entrada_expira_bloco'),
  },
  (t) => [
    listaCheck('execucao_fluxo_estado_ck', t.estado, STATES_EXECUTION),
    index('execucao_fluxo_entrada_expira_idx')
      .on(t.inputExpiresAt)
      .where(sql`${t.inputExpiresAt} is not null`),
    index('execucao_fluxo_conversa_idx').on(t.tenantId, t.conversationId),
    index('execucao_fluxo_contato_inbox_idx').on(t.tenantId, t.contatoId, t.inboxId),
    index('execucao_fluxo_estado_idx').on(t.tenantId, t.estado, t.iniciadaEm),
    /**
     * Migration 0040: Dashboard, Overview, Journey, and message Log filter through `fluxo_versao.fluxo_id`, joining via `fluxo_versao_id`. Without this index, that join scans all of `execucao_fluxo`.
     */
    index('execucao_fluxo_versao_idx').on(t.tenantId, t.flowVersionId),
  ],
);

export const executionStep = pgTable(
  'execucao_passo',
  {
    id: id(),
    tenantId: refTenant(),
    executionId: uuid('execucao_id')
      .notNull()
      .references(() => executionFlow.id, { onDelete: 'cascade' }),
    blockId: uuid('bloco_id').references(() => block.id, { onDelete: 'set null' }),
    inbound: jsonb('entrada'),
    saida: jsonb('saida'),
    error: text('erro'),
    durationMs: integer('duracao_ms'),
    tokens: integer('tokens'),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [
    index('execucao_passo_execucao_idx').on(t.tenantId, t.executionId, t.em),
    // The same Meta message becomes a step only once (migration 0014).
    uniqueIndex('execucao_passo_entrada_uk')
      .on(t.tenantId, sql`(${t.inbound} ->> 'id_provedor')`)
      .where(sql`${t.inbound} ? 'id_provedor'`),
  ],
);

export const ESTADOS_PROCESS_HTTP = ['pendente', 'chamando', 'respondida', 'retomada'] as const;

/** Store the ProcessHttp cursor separately to retain every executed position. */
export const processHttpExecution = pgTable(
  'process_http_execucao',
  {
    id: id(),
    tenantId: refTenant(),
    execucaoId: uuid('execucao_id').notNull().references(() => executionFlow.id, { onDelete: 'cascade' }),
    key: text('chave').notNull(),
    blocoId: uuid('bloco_id').references(() => block.id, { onDelete: 'set null' }),
    blockCode: text('bloco_codigo').notNull(),
    lista: text('lista').notNull(),
    indice: integer('indice').notNull(),
    entrada: jsonb('entrada').notNull(),
    contexto: jsonb('contexto').notNull(),
    pedido: jsonb('pedido').notNull(),
    estado: text('estado').notNull().default('pendente'),
    resposta: jsonb('resposta'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('process_http_execucao_estado_ck', t.estado, ESTADOS_PROCESS_HTTP),
    uniqueIndex('process_http_execucao_chave_uk').on(t.execucaoId, t.key),
    index('process_http_execucao_pendente_idx').on(t.tenantId, t.estado),
  ],
);

export const workflow = pgTable(
  'workflow',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    versao: integer('versao').notNull().default(1),
    ativo: boolean('ativo').notNull().default(false),
    ...carimbos(),
  },
  (t) => [uniqueIndex('workflow_uk').on(t.tenantId, t.nome, t.versao)],
);

export const TIPOS_GATILHO = ['evento', 'agendado', 'manual', 'webhook'] as const;

export const gatilho = pgTable(
  'gatilho',
  {
    id: id(),
    tenantId: refTenant(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    config: jsonb('config')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    listaCheck('gatilho_tipo_ck', t.tipo, TIPOS_GATILHO),
    index('gatilho_workflow_idx').on(t.tenantId, t.workflowId, t.tipo),
  ],
);

export const TIPOS_ACAO = [
  'criar_registro',
  'atualizar_registro',
  'enviar_mensagem',
  'enviar_template',
  'atribuir_proprietario',
  'mover_fila',
  'criar_avaliacao',
  'http',
  'funcao',
  'agente_ia',
] as const;
export const POLICYS_ERROR = ['parar', 'continuar', 'repetir'] as const;

export const acao = pgTable(
  'acao',
  {
    id: id(),
    tenantId: refTenant(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull().default(0),
    tipo: text('tipo').notNull(),
    config: jsonb('config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    onError: text('on_erro').notNull().default('parar'),
  },
  (t) => [
    listaCheck('acao_tipo_ck', t.tipo, TIPOS_ACAO),
    listaCheck('acao_on_erro_ck', t.onError, POLICYS_ERROR),
    uniqueIndex('acao_uk').on(t.workflowId, t.ordem),
  ],
);

/** A workflow that fails silently is worse than no workflow. */
export const executionWorkflow = pgTable(
  'execucao_workflow',
  {
    id: id(),
    tenantId: refTenant(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    payloadGatilho: jsonb('payload_gatilho')
      .notNull()
      .default(sql`'{}'::jsonb`),
    estado: text('estado').notNull().default('executando'),
    iniciadaEm: moment('iniciada_em').notNull().defaultNow(),
    encerradaEm: moment('encerrada_em'),
    erro: text('erro'),
  },
  (t) => [
    listaCheck('execucao_workflow_estado_ck', t.estado, STATES_EXECUTION),
    index('execucao_workflow_idx').on(t.tenantId, t.workflowId, t.iniciadaEm.desc()),
  ],
);

/**
 * Reusable conversation-engine function (D-22). This is deliberately separate from workflow `funcao`.
 * The library belongs to the account (tenant), like Blip's (P10, D-57): every flow of the tenant sees
 * every function and `ExecuteBlipFunction` references one by `id`. Migration 0054 folded the former
 * per-flow scope (`fluxo_id`, `escopo`) into the tenant and made `nome` unique per tenant.
 */
export const flowFunction = pgTable(
  'funcao_do_fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    name: text('nome').notNull(),
    description: text('descricao'),
    parameters: jsonb('parametros').$type<string[]>().notNull().default([]),
    code: text('codigo').notNull(),
    version: integer('versao').notNull().default(1),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('funcao_do_fluxo_tenant_nome_uk').on(t.tenantId, t.name),
    check('funcao_do_fluxo_codigo_ck', sql`length(${t.code}) <= 65536`),
  ],
);

/** Maximum length of a resource's stored value (`valor`), matching `funcao_do_fluxo`'s code cap. */
export const MAX_FLOW_RESOURCE_VALUE = 65_536;

/**
 * Per-flow key/value resource (Blip "Recursos", permission key `resources`): source
 * `/resources/{key}` LIME commands store a MIME `type` and a text-or-JSON `content` per key. The
 * engine's `resource` variable source reads this table the same way `config` reads
 * `fluxo.configuracao`.
 */
export const flowResource = pgTable(
  'recurso_do_fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    flowId: uuid('fluxo_id').notNull().references(() => flow.id, { onDelete: 'cascade' }),
    name: text('nome').notNull(),
    type: text('tipo').notNull().default('text/plain'),
    value: text('valor').notNull(),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('recurso_do_fluxo_fluxo_nome_uk').on(t.tenantId, t.flowId, t.name),
    index('recurso_do_fluxo_fluxo_idx').on(t.tenantId, t.flowId),
    check('recurso_do_fluxo_valor_ck', sql`length(${t.value}) <= ${MAX_FLOW_RESOURCE_VALUE}`),
    check('recurso_do_fluxo_nome_ck', sql`length(${t.name}) between 1 and 190`),
  ],
);

/** Native equivalents for the platform actions (D-20). */
export const distributionList = pgTable(
  'lista_distribuicao',
  {
    id: id(),
    tenantId: refTenant(),
    name: text('nome').notNull(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('lista_distribuicao_tenant_nome_uk').on(t.tenantId, t.name)],
);

export const distributionListContact = pgTable(
  'lista_distribuicao_contato',
  {
    id: id(),
    tenantId: refTenant(),
    listId: uuid('lista_id').notNull().references(() => distributionList.id, { onDelete: 'cascade' }),
    contactId: uuid('contato_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('lista_distribuicao_contato_uk').on(t.tenantId, t.listId, t.contactId),
    index('lista_distribuicao_contato_contato_idx').on(t.tenantId, t.contactId),
  ],
);

export const MEMORY_SCOPES = ['contact', 'global'] as const;

export const memoryRecord = pgTable(
  'gravar_memoria',
  {
    id: id(),
    tenantId: refTenant(),
    contactId: uuid('contato_id').references(() => contact.id, { onDelete: 'cascade' }),
    scope: text('escopo').notNull().default('contact'),
    key: text('chave').notNull(),
    value: jsonb('valor').notNull().default(sql`'null'::jsonb`),
    expiresAt: moment('expira_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('gravar_memoria_escopo_ck', t.scope, MEMORY_SCOPES),
    check('gravar_memoria_contato_ck', sql`(${t.scope} = 'global' and ${t.contactId} is null) or (${t.scope} = 'contact' and ${t.contactId} is not null)`),
    uniqueIndex('gravar_memoria_contato_chave_uk').on(t.tenantId, t.contactId, t.key).where(sql`${t.scope} = 'contact'`),
    uniqueIndex('gravar_memoria_global_chave_uk').on(t.tenantId, t.key).where(sql`${t.scope} = 'global'`),
    index('gravar_memoria_tenant_idx').on(t.tenantId, t.contactId, t.key),
    check('gravar_memoria_valor_ck', sql`pg_column_size(${t.value}) <= 65536`),
  ],
);

export const SCHEDULE_STATES = ['agendada', 'executada', 'cancelada', 'falhou'] as const;

/**
 * A message a bot scheduled with Blip's `set /schedules` (P7), keyed by the Blip message id. The row
 * is authoritative: a delayed job fires it at `when` and a sweep recovers a lost job.
 */
export const scheduledMessage = pgTable(
  'agendamento_mensagem',
  {
    id: id(),
    tenantId: refTenant(),
    flowId: uuid('fluxo_id').references(() => flow.id, { onDelete: 'set null' }),
    contactId: uuid('contato_id').references(() => contact.id, { onDelete: 'set null' }),
    messageId: text('mensagem_id').notNull(),
    name: text('nome'),
    to: text('destino').notNull(),
    type: text('tipo').notNull(),
    content: jsonb('conteudo').notNull().default(sql`'null'::jsonb`),
    when: moment('quando').notNull(),
    state: text('estado').notNull().default('agendada'),
    result: jsonb('resultado'),
    executedAt: moment('executado_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('agendamento_mensagem_estado_ck', t.state, SCHEDULE_STATES),
    check('agendamento_mensagem_conteudo_ck', sql`pg_column_size(${t.content}) <= 65536`),
    check('agendamento_mensagem_id_ck', sql`length(${t.messageId}) between 1 and 200`),
    uniqueIndex('agendamento_mensagem_tenant_mensagem_uk').on(t.tenantId, t.messageId),
    index('agendamento_mensagem_pendente_idx').on(t.when).where(sql`${t.state} = 'agendada'`),
  ],
);

/** An event a bot recorded with Blip's `set /event-track` (P7). */
export const trackedEvent = pgTable(
  'evento_rastreado',
  {
    id: id(),
    tenantId: refTenant(),
    flowId: uuid('fluxo_id').references(() => flow.id, { onDelete: 'set null' }),
    contactId: uuid('contato_id').references(() => contact.id, { onDelete: 'set null' }),
    category: text('categoria').notNull(),
    action: text('acao').notNull(),
    extras: jsonb('extras').notNull().default(sql`'{}'::jsonb`),
    at: moment('em').notNull().defaultNow(),
  },
  (t) => [
    check('evento_rastreado_categoria_ck', sql`length(${t.category}) between 1 and 200`),
    check('evento_rastreado_acao_ck', sql`length(${t.action}) between 1 and 200`),
    check('evento_rastreado_extras_ck', sql`pg_column_size(${t.extras}) <= 16384`),
    index('evento_rastreado_categoria_idx').on(t.tenantId, t.category, t.at),
  ],
);

export const executionAction = pgTable(
  'execucao_acao',
  {
    id: id(),
    tenantId: refTenant(),
    executionWorkflowId: uuid('execucao_workflow_id')
      .notNull()
      .references(() => executionWorkflow.id, { onDelete: 'cascade' }),
    acaoId: uuid('acao_id').references(() => acao.id, { onDelete: 'set null' }),
    entrada: jsonb('entrada'),
    saida: jsonb('saida'),
    erro: text('erro'),
    duracaoMs: integer('duracao_ms'),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [index('execucao_acao_execucao_idx').on(t.tenantId, t.executionWorkflowId, t.em)],
);

export const querySaves = pgTable(
  'consulta_salva',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    /**
     * Structured query validated against the tenant data dictionary. Client input never becomes raw SQL, and the server imposes `tenant_id`.
     */
    texto: text('texto').notNull(),
    parametros: jsonb('parametros')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid('criada_por').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [uniqueIndex('consulta_salva_uk').on(t.tenantId, t.nome)],
);

export const FORMATS_EXPORT = ['csv', 'json', 'parquet'] as const;

export const schedulingQuery = pgTable(
  'agendamento_consulta',
  {
    id: id(),
    tenantId: refTenant(),
    queryId: uuid('consulta_id')
      .notNull()
      .references(() => querySaves.id, { onDelete: 'cascade' }),
    cron: text('cron').notNull(),
    format: text('formato').notNull().default('csv'),
    destination: jsonb('destino')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ativo: boolean('ativo').notNull().default(true),
    lastExecutionAt: moment('ultima_execucao_em'),
    ...carimbos(),
  },
  (t) => [listaCheck('agendamento_consulta_formato_ck', t.format, FORMATS_EXPORT)],
);

/**
 * Mirror of tenant CRM (Twenty) `objectMetadata`; see migration 0015. `codigo` is `nameSingular` and `rotulo` is `labelSingular`; other columns use Twenty property names. A row with `twentyId` came from synchronization; without it, the local CRM declared it manually.
 */
export const dictionaryObject = pgTable(
  'dicionario_objeto',
  {
    id: id(),
    tenantId: refTenant(),
    codigo: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    description: text('descricao'),
    twentyId: text('twenty_id'),
    namePlural: text('name_plural'),
    labelPlural: text('label_plural'),
    icon: text('icon'),
    isCustom: boolean('is_custom').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    isRemote: boolean('is_remote').notNull().default(false),
    applicationId: text('application_id'),
    /** Removed from Twenty; keep the row so a block referring to it reports the missing object. */
    excluidoEm: excluidoEm(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('dicionario_objeto_uk').on(t.tenantId, t.codigo)],
);

/**
 * Operational data for the query language, not documentation: it defines allowed fields. Mirrors Twenty `fieldMetadata`: `codigo` is `name`, `rotulo` is `label`, and `tipo` is literal `type` (`TEXT`, `CURRENCY`, `RELATION`, etc.). `options`, `defaultValue`, `settings`, and `relation` retain the exact Metadata API format.
 */
export const dictionaryField = pgTable(
  'dicionario_campo',
  {
    id: id(),
    tenantId: refTenant(),
    objetoCodigo: text('objeto_codigo').notNull(),
    codigo: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    tipo: text('tipo').notNull(),
    descricao: text('descricao'),
    consultavel: boolean('consultavel').notNull().default(true),
    agregavel: boolean('agregavel').notNull().default(false),
    twentyId: text('twenty_id'),
    icon: text('icon'),
    isCustom: boolean('is_custom').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    isNullable: boolean('is_nullable'),
    isUnique: boolean('is_unique'),
    defaultValue: jsonb('default_value'),
    options: jsonb('options'),
    settings: jsonb('settings'),
    relation: jsonb('relation'),
    morphRelations: jsonb('morph_relations'),
    applicationId: text('application_id'),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [uniqueIndex('dicionario_campo_uk').on(t.tenantId, t.objetoCodigo, t.codigo)],
);

/**
 * Outbound webhook authentication mirrors the source "Configurações de autenticação" (`referencias-blip/pesquisa/blip-integracoes-webhook.md`: switch and OAuth 2.0), plus Basic authentication requested here but absent from the source. Migration 0036.
 */
export const TYPES_AUTHENTICATION_WEBHOOK = [
  'nenhuma',
  'basica',
  'oauth2_client_credentials',
] as const;

export const webhookSaida = pgTable(
  'webhook_saida',
  {
    id: id(),
    tenantId: refTenant(),
    url: text('url').notNull(),
    eventos: text('eventos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Segredo do HMAC de assinatura; cifrado em repouso, como o segredo de canal. */
    secret: text('segredo').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    /** `nenhuma` (default), `basica`, or `oauth2_client_credentials`; migration 0036. */
    typeAuthentication: text('tipo_autenticacao').notNull().default('nenhuma'),
    /** Basic-auth username is not secret and remains readable. */
    authenticationUser: text('autenticacao_usuario'),
    /** Basic-auth password is encrypted at rest by `@pipe/db/segredo`. */
    authenticationPassword: text('autenticacao_senha'),
    /** OAuth 2.0 `client_credentials` token URL is validated like the webhook URL: HTTPS and no private network. */
    oauth2UrlAuthorization: text('oauth2_url_autorizacao'),
    /** OAuth 2.0 Client ID is not secret. */
    oauth2ClientId: text('oauth2_client_id'),
    /** Client Secret do OAuth 2.0 — cifrado em repouso. */
    oauth2ClientSecret: text('oauth2_client_secret'),
    /**
     * Custom headers are `[{ chave, valor }]`. They never include reserved signing headers (`content-type`, `x-pipe-signature`, `x-pipe-timestamp`, `x-pipe-delivery`) or `authorization`. The write rule in `dominio/gestao/integracoes.ts` rejects these before storage, so this column needs no `check`.
     */
    cabecalhos: jsonb('cabecalhos')
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    index('webhook_saida_tenant_idx').on(t.tenantId, t.ativo),
    listaCheck(
      'webhook_saida_tipo_autenticacao_ck',
      t.typeAuthentication,
      TYPES_AUTHENTICATION_WEBHOOK,
    ),
  ],
);

export const STATES_DELIVERY_WEBHOOK = ['pendente', 'entregue', 'falhou', 'descartada'] as const;

export const deliveryWebhook = pgTable(
  'entrega_webhook',
  {
    id: id(),
    tenantId: refTenant(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhookSaida.id, { onDelete: 'cascade' }),
    evento: text('evento').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    tentativas: integer('tentativas').notNull().default(0),
    estado: text('estado').notNull().default('pendente'),
    lastError: text('ultimo_erro'),
    proximaTentativaEm: moment('proxima_tentativa_em'),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('entrega_webhook_estado_ck', t.estado, STATES_DELIVERY_WEBHOOK),
    index('entrega_webhook_pendente_idx').on(t.estado, t.proximaTentativaEm),
  ],
);
