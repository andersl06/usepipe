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
import { atualizadoEm, carimbos, excluidoEm, id, listaCheck, momento } from './comum.js';
import { refTenant, usuario } from './identidade.js';
import { canal, contato, conversa } from './conversas.js';

/**
 * Módulo 6 — Automação e extração. Três peças distintas que costumam ser confundidas:
 * construtor de fluxo (a conversa automática), motor de workflow (a automação do
 * sistema) e a linguagem de consulta com o dicionário de dados.
 */

export const ESTADOS_FLUXO = ['rascunho', 'publicado', 'arquivado'] as const;

/** Os dois papéis do mesmo contato: conversa própria, ou distribuidor. */
export const TIPOS_FLUXO = ['fluxo', 'roteador'] as const;

/** O `ng-maxlength="160"` do campo "Descrição" de "Editar Fluxo" na origem. */
export const DESCRICAO_FLUXO_MAX = 160;

export const fluxo = pgTable(
  'fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    canalId: uuid('canal_id').references(() => canal.id, { onDelete: 'set null' }),
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
    imagemUrl: text('imagem_url'),
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
    usaContextoDoRoteador: boolean('usa_contexto_do_roteador').notNull().default(false),
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
    configuracao: jsonb('configuracao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_estado_ck', t.estado, ESTADOS_FLUXO),
    listaCheck('fluxo_tipo_ck', t.tipo, TIPOS_FLUXO),
    check('fluxo_descricao_ck', sql.raw(`char_length("descricao") <= ${DESCRICAO_FLUXO_MAX}`)),
  ],
);

/**
 * As quatro paradas do traço "Permissão" dos modais da Equipe — as chaves
 * `team.addUserModal.slider` da origem (`visualize`, `custom`, `edit`, `admin`).
 */
export const PAPEIS_NO_FLUXO = ['visualizar', 'personalizado', 'editar', 'admin'] as const;

/**
 * A equipe DO contato: quem acessa este fluxo e com que permissão. Migration 0035,
 * que explica o porquê (na origem a permissão é do BOT, não do tenant) e o formato
 * do `permissoes` — o `PermissionsList.html` da rota `/team/team/edit`.
 */
export const fluxoMembro = pgTable(
  'fluxo_membro',
  {
    id: id(),
    tenantId: refTenant(),
    fluxoId: uuid('fluxo_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    papelNoFluxo: text('papel_no_fluxo').notNull().default('visualizar'),
    /** `{ builder: 'escrever', analysis: 'ler', … }` — recurso da origem → rádio. */
    permissoes: jsonb('permissoes')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Partial<Record<string, 'nenhum' | 'ler' | 'escrever'>>>(),
    /** Quem pôs a pessoa aqui; sobrevive a ela (`set null`). */
    convidadoPor: uuid('convidado_por').references(() => usuario.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_membro_papel_ck', t.papelNoFluxo, PAPEIS_NO_FLUXO),
    uniqueIndex('fluxo_membro_uk').on(t.fluxoId, t.usuarioId),
    index('fluxo_membro_usuario_ix').on(t.usuarioId),
  ],
);

/**
 * Os serviços do roteador — o `master.services` da Blip. Migration 0024, que explica
 * cada coluna e por que não existe túnel no Pipe.
 */
export const roteadorServico = pgTable(
  'roteador_servico',
  {
    id: id(),
    tenantId: refTenant(),
    roteadorId: uuid('roteador_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'cascade' }),
    servicoId: uuid('servico_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'restrict' }),
    /** O nome do serviço: é o `content.address` do `Redirect`. */
    nome: text('nome').notNull(),
    principal: boolean('principal').notNull().default(false),
    /** "Não redirecionar automaticamente para o principal". */
    persistente: boolean('persistente').notNull().default(false),
    /** "Expiração do redirecionamento", da última mensagem do cliente. */
    expiracaoMin: integer('expiracao_min'),
    ...carimbos(),
  },
  (t) => [
    check('roteador_servico_distintos_ck', sql`${t.roteadorId} <> ${t.servicoId}`),
    check('roteador_servico_expiracao_ck', sql`${t.expiracaoMin} is null or ${t.expiracaoMin} > 0`),
    check(
      'roteador_servico_principal_ck',
      sql`not ${t.principal} or (not ${t.persistente} and ${t.expiracaoMin} is null)`,
    ),
    check(
      'roteador_servico_persistente_ck',
      sql`not ${t.persistente} or ${t.expiracaoMin} is null`,
    ),
    check(
      'roteador_servico_redirecionamento_ck',
      sql`${t.principal} or ${t.persistente} or ${t.expiracaoMin} is not null`,
    ),
    uniqueIndex('roteador_servico_nome_uk').on(t.roteadorId, t.nome),
    uniqueIndex('roteador_servico_servico_uk').on(t.roteadorId, t.servicoId),
    uniqueIndex('roteador_servico_principal_uk')
      .on(t.roteadorId)
      .where(sql`${t.principal}`),
  ],
);

/**
 * O Master-State: em que serviço do roteador o contato está. O "túnel" da Blip é a
 * chave (roteador, contato) — o contato é o real, único no tenant. Migration 0024.
 */
export const posicaoNoRoteador = pgTable(
  'posicao_no_roteador',
  {
    id: id(),
    tenantId: refTenant(),
    roteadorId: uuid('roteador_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'cascade' }),
    contatoId: uuid('contato_id')
      .notNull()
      .references(() => contato.id, { onDelete: 'cascade' }),
    servicoId: uuid('servico_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'cascade' }),
    desde: momento('desde').notNull().defaultNow(),
    /** Nulo = não expira (principal ou persistente). */
    expiraEm: momento('expira_em'),
    /** O contexto do roteador: o dos serviços com `usa_contexto_do_roteador`. */
    contexto: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Change-User-State pendente: o serviço começa em `bloco_inicial`, ou na raiz. */
    reiniciar: boolean('reiniciar').notNull().default(false),
    blocoInicial: text('bloco_inicial'),
  },
  (t) => [uniqueIndex('posicao_no_roteador_uk').on(t.roteadorId, t.contatoId)],
);

export const ESTADOS_FLUXO_VERSAO = ['rascunho', 'publicada', 'arquivada'] as const;

/** Versão publicada é separada da versão em edição — copiado da Blip porque está certo. */
export const fluxoVersao = pgTable(
  'fluxo_versao',
  {
    id: id(),
    tenantId: refTenant(),
    fluxoId: uuid('fluxo_id')
      .notNull()
      .references(() => fluxo.id, { onDelete: 'cascade' }),
    versao: integer('versao').notNull(),
    estado: text('estado').notNull().default('rascunho'),
    publicadaEm: momento('publicada_em'),
    publicadaPor: uuid('publicada_por').references(() => usuario.id, { onDelete: 'set null' }),
    /** Ações globais e `configuration` do `Flow` da Blip. Migration 0014. */
    global: jsonb('global')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('fluxo_versao_estado_ck', t.estado, ESTADOS_FLUXO_VERSAO),
    uniqueIndex('fluxo_versao_uk').on(t.fluxoId, t.versao),
  ],
);

export const TIPOS_BLOCO = [
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

export const bloco = pgTable(
  'bloco',
  {
    id: id(),
    tenantId: refTenant(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => fluxoVersao.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull(),
    conteudo: jsonb('conteudo')
      .notNull()
      .default(sql`'{}'::jsonb`),
    posicao: jsonb('posicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    listaCheck('bloco_tipo_ck', t.tipo, TIPOS_BLOCO),
    uniqueIndex('bloco_uk').on(t.versaoId, t.codigo),
  ],
);

export const transicao = pgTable(
  'transicao',
  {
    id: id(),
    tenantId: refTenant(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => fluxoVersao.id, { onDelete: 'cascade' }),
    deBlocoId: uuid('de_bloco_id')
      .notNull()
      .references(() => bloco.id, { onDelete: 'cascade' }),
    paraBlocoId: uuid('para_bloco_id').references(() => bloco.id, { onDelete: 'cascade' }),
    /**
     * Destino `{{variável}}` da Blip, decidido em tempo de execução. Exatamente um dos
     * dois destinos é preenchido (migration 0014).
     */
    paraVariavel: text('para_variavel'),
    condicao: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Condições de saída são avaliadas nesta ordem; a primeira que casar vence. */
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [
    index('transicao_de_bloco_idx').on(t.versaoId, t.deBlocoId, t.ordem),
    check('transicao_destino_ck', sql`(${t.paraBlocoId} is null) <> (${t.paraVariavel} is null)`),
  ],
);

export const ESTADOS_EXECUCAO = [
  'executando',
  'aguardando',
  'concluida',
  'falhou',
  'cancelada',
] as const;

export const execucaoFluxo = pgTable(
  'execucao_fluxo',
  {
    id: id(),
    tenantId: refTenant(),
    fluxoVersaoId: uuid('fluxo_versao_id')
      .notNull()
      .references(() => fluxoVersao.id, { onDelete: 'restrict' }),
    conversaId: uuid('conversa_id').references(() => conversa.id, { onDelete: 'cascade' }),
    contatoId: uuid('contato_id').references(() => contato.id, { onDelete: 'set null' }),
    estado: text('estado').notNull().default('executando'),
    /**
     * Mapa de variáveis que atravessa o fluxo e sobrevive à transferência para humano:
     * é o que faz o atendente receber o cliente já sabendo o que o robô coletou.
     */
    contexto: jsonb('contexto')
      .notNull()
      .default(sql`'{}'::jsonb`),
    blocoAtualId: uuid('bloco_atual_id').references(() => bloco.id, { onDelete: 'set null' }),
    iniciadaEm: momento('iniciada_em').notNull().defaultNow(),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    listaCheck('execucao_fluxo_estado_ck', t.estado, ESTADOS_EXECUCAO),
    index('execucao_fluxo_conversa_idx').on(t.tenantId, t.conversaId),
    index('execucao_fluxo_estado_idx').on(t.tenantId, t.estado, t.iniciadaEm),
    /**
     * Migration 0040: Dashboard, Visão Geral, Jornada e o Log de mensagens
     * filtram por `fluxo_versao.fluxo_id` (join até aqui por `fluxo_versao_id`).
     * Sem este índice essa perna do join varria `execucao_fluxo` inteira.
     */
    index('execucao_fluxo_versao_idx').on(t.tenantId, t.fluxoVersaoId),
  ],
);

export const execucaoPasso = pgTable(
  'execucao_passo',
  {
    id: id(),
    tenantId: refTenant(),
    execucaoId: uuid('execucao_id')
      .notNull()
      .references(() => execucaoFluxo.id, { onDelete: 'cascade' }),
    blocoId: uuid('bloco_id').references(() => bloco.id, { onDelete: 'set null' }),
    entrada: jsonb('entrada'),
    saida: jsonb('saida'),
    erro: text('erro'),
    duracaoMs: integer('duracao_ms'),
    tokens: integer('tokens'),
    em: momento('em').notNull().defaultNow(),
  },
  (t) => [
    index('execucao_passo_execucao_idx').on(t.tenantId, t.execucaoId, t.em),
    // A mesma mensagem da Meta só vira passo uma vez (migration 0014).
    uniqueIndex('execucao_passo_entrada_uk')
      .on(t.tenantId, sql`(${t.entrada} ->> 'id_provedor')`)
      .where(sql`${t.entrada} ? 'id_provedor'`),
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
export const POLITICAS_ERRO = ['parar', 'continuar', 'repetir'] as const;

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
    onErro: text('on_erro').notNull().default('parar'),
  },
  (t) => [
    listaCheck('acao_tipo_ck', t.tipo, TIPOS_ACAO),
    listaCheck('acao_on_erro_ck', t.onErro, POLITICAS_ERRO),
    uniqueIndex('acao_uk').on(t.workflowId, t.ordem),
  ],
);

/** Workflow que falha em silêncio é pior que workflow que não existe. */
export const execucaoWorkflow = pgTable(
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
    iniciadaEm: momento('iniciada_em').notNull().defaultNow(),
    encerradaEm: momento('encerrada_em'),
    erro: text('erro'),
  },
  (t) => [
    listaCheck('execucao_workflow_estado_ck', t.estado, ESTADOS_EXECUCAO),
    index('execucao_workflow_idx').on(t.tenantId, t.workflowId, t.iniciadaEm.desc()),
  ],
);

export const execucaoAcao = pgTable(
  'execucao_acao',
  {
    id: id(),
    tenantId: refTenant(),
    execucaoWorkflowId: uuid('execucao_workflow_id')
      .notNull()
      .references(() => execucaoWorkflow.id, { onDelete: 'cascade' }),
    acaoId: uuid('acao_id').references(() => acao.id, { onDelete: 'set null' }),
    entrada: jsonb('entrada'),
    saida: jsonb('saida'),
    erro: text('erro'),
    duracaoMs: integer('duracao_ms'),
    em: momento('em').notNull().defaultNow(),
  },
  (t) => [index('execucao_acao_execucao_idx').on(t.tenantId, t.execucaoWorkflowId, t.em)],
);

export const consultaSalva = pgTable(
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
    criadaPor: uuid('criada_por').references(() => usuario.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [uniqueIndex('consulta_salva_uk').on(t.tenantId, t.nome)],
);

export const FORMATOS_EXPORTACAO = ['csv', 'json', 'parquet'] as const;

export const agendamentoConsulta = pgTable(
  'agendamento_consulta',
  {
    id: id(),
    tenantId: refTenant(),
    consultaId: uuid('consulta_id')
      .notNull()
      .references(() => consultaSalva.id, { onDelete: 'cascade' }),
    cron: text('cron').notNull(),
    formato: text('formato').notNull().default('csv'),
    destino: jsonb('destino')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ativo: boolean('ativo').notNull().default(true),
    ultimaExecucaoEm: momento('ultima_execucao_em'),
    ...carimbos(),
  },
  (t) => [listaCheck('agendamento_consulta_formato_ck', t.formato, FORMATOS_EXPORTACAO)],
);

/**
 * Espelho do `objectMetadata` do CRM (Twenty) do tenant — ver a migration 0015.
 *
 * `codigo` é o `nameSingular` e `rotulo` o `labelSingular`; as demais colunas têm o nome
 * da propriedade do Twenty. Linha com `twentyId` veio da sincronização; sem ele, foi
 * declarada à mão pelo CRM caseiro.
 */
export const dicionarioObjeto = pgTable(
  'dicionario_objeto',
  {
    id: id(),
    tenantId: refTenant(),
    codigo: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    descricao: text('descricao'),
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
export const dicionarioCampo = pgTable(
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
 * origem (`docs/pesquisa/blip-integracoes-webhook.md`: switch + OAuth 2.0),
 * mais Básica, que a origem não mostra mas a tarefa pede. Migration 0036.
 */
export const TIPOS_AUTENTICACAO_WEBHOOK = [
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
    segredo: text('segredo').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    /** `nenhuma` (padrão) | `basica` | `oauth2_client_credentials`. Migration 0036. */
    tipoAutenticacao: text('tipo_autenticacao').notNull().default('nenhuma'),
    /** Usuário da autenticação básica — não é segredo, fica legível. */
    autenticacaoUsuario: text('autenticacao_usuario'),
    /** Senha da autenticação básica — cifrada em repouso (`@pipe/db/segredo`). */
    autenticacaoSenha: text('autenticacao_senha'),
    /** URL do token do OAuth 2.0 (`client_credentials`) — validada como a do webhook (HTTPS, sem rede privada). */
    oauth2UrlAutorizacao: text('oauth2_url_autorizacao'),
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
      t.tipoAutenticacao,
      TIPOS_AUTENTICACAO_WEBHOOK,
    ),
  ],
);

export const ESTADOS_ENTREGA_WEBHOOK = ['pendente', 'entregue', 'falhou', 'descartada'] as const;

export const entregaWebhook = pgTable(
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
    ultimoErro: text('ultimo_erro'),
    proximaTentativaEm: momento('proxima_tentativa_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('entrega_webhook_estado_ck', t.estado, ESTADOS_ENTREGA_WEBHOOK),
    index('entrega_webhook_pendente_idx').on(t.estado, t.proximaTentativaEm),
  ],
);
