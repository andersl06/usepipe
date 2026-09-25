import { NIVEIS_PRIORITY } from '@pipe/core/conversa';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
import { refTenant, user } from './identity.js';

/** Módulo 3 — Conversas. Canais do dia 1: WhatsApp Cloud API, e-mail e widget de site. */

export const channel = pgTable(
  'canal',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull(),
    nome: text('nome').notNull(),
    /**
     * Token da Meta, senha SMTP: cifrado em repouso pela `packages/db/src/segredo.ts`,
     * com a chave fora do banco (§6). Só os campos da lista `CAMPOS_SECRETOS_DE_CANAL`
     * são cifrados — o resto continua legível para diagnóstico.
     */
    config: jsonb('config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * As duas chaves de roteamento do webhook, e a razão de estarem em COLUNA e
     * não no `config`: os eventos de template e de conta da Meta não aceitam URL
     * por cliente e caem todos numa rota só, onde o tenant tem de sair do payload
     * (`entry[].id` é o WABA, `metadata.phone_number_id` é o número). Resolver por
     * payload é consulta, e consulta em jsonb sem índice é varredura.
     *
     * Ver `docs/specs/2026-09-07-webhook-por-cliente.md`.
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
     * Únicos e GLOBAIS, de propósito — não por tenant. Dois clientes com o mesmo
     * `numero_id` é estado impossível: significaria dois donos para o mesmo
     * número, e o banco recusa antes de a aplicação escolher errado. Parciais
     * porque só o WhatsApp tem esses identificadores.
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
  'queue',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    cor: text('cor'),
    /**
     * Aponta para `horario_atendimento`, que vive no módulo de Gestão. A chave
     * estrangeira nasce na migration `0003_chaves_cruzadas` para não fazer os dois
     * módulos se importarem em círculo.
     */
    horarioId: uuid('horario_id'),
    capacityDefault: integer('capacidade_padrao').notNull().default(5),
    order: integer('ordem').notNull().default(0),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [uniqueIndex('fila_tenant_nome_uk').on(t.tenantId, t.nome)],
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
   * O canal de onde a mídia recebida veio — só preenchido pelo webhook
   * (`dominio/entrada.ts`), nunca pelo upload manual (`controladores/anexos.ts`).
   * É de onde o download (`dominio/midia.ts`) tira o token para falar com o Graph.
   * Ver `0033_download_de_midia.sql`.
   */
  canalId: uuid('canal_id').references(() => channel.id, { onDelete: 'set null' }),
  /** `bytes = 0` com `chave_storage` de referência (`meta:` ou URL) é "não baixado". */
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
    /** CPF/CNPJ é sempre `text`: o CNPJ passa a ser alfanumérico a partir de 2026. */
    document: text('documento'),
    avatarUrl: text('avatar_url'),
    atributos: jsonb('atributos')
      .notNull()
      .default(sql`'{}'::jsonb`),
    bloqueado: boolean('bloqueado').notNull().default(false),
    /** Conversa é dado pessoal: a exclusão a pedido do titular existe desde o começo. */
    excluidoEm: moment('excluido_em'),
    /**
     * O `id` da `person` correspondente no Twenty. É o que permite o link direto do
     * Desk cair na FICHA do cliente em vez da home do CRM.
     *
     * Nulo enquanto o espelho não aconteceu — e enquanto for nulo, o Desk não mostra
     * link nenhum. Ver `docs/specs/2026-09-07-integracao-twenty.md` §4.
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
  'conversation',
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
    state: text('estado').notNull().default('na_fila'),
    /* Nasce SEM prioridade. Quem dá prioridade é regra de priorização ou gente;
       o padrão antigo (`media`) fazia a fila ordenar por dado que ninguém
       escolheu. Ver `NIVEIS_PRIORIDADE`. */
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
    /** Sustenta a trava do fechamento automático: não fecha se quem deve resposta é o atendente. */
    lastMessageOf: text('ultima_mensagem_de'),
    /**
     * Janela de atendimento de 24h do WhatsApp, recalculada a cada mensagem de entrada
     * do contato. Nulo é canal sem janela (e-mail, widget).
     */
    windowExpiresAt: moment('janela_expira_em'),
    /** Sem chave estrangeira: `mensagem` é particionada e sua unicidade é (id, criada_em). */
    windowOpenByMessageId: uuid('janela_aberta_por_mensagem_id'),
    atualizadoEm: moment('atualizado_em'),
  },
  (t) => [
    listaCheck('conversa_estado_ck', t.state, STATES_CONVERSATION),
    listaCheck('conversa_prioridade_ck', t.priority, NIVEIS_PRIORITY),
    listaCheck('conversa_ultima_mensagem_de_ck', t.lastMessageOf, AUTHORS_LAST_MESSAGE),
    index('conversa_estado_fila_idx').on(t.tenantId, t.state, t.filaId),
    index('conversa_atendente_estado_idx').on(t.tenantId, t.agentId, t.state),
    index('conversa_encerrada_idx').on(t.tenantId, t.encerradaEm),
    index('conversa_contato_idx').on(t.tenantId, t.contatoId, t.criadaEm.desc()),
    /**
     * Migration 0040: o Log de mensagens do fluxo (`carregarLogDeMensagens`)
     * acha as conversas do canal do bot por `inbox_id` antes de descer para
     * `mensagem` — sem este índice essa busca varria `conversa` inteira.
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
 * Particionada por mês em `criada_em`. A chave primária de tabela particionada precisa
 * conter a chave de partição — daí `(id, criada_em)` em vez de só `id`.
 */
export const message = pgTable(
  'mensagem',
  {
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    tenantId: refTenant(),
    conversationId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    direction: text('direcao').notNull(),
    autorTipo: text('autor_tipo').notNull(),
    autorId: uuid('autor_id'),
    tipo: text('tipo').notNull().default('texto'),
    conteudo: text('conteudo'),
    attachmentId: uuid('anexo_id').references(() => attachment.id, { onDelete: 'set null' }),
    /** Preenchido, é o que permite ao relatório de esforço descontar o texto não digitado. */
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
     * Amarra a resposta do cliente ao disparo que a originou: é o que faz o relatório
     * contar a janela a partir do envio, e não pelo dia do calendário.
     */
    disparoId: uuid('disparo_id'),
    /**
     * O que não cabe em coluna própria e é específico do canal ou do tipo.
     *
     * Guarda os valores posicionais do template, que precisam sobreviver ao envio: sem
     * isso eles só existem dentro do job da fila, e um job perdido leva junto a
     * possibilidade de reenviar ou de auditar o que foi mandado.
     *
     * No Instagram, guarda a origem da conversa: mensagem direta, resposta a story com a
     * referência do story, menção, ou comentário promovido a conversa privada com o
     * vínculo à publicação.
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
    index('mensagem_conversa_idx').on(t.tenantId, t.conversationId, t.criadaEm),
    index('mensagem_falhou_idx')
      .on(t.stateDelivery)
      .where(sql`estado_entrega = 'falhou'`),
    index('mensagem_disparo_idx').on(t.tenantId, t.disparoId),
  ],
);

/**
 * Toda mensagem de saída passa por aqui, com estado próprio e retry com backoff.
 * `mensagem_id` fica sem chave estrangeira porque `mensagem` é particionada.
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
 * Fixar e marcar como não lida — POR ATENDENTE, não por conversa (migração 0041).
 *
 * É o PIN/UNPIN e UNREAD/READ do menu do cartão da origem (`TicketMenuOptions`).
 * `fixada_em` nulo é "não fixada"; `nao_lida_em` nulo é "lida". A linha só existe
 * enquanto ao menos um dos dois estiver marcado (CHECK); o domínio apaga a linha
 * que ficou sem marcação. O teto de 50 fixadas é conferido no domínio.
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
