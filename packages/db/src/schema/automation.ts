import { sql } from 'drizzle-orm';
import {
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
import { channel, contact, conversation } from './conversations.js';

/**
 * Módulo 6 — Automação e extração. Três peças distintas que costumam ser confundidas:
 * construtor de fluxo (a conversa automática), motor de workflow (a automação do
 * sistema) e a linguagem de consulta com o dicionário de dados.
 */

export const STATES_FLOW = ['rascunho', 'publicado', 'arquivado'] as const;

/** Os dois papéis do mesmo contato: conversa própria, ou distribuidor. */
export const TYPES_FLOW = ['fluxo', 'roteador'] as const;

/** O `ng-maxlength="160"` do campo "Descrição" de "Editar Fluxo" na origem. */
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
     * `fluxo` ou `roteador`.
     *
     * É o `template` da plataforma de origem (`builder` e `master`), e é o que
     * o cartão do portal etiqueta. Roteador é o MESMO bot sem conteúdo próprio:
     * ele só referencia outros e decide para qual deles a conversa vai — por
     * isso é coluna, e não tabela nova.
     */
    tipo: text('tipo').notNull().default('fluxo'),
    /**
     * O endereço da foto do contato — o `imageUri` da plataforma de origem, que
     * é o que o cartão do portal lê para desenhar o avatar.
     *
     * Opcional de verdade: lá o upload roda dentro de um `try/catch` que só
     * avisa no console e deixa a criação seguir. Migration 0020.
     */
    imageUrl: text('imagem_url'),
    /**
     * O identificador curto, derivado do nome (`name.toLowerCase()` na origem).
     *
     * É ele que vai na URL do contato lá (`/application/detail/{shortName}`) e
     * é o motivo de o nome ter de começar com letra. Sem índice único: a
     * unicidade continua sendo conferida sobre `nome`. Migration 0020.
     */
    shortName: text('short_name'),
    /**
     * A descrição do contato — o `description` de "Editar Fluxo"
     * (`/configurations/basic`) da plataforma de origem.
     *
     * Opcional (o `<textarea>` não tem `required`), e quando vem tem de ter
     * entre 2 e 160 caracteres (`ng-minlength="2"`, `ng-maxlength="160"`). O
     * teto é `check` porque é o único limite que o banco consegue guardar
     * sozinho; o mínimo é da `api`. Migration 0022.
     */
    descricao: text('descricao'),
    /**
     * "Utilizar o contexto do Roteador" (`builder:useTunnelOwnerContext`): como serviço de
     * um roteador, as variáveis são as do par (roteador, contato), divididas com os outros
     * serviços que também ligaram isto. Desligado, são só deste fluxo. Migration 0024.
     */
    usesContextOfRouter: boolean('usa_contexto_do_roteador').notNull().default(false),
    /**
     * Configurações do contato que ainda não tinham lugar próprio: hoje só
     * "Tela de Boas-vindas" (`{ boasVindas: { ativo, mensagem, textoBotao } }`)
     * e "Menu Persistente" (`{ menuPersistente: { itens: [{texto,link}] } }`),
     * as duas telas de `/configurations/welcome` e `/configurations/persistentMenu`
     * — chave ausente é "nunca configurado". Migration 0031.
     *
     * Por que uma coluna e não uma tabela: são poucos campos, de UMA tela cada,
     * sem histórico próprio (ao contrário de `fluxo_versao.global`, que é por
     * VERSÃO publicada) — é o retrato atual do contato, como `nome` e `descricao`.
     */
    configuration: jsonb('configuracao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_estado_ck', t.estado, STATES_FLOW),
    listaCheck('fluxo_tipo_ck', t.tipo, TYPES_FLOW),
    check('fluxo_descricao_ck', sql.raw(`char_length("descricao") <= ${DESCRIPTION_FLOW_MAX}`)),
  ],
);

/**
 * As quatro paradas do traço "Permissão" dos modais da Equipe — as chaves
 * `team.addUserModal.slider` da origem (`visualize`, `custom`, `edit`, `admin`).
 */
export const PAPEIS_IN_FLOW = ['visualizar', 'personalizado', 'editar', 'admin'] as const;

/**
 * A equipe DO contato: quem acessa este fluxo e com que permissão. Migration 0035,
 * que explica o porquê (na origem a permissão é do BOT, não do tenant) e o formato
 * do `permissoes` — o `PermissionsList.html` da rota `/team/team/edit`.
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
    /** `{ builder: 'escrever', analysis: 'ler', … }` — recurso da origem → rádio. */
    permissions: jsonb('permissoes')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Partial<Record<string, 'nenhum' | 'ler' | 'escrever'>>>(),
    /** Quem pôs a pessoa aqui; sobrevive a ela (`set null`). */
    convidadoBy: uuid('convidado_por').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_membro_papel_ck', t.roleInFlow, PAPEIS_IN_FLOW),
    uniqueIndex('fluxo_membro_uk').on(t.flowId, t.userId),
    index('fluxo_membro_usuario_ix').on(t.userId),
  ],
);

/**
 * Os serviços do roteador — o `master.services` da Blip. Migration 0024, que explica
 * cada coluna e por que não existe túnel no Pipe.
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
    /** O nome do serviço: é o `content.address` do `Redirect`. */
    nome: text('nome').notNull(),
    principal: boolean('principal').notNull().default(false),
    /** "Não redirecionar automaticamente para o principal". */
    persistente: boolean('persistente').notNull().default(false),
    /** "Expiração do redirecionamento", da última mensagem do cliente. */
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
 * O Master-State: em que serviço do roteador o contato está. O "túnel" da Blip é a
 * chave (roteador, contato) — o contato é o real, único no tenant. Migration 0024.
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
    /** Nulo = não expira (principal ou persistente). */
    expiraEm: moment('expira_em'),
    /** O contexto do roteador: o dos serviços com `usa_contexto_do_roteador`. */
    context: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Change-User-State pendente: o serviço começa em `bloco_inicial`, ou na raiz. */
    reiniciar: boolean('reiniciar').notNull().default(false),
    blockInicial: text('bloco_inicial'),
  },
  (t) => [uniqueIndex('posicao_no_roteador_uk').on(t.roteadorId, t.contactId)],
);

export const STATES_FLOW_VERSION = ['rascunho', 'publicada', 'arquivada'] as const;

/** Versão publicada é separada da versão em edição — copiado da Blip porque está certo. */
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
    /** Ações globais e `configuration` do `Flow` da Blip. Migration 0014. */
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
     * Destino `{{variável}}` da Blip, decidido em tempo de execução. Exatamente um dos
     * dois destinos é preenchido (migration 0014).
     */
    forVariable: text('para_variavel'),
    condition: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Condições de saída são avaliadas nesta ordem; a primeira que casar vence. */
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
    estado: text('estado').notNull().default('executando'),
    /**
     * Mapa de variáveis que atravessa o fluxo e sobrevive à transferência para humano:
     * é o que faz o atendente receber o cliente já sabendo o que o robô coletou.
     */
    contexto: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    blockAtualId: uuid('bloco_atual_id').references(() => block.id, { onDelete: 'set null' }),
    iniciadaEm: moment('iniciada_em').notNull().defaultNow(),
    encerradaEm: moment('encerrada_em'),
  },
  (t) => [
    listaCheck('execucao_fluxo_estado_ck', t.estado, STATES_EXECUTION),
    index('execucao_fluxo_conversa_idx').on(t.tenantId, t.conversationId),
    index('execucao_fluxo_estado_idx').on(t.tenantId, t.estado, t.iniciadaEm),
    /**
     * Migration 0040: Dashboard, Visão Geral, Jornada e o Log de mensagens
     * filtram por `fluxo_versao.fluxo_id` (join até aqui por `fluxo_versao_id`).
     * Sem este índice essa perna do join varria `execucao_fluxo` inteira.
     */
    index('execucao_fluxo_versao_idx').on(t.tenantId, t.flowVersionId),
  ],
);

export const executionPasso = pgTable(
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
    // A mesma mensagem da Meta só vira passo uma vez (migration 0014).
    uniqueIndex('execucao_passo_entrada_uk')
      .on(t.tenantId, sql`(${t.inbound} ->> 'id_provedor')`)
      .where(sql`${t.inbound} ? 'id_provedor'`),
  ],
);

export const ESTADOS_PROCESS_HTTP = ['pendente', 'chamando', 'respondida', 'retomada'] as const;

/** O cursor de ProcessHttp vive separado para conservar cada posição executada. */
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

/** Workflow que falha em silêncio é pior que workflow que não existe. */
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

export const executionAcao = pgTable(
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
     * Consulta estruturada, analisada contra o dicionário de dados do tenant. Nunca
     * vira SQL cru vindo do cliente, e o `tenant_id` é imposto pelo servidor.
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
 * Espelho do `objectMetadata` do CRM (Twenty) do tenant — ver a migration 0015.
 *
 * `codigo` é o `nameSingular` e `rotulo` o `labelSingular`; as demais colunas têm o nome
 * da propriedade do Twenty. Linha com `twentyId` veio da sincronização; sem ele, foi
 * declarada à mão pelo CRM caseiro.
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
    /** Sumiu do Twenty. A linha fica, para o bloco que aponta para ela acusar a falta. */
    excluidoEm: excluidoEm(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('dicionario_objeto_uk').on(t.tenantId, t.codigo)],
);

/**
 * Não é documentação: é o que a linguagem de consulta lê para decidir o que é permitido.
 *
 * Espelho do `fieldMetadata` do Twenty: `codigo` é o `name`, `rotulo` o `label`, `tipo`
 * o `type` literal (`TEXT`, `CURRENCY`, `RELATION`…). `options`, `defaultValue`,
 * `settings` e `relation` ficam no formato exato que a Metadata API devolve.
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
 * Autenticação de saída do webhook — a "Configurações de autenticação" da
 * origem (`referencias-blip/pesquisa/blip-integracoes-webhook.md`: switch + OAuth 2.0),
 * mais Básica, que a origem não mostra mas a tarefa pede. Migration 0036.
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
    /** `nenhuma` (padrão) | `basica` | `oauth2_client_credentials`. Migration 0036. */
    typeAuthentication: text('tipo_autenticacao').notNull().default('nenhuma'),
    /** Usuário da autenticação básica — não é segredo, fica legível. */
    authenticationUser: text('autenticacao_usuario'),
    /** Senha da autenticação básica — cifrada em repouso (`@pipe/db/segredo`). */
    authenticationPassword: text('autenticacao_senha'),
    /** URL do token do OAuth 2.0 (`client_credentials`) — validada como a do webhook (HTTPS, sem rede privada). */
    oauth2UrlAuthorization: text('oauth2_url_autorizacao'),
    /** Client ID do OAuth 2.0 — não é segredo. */
    oauth2ClientId: text('oauth2_client_id'),
    /** Client Secret do OAuth 2.0 — cifrado em repouso. */
    oauth2ClientSecret: text('oauth2_client_secret'),
    /**
     * Cabeçalhos customizados — `[{ chave, valor }]`. Nunca inclui os
     * reservados da assinatura (`content-type`, `x-pipe-signature`,
     * `x-pipe-timestamp`, `x-pipe-delivery`) nem `authorization`: a regra
     * de gravação (`dominio/gestao/integracoes.ts`) recusa antes de chegar
     * aqui, então a coluna não precisa de `check` para isso.
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
