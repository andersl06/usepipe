import { LEVELS_PRIORITY } from '@pipe/core/conversation';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CATEGORIAS_COBRANCA,
  CATEGORIAS_TEMPLATE,
  STATES_CONVERSATION,
  STATES_DELIVERY,
  TYPES_CHANNEL,
  carimbos,
  id,
  listaCheck,
  moment,
} from './comum.js';
import { executionFlow, flow } from './automation.js';
import { refTenant, user } from './identity.js';

/** Module 3 covers conversations. The initial channels were WhatsApp Cloud API, email, and site widget; `TYPES_CHANNEL` now also includes Instagram and Messenger. */

export const channel = pgTable(
  'canal',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull(),
    nome: text('nome').notNull(),
    /**
     * Meta token and SMTP password are encrypted at rest by `packages/db/src/segredo.ts` using a key outside the database (§6). Only fields in `CAMPOS_SECRETOS_DE_CANAL` are encrypted; the rest remain readable for diagnosis.
     */
    config: jsonb('config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Webhook routing keys belong in columns rather than `config`. Meta template and account events cannot use per-customer URLs and all reach one route; the tenant must be resolved from payload (`entry[].id` is WABA, `metadata.phone_number_id` is the number). Payload resolution is a lookup, and unindexed jsonb lookup would scan. See `docs/specs/2026-09-07-webhook-por-cliente.md`.
     */
    wabaId: text('waba_id'),
    numeroId: text('numero_id'),
    ativo: boolean('ativo').notNull().default(true),
    ...carimbos(),
  },
  (t) => [
    listaCheck('canal_tipo_ck', t.tipo, TYPES_CHANNEL),
    index('canal_tenant_tipo_idx').on(t.tenantId, t.tipo),
    /*
     * `numero_id` is deliberately globally unique, not tenant-scoped: two tenants cannot own one number. Its index is partial because only WhatsApp has this ID. `waba_id` has a partial nonunique lookup index, so the original claim that both IDs are unique is inaccurate.
     */
    uniqueIndex('canal_numero_id_uk')
      .on(t.numeroId)
      .where(sql`${t.numeroId} is not null`),
    index('canal_waba_id_idx')
      .on(t.wabaId)
      .where(sql`${t.wabaId} is not null`),
  ],
);

export const queue = pgTable(
  'fila',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    cor: text('cor'),
    /**
     * References `horario_atendimento` in the Management module. The foreign key is created by migration `0003_chaves_cruzadas` to avoid circular imports between modules.
     */
    horarioId: uuid('horario_id'),
    /** Fluxo dono da fila (D-04). */
    flowId: uuid('fluxo_id')
      .notNull()
      .references(() => flow.id, { onDelete: 'cascade' }),
    capacityDefault: integer('capacidade_padrao').notNull().default(5),
    order: integer('ordem').notNull().default(0),
    ativa: boolean('ativa').notNull().default(true),
    /** Tags (nomes) que os atendentes da fila podem aplicar. */
    etiquetas: jsonb('etiquetas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Configuração de encerramento por inatividade; nulo = nunca configurado. */
    encerramentoAutomatico: jsonb('encerramento_automatico').$type<Record<string, unknown>>(),
    ...carimbos(),
  },
  (t) => [
    check('fila_etiquetas_array_ck', sql`jsonb_typeof(${t.etiquetas}) = 'array'`),
    check(
      'fila_encerramento_objeto_ck',
      sql`${t.encerramentoAutomatico} is null or jsonb_typeof(${t.encerramentoAutomatico}) = 'object'`,
    ),
    uniqueIndex('fila_tenant_fluxo_nome_uk').on(t.tenantId, t.flowId, t.nome),
    index('fila_tenant_fluxo_idx').on(t.tenantId, t.flowId),
  ],
);

export const inbox = pgTable(
  'inbox',
  {
    id: id(),
    tenantId: refTenant(),
    channelId: uuid('canal_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    queueDefaultId: uuid('fila_padrao_id').references(() => queue.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [index('inbox_tenant_canal_idx').on(t.tenantId, t.channelId)],
);

export const queueAgent = pgTable(
  'fila_atendente',
  {
    tenantId: refTenant(),
    queueId: uuid('fila_id')
      .notNull()
      .references(() => queue.id, { onDelete: 'cascade' }),
    userId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    capacityOverride: integer('capacidade_override'),
  },
  (t) => [primaryKey({ columns: [t.queueId, t.userId] })],
);

export const attachment = pgTable('anexo', {
  id: id(),
  tenantId: refTenant(),
  /** O arquivo mora no storage de objetos; o banco guarda a chave e os metadados. */
  keyStorage: text('chave_storage').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  durationSeg: integer('duracao_seg'),
  largura: integer('largura'),
  altura: integer('altura'),
  nomeOriginal: text('nome_original'),
  checksum: text('checksum'),
  /**
   * Source channel for received media, populated only by the webhook (`dominio/entrada.ts`), never manual upload (`controladores/anexos.ts`). Download logic (`dominio/midia.ts`) uses it to select the Graph token. See `0033_download_de_midia.sql`.
   */
  canalId: uuid('canal_id').references(() => channel.id, { onDelete: 'set null' }),
  /** `bytes = 0` with a reference `chave_storage` (`meta:` or URL) means not downloaded. */
  downloadTentativas: integer('download_tentativas').notNull().default(0),
  downloadError: text('download_erro'),
  downloadProximaTentativaEm: moment('download_proxima_tentativa_em'),
  criadoEm: moment('criado_em').notNull().defaultNow(),
});

export const contact = pgTable(
  'contato',
  {
    id: id(),
    tenantId: refTenant(),
    /** Chave estrangeira para `conta` (CRM) criada em `0003_chaves_cruzadas`. */
    accountId: uuid('conta_id'),
    nome: text('nome'),
    telefoneE164: text('telefone_e164'),
    email: text('email'),
    /** CPF/CNPJ stays `text`: CNPJ becomes alphanumeric starting in 2026. */
    document: text('documento'),
    avatarUrl: text('avatar_url'),
    atributos: jsonb('atributos')
      .notNull()
      .default(sql`'{}'::jsonb`),
    bloqueado: boolean('bloqueado').notNull().default(false),
    /** Conversations are personal data; data-subject deletion is supported from the start. */
    excluidoEm: moment('excluido_em'),
    /**
     * Corresponding Twenty `person` ID enables a direct Desk link to the customer record instead of the CRM home. Null until synchronization; while null, Desk shows no link. See `docs/specs/2026-09-07-integracao-twenty.md` §4.
     */
    twentyPessoaId: text('twenty_pessoa_id'),
    ...carimbos(),
  },
  (t) => [
    index('contato_tenant_telefone_idx').on(t.tenantId, t.telefoneE164),
    index('contato_tenant_email_idx').on(t.tenantId, t.email),
    index('contato_tenant_documento_idx').on(t.tenantId, t.document),
    index('contato_atributos_gin').using('gin', t.atributos),
    // A varredura do espelho procura exatamente por `twenty_pessoa_id is null`.
    index('contato_espelho_pendente_idx')
      .on(t.tenantId, t.atualizadoEm)
      .where(sql`twenty_pessoa_id is null and excluido_em is null`),
  ],
);

export const contactIdentity = pgTable(
  'contato_identidade',
  {
    id: id(),
    tenantId: refTenant(),
    contactId: uuid('contato_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    channelType: text('canal_tipo').notNull(),
    identificador: text('identificador').notNull(),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('contato_identidade_canal_tipo_ck', t.channelType, TYPES_CHANNEL),
    uniqueIndex('contato_identidade_uk').on(t.tenantId, t.channelType, t.identificador),
  ],
);

export const SCOPES_RESPONSE_READY = ['empresa', 'pessoal'] as const;

export const respostaPronta = pgTable(
  'resposta_pronta',
  {
    id: id(),
    tenantId: refTenant(),
    scope: text('escopo').notNull().default('empresa'),
    usuarioId: uuid('usuario_id').references(() => user.id, { onDelete: 'cascade' }),
    categoria: text('categoria'),
    atalho: text('atalho').notNull(),
    titulo: text('titulo').notNull(),
    corpo: text('corpo').notNull(),
    active: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [
    listaCheck('resposta_pronta_escopo_ck', t.scope, SCOPES_RESPONSE_READY),
    index('resposta_pronta_atalho_idx').on(t.tenantId, t.atalho),
  ],
);

export const templateMessage = pgTable(
  'template_mensagem',
  {
    id: id(),
    tenantId: refTenant(),
    canalId: uuid('canal_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    idioma: text('idioma').notNull().default('pt_BR'),
    categoria: text('categoria').notNull(),
    /** Estado do template na Meta: `aprovado`, `pendente`, `rejeitado`, `pausado`. */
    statusMeta: text('status_meta').notNull().default('pendente'),
    corpo: text('corpo').notNull(),
    variables: jsonb('variaveis')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** `nenhum` | `texto` | `imagem` | `video` | `documento`. */
    cabecalhoTipo: text('cabecalho_tipo').notNull().default('nenhum'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('template_mensagem_categoria_ck', t.categoria, CATEGORIAS_TEMPLATE),
    uniqueIndex('template_mensagem_uk').on(t.tenantId, t.canalId, t.nome, t.idioma),
  ],
);

export const AUTHORS_LAST_MESSAGE = ['contato', 'atendente', 'bot'] as const;

export const conversation = pgTable(
  'conversa',
  {
    id: id(),
    tenantId: refTenant(),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => inbox.id, { onDelete: 'restrict' }),
    contatoId: uuid('contato_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict' }),
    filaId: uuid('fila_id').references(() => queue.id, { onDelete: 'set null' }),
    agentId: uuid('atendente_id').references(() => user.id, { onDelete: 'set null' }),
    /*
     * The ticket is born at the handoff (or on a channel without a flow), so it starts `na_fila`.
     */
    state: text('estado').notNull().default('na_fila'),
    /*
     * Created without a priority. A prioritization rule or human sets it; the old `media` default ordered the queue using a value nobody selected. See `NIVEIS_PRIORIDADE`.
     */
    priority: text('prioridade').notNull().default('sem_prioridade'),
    criadaEm: moment('criada_em').notNull().defaultNow(),
    atribuidaEm: moment('atribuida_em'),
    firstResponseAt: moment('primeira_resposta_em'),
    encerradaEm: moment('encerrada_em'),
    closedBy: uuid('encerrada_por').references(() => user.id, { onDelete: 'set null' }),
    reasonClosure: text('motivo_encerramento'),
    emEsperaDesde: moment('em_espera_desde'),
    pausadoSeg: integer('pausado_seg').notNull().default(0),
    lastMessageAt: moment('ultima_mensagem_em'),
    /** Supports automatic-close guard: do not close while an agent owes the next response. */
    lastMessageOf: text('ultima_mensagem_de'),
    /** When the inactivity alert was sent; cleared by the sweep once the customer writes again. */
    inactivityAlertAt: moment('alerta_inatividade_em'),
    /**
     * WhatsApp 24-hour service window, recalculated for each inbound contact message. Null for channels without a window, such as email and widget.
     */
    windowExpiresAt: moment('janela_expira_em'),
    /** No foreign key: `mensagem` is partitioned and its uniqueness is the pair (id, criada_em). */
    windowOpenByMessageId: uuid('janela_aberta_por_mensagem_id'),
    atualizadoEm: moment('atualizado_em'),
  },
  (t) => [
    listaCheck('conversa_estado_ck', t.state, STATES_CONVERSATION),
    listaCheck('conversa_prioridade_ck', t.priority, LEVELS_PRIORITY),
    listaCheck('conversa_ultima_mensagem_de_ck', t.lastMessageOf, AUTHORS_LAST_MESSAGE),
    index('conversa_estado_fila_idx').on(t.tenantId, t.state, t.filaId),
    index('conversa_atendente_estado_idx').on(t.tenantId, t.agentId, t.state),
    index('conversa_encerrada_idx').on(t.tenantId, t.encerradaEm),
    index('conversa_contato_idx').on(t.tenantId, t.contatoId, t.criadaEm.desc()),
    /**
     * Migration 0040: the flow message log (`carregarLogDeMensagens`) finds bot-channel conversations by `inbox_id` before descending to `mensagem`. Without this index, the lookup scans all of `conversa`.
     */
    index('conversa_inbox_idx').on(t.tenantId, t.inboxId),
  ],
);

export const DIRECTIONS_MESSAGE = ['entrada', 'saida', 'interna'] as const;
export const AUTHORS_MESSAGE = ['contato', 'atendente', 'bot', 'sistema'] as const;
export const TYPES_MESSAGE = [
  'texto',
  'imagem',
  'audio',
  'video',
  'documento',
  'localizacao',
  'template',
] as const;

/**
 * Monthly partitioning by `criada_em` requires a partitioned table's primary key to contain the partition key, hence (id, criada_em) rather than id alone.
 */
export const message = pgTable(
  'mensagem',
  {
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    tenantId: refTenant(),
    /** Null while the message belongs only to a bot execution (no ticket yet). */
    conversationId: uuid('conversa_id').references(() => conversation.id, { onDelete: 'cascade' }),
    /** Bot execution the message belongs to when it has no conversation; kept after the handoff adopts it. */
    executionId: uuid('execucao_id').references(() => executionFlow.id, { onDelete: 'set null' }),
    direction: text('direcao').notNull(),
    autorTipo: text('autor_tipo').notNull(),
    autorId: uuid('autor_id'),
    tipo: text('tipo').notNull().default('texto'),
    conteudo: text('conteudo'),
    attachmentId: uuid('anexo_id').references(() => attachment.id, { onDelete: 'set null' }),
    /** When set, lets effort reports subtract text the agent did not type. */
    respostaProntaId: uuid('resposta_pronta_id').references(() => respostaPronta.id, {
      onDelete: 'set null',
    }),
    templateId: uuid('template_id').references(() => templateMessage.id, {
      onDelete: 'set null',
    }),
    stateDelivery: text('estado_entrega'),
    errorCode: text('erro_codigo'),
    errorText: text('erro_texto'),
    idProvedor: text('id_provedor'),
    criadaEm: moment('criada_em').notNull().defaultNow(),
    entregueEm: moment('entregue_em'),
    lidaEm: moment('lida_em'),
    insideOfWindow: boolean('dentro_da_janela'),
    categoriaCobranca: text('categoria_cobranca'),
    custoCentavos: integer('custo_centavos'),
    /**
     * Links a customer reply to the outbound send that prompted it, so reports measure the window from send time rather than calendar day.
     */
    disparoId: uuid('disparo_id'),
    /**
     * Channel- or type-specific data that has no dedicated column. Positional template values must survive sending: if they existed only in the queue job, a lost job would also lose retry and audit capability. For Instagram, store conversation origin: direct message, story reply and reference, mention, or comment promoted to a private conversation with its publication link.
     */
    data: jsonb('dados'),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.criadaEm] }),
    listaCheck('mensagem_direcao_ck', t.direction, DIRECTIONS_MESSAGE),
    listaCheck('mensagem_autor_tipo_ck', t.autorTipo, AUTHORS_MESSAGE),
    listaCheck('mensagem_tipo_ck', t.tipo, TYPES_MESSAGE),
    listaCheck('mensagem_estado_entrega_ck', t.stateDelivery, STATES_DELIVERY),
    listaCheck('mensagem_categoria_cobranca_ck', t.categoriaCobranca, CATEGORIAS_COBRANCA),
    check('mensagem_conversa_ou_execucao_ck', sql`${t.conversationId} is not null or ${t.executionId} is not null`),
    index('mensagem_conversa_idx').on(t.tenantId, t.conversationId, t.criadaEm),
    index('mensagem_execucao_idx').on(t.tenantId, t.executionId, t.criadaEm),
    index('mensagem_falhou_idx')
      .on(t.stateDelivery)
      .where(sql`estado_entrega = 'falhou'`),
    index('mensagem_disparo_idx').on(t.tenantId, t.disparoId),
  ],
);

/**
 * Every outbound message passes through this outbox with its own status and backoff retries. `mensagem_id` has no foreign key because `mensagem` is partitioned.
 */
export const outboxMessage = pgTable(
  'outbox_mensagem',
  {
    id: id(),
    tenantId: refTenant(),
    messageId: uuid('mensagem_id').notNull(),
    tentativas: integer('tentativas').notNull().default(0),
    proximaTentativaEm: moment('proxima_tentativa_em'),
    estado: text('estado').notNull().default('pendente'),
    lastError: text('ultimo_erro'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('outbox_mensagem_estado_ck', t.estado, STATES_DELIVERY),
    index('outbox_mensagem_pendente_idx').on(t.estado, t.proximaTentativaEm),
    uniqueIndex('outbox_mensagem_mensagem_uk').on(t.messageId),
  ],
);

export const assignment = pgTable(
  'atribuicao',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    ofUserId: uuid('de_usuario_id').references(() => user.id, { onDelete: 'set null' }),
    forUserId: uuid('para_usuario_id').references(() => user.id, { onDelete: 'set null' }),
    ofQueueId: uuid('de_fila_id').references(() => queue.id, { onDelete: 'set null' }),
    forQueueId: uuid('para_fila_id').references(() => queue.id, { onDelete: 'set null' }),
    motivo: text('motivo'),
    byUserId: uuid('por_usuario_id').references(() => user.id, { onDelete: 'set null' }),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [index('atribuicao_conversa_idx').on(t.tenantId, t.conversaId, t.em)],
);

export const motivoPausa = pgTable('motivo_pausa', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  durationSuggestedMin: integer('duracao_sugerida_min'),
  accountAsProductive: boolean('conta_como_produtivo').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  ...carimbos(),
});

export const pausa = pgTable(
  'pausa',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    motivoId: uuid('motivo_id').references(() => motivoPausa.id, { onDelete: 'set null' }),
    iniciadaEm: moment('iniciada_em').notNull().defaultNow(),
    encerradaEm: moment('encerrada_em'),
  },
  (t) => [index('pausa_usuario_idx').on(t.tenantId, t.usuarioId, t.iniciadaEm)],
);

export const STATES_AGENT = ['online', 'pausa', 'invisivel', 'offline'] as const;

export const statusAgent = pgTable(
  'status_atendente',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    tenantId: refTenant(),
    estado: text('estado').notNull().default('offline'),
    desde: moment('desde').notNull().defaultNow(),
    conectadoEm: moment('conectado_em'),
  },
  (t) => [listaCheck('status_atendente_estado_ck', t.estado, STATES_AGENT)],
);

export const SCOPES_LABEL = ['conversa', 'contato', 'ambos'] as const;

export const etiqueta = pgTable(
  'etiqueta',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    cor: text('cor'),
    escopo: text('escopo').notNull().default('conversa'),
    exclusiveByQueue: boolean('exclusiva_por_fila').notNull().default(false),
    requiredInClosure: boolean('obrigatoria_no_encerramento').notNull().default(false),
    ...carimbos(),
  },
  (t) => [
    listaCheck('etiqueta_escopo_ck', t.escopo, SCOPES_LABEL),
    uniqueIndex('etiqueta_tenant_nome_uk').on(t.tenantId, t.nome),
  ],
);

export const conversationLabel = pgTable(
  'conversa_etiqueta',
  {
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    etiquetaId: uuid('etiqueta_id')
      .notNull()
      .references(() => etiqueta.id, { onDelete: 'cascade' }),
    porUsuarioId: uuid('por_usuario_id').references(() => user.id, { onDelete: 'set null' }),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversaId, t.etiquetaId] })],
);

export const contactLabel = pgTable(
  'contato_etiqueta',
  {
    tenantId: refTenant(),
    contatoId: uuid('contato_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    etiquetaId: uuid('etiqueta_id')
      .notNull()
      .references(() => etiqueta.id, { onDelete: 'cascade' }),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contatoId, t.etiquetaId] })],
);

export const notaInterna = pgTable(
  'nota_interna',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id').references(() => user.id, { onDelete: 'set null' }),
    corpo: text('corpo').notNull(),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [index('nota_interna_conversa_idx').on(t.tenantId, t.conversaId, t.em)],
);

/**
 * Pinned and manually unread markers belong to each AGENT, not the conversation (migration 0041). They mirror source card menu PIN/UNPIN and UNREAD/READ (`TicketMenuOptions`). Null `fixada_em` means unpinned; null `nao_lida_em` means read. A row exists only while at least one marker is set (CHECK), and the domain deletes unmarked rows. The domain enforces a limit of 50 pinned conversations.
 */
export const taggingConversation = pgTable(
  'marcacao_conversa',
  {
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    fixadaEm: moment('fixada_em'),
    naoLidaEm: moment('nao_lida_em'),
  },
  (t) => [
    primaryKey({ name: 'marcacao_conversa_pk', columns: [t.usuarioId, t.conversaId] }),
    index('marcacao_conversa_usuario_idx').on(t.tenantId, t.usuarioId),
    check('marcacao_conversa_alguma_ck', sql`${t.fixadaEm} is not null or ${t.naoLidaEm} is not null`),
  ],
);

export const STATES_SATISFACTION_SURVEY_RESPONSE = [
  'completa',
  'so_nota',
  'sem_resposta',
  'abandono',
] as const;

/**
 * Native satisfaction survey answer (BAH 3.0, `ref/inventario-satisfacao-e-tags.md` §5). One row
 * per delivered survey, covering the four documented outcomes — including `sem_resposta` and
 * `abandono`, which the reference itself never persists as a row (D-08.5 gate). No TTL/retention
 * and no language restriction, unlike the reference (D-10).
 */
export const satisfactionSurveyResponse = pgTable(
  'pesquisa_satisfacao_resposta',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'restrict' }),
    conversaAtendimentoId: uuid('conversa_atendimento_id').references(() => conversation.id, {
      onDelete: 'set null',
    }),
    /** `survey:` block id in the flow's own vocabulary; not a foreign key (`bloco` is versioned). */
    fluxoBlocoId: text('fluxo_bloco_id'),
    filaId: uuid('fila_id').references(() => queue.id, { onDelete: 'set null' }),
    atendenteId: uuid('atendente_id').references(() => user.id, { onDelete: 'set null' }),
    contatoId: uuid('contato_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict' }),
    nota: smallint('nota'),
    comentario: text('comentario'),
    estado: text('estado').notNull(),
    criadaEm: moment('criada_em').notNull().defaultNow(),
    respondidaEm: moment('respondida_em'),
  },
  (t) => [
    listaCheck('pesquisa_satisfacao_resposta_estado_ck', t.estado, STATES_SATISFACTION_SURVEY_RESPONSE),
    check('pesquisa_satisfacao_resposta_nota_ck', sql`${t.nota} is null or (${t.nota} >= 1 and ${t.nota} <= 5)`),
    index('pesquisa_satisfacao_resposta_fila_idx').on(t.tenantId, t.filaId, t.criadaEm),
    index('pesquisa_satisfacao_resposta_atendente_idx').on(t.tenantId, t.atendenteId, t.criadaEm),
    index('pesquisa_satisfacao_resposta_periodo_idx').on(t.tenantId, t.criadaEm),
  ],
);
