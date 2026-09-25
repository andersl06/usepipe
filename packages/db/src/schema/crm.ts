import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { carimbos, money, id, listaCheck, moment } from './comum.js';
import { refTenant, user } from './identity.js';
import { contact, conversation, queue } from './conversations.js';

/**
 * Módulo 2 — CRM. As duas decisões que sustentam o módulo: pergunta de formulário é
 * linha e não coluna (o Lead do Salesforce de hoje tem 353 campos, 304 customizados),
 * e o score se explica — cada cálculo é uma linha nova, não uma sobrescrita.
 */

export const account = pgTable(
  'conta',
  {
    id: id(),
    tenantId: refTenant(),
    name: text('nome').notNull(),
    /** CPF/CNPJ em `text`: o CNPJ alfanumérico de 2026 quebra coluna numérica e máscara fixa. */
    document: text('documento'),
    domain: text('dominio'),
    atributos: jsonb('atributos')
      .notNull()
      .default(sql`'{}'::jsonb`),
    proprietarioId: uuid('proprietario_id').references(() => user.id, { onDelete: 'set null' }),
    excluidoEm: moment('excluido_em'),
    /** O `id` da `company` correspondente no Twenty. Ver `contato.twenty_pessoa_id`. */
    twentyEmpresaId: text('twenty_empresa_id'),
    ...carimbos(),
  },
  (t) => [
    index('conta_tenant_documento_idx').on(t.tenantId, t.document),
    index('conta_tenant_nome_idx').on(t.tenantId, t.name),
    index('conta_atributos_gin').using('gin', t.atributos),
  ],
);

export const STATUS_LEAD = [
  'novo',
  'em_contato',
  'qualificado',
  'convertido',
  'desqualificado',
] as const;

export const lead = pgTable(
  'lead',
  {
    id: id(),
    tenantId: refTenant(),
    contactId: uuid('contato_id').references(() => contact.id, { onDelete: 'set null' }),
    contaId: uuid('conta_id').references(() => account.id, { onDelete: 'set null' }),
    origin: text('origem'),
    campanha: text('campanha'),
    utm: jsonb('utm')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('novo'),
    fase: text('fase'),
    faseDesde: moment('fase_desde'),
    proprietarioId: uuid('proprietario_id').references(() => user.id, { onDelete: 'set null' }),
    /** Denormalizados de `score_lead` porque são os dois campos filtrados o tempo todo. */
    scoreAtual: integer('score_atual'),
    faixaAtual: text('faixa_atual'),
    desqualificadoEm: moment('desqualificado_em'),
    reasonDisqualificationId: uuid('motivo_desqualificacao_id'),
    /** Campo customizado por tenant vive aqui, com índice GIN — nunca `alter table` em runtime. */
    customizados: jsonb('customizados')
      .notNull()
      .default(sql`'{}'::jsonb`),
    excluidoEm: moment('excluido_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('lead_status_ck', t.status, STATUS_LEAD),
    index('lead_tenant_status_idx').on(t.tenantId, t.status),
    index('lead_tenant_faixa_idx').on(t.tenantId, t.faixaAtual),
    index('lead_tenant_proprietario_idx').on(t.tenantId, t.proprietarioId),
    index('lead_customizados_gin').using('gin', t.customizados),
  ],
);

export const formulario = pgTable(
  'formulario',
  {
    id: id(),
    tenantId: refTenant(),
    name: text('nome').notNull(),
    slug: text('slug').notNull(),
    active: boolean('ativo').notNull().default(true),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_tenant_slug_uk').on(t.tenantId, t.slug)],
);

export const formularioVersao = pgTable(
  'formulario_versao',
  {
    id: id(),
    tenantId: refTenant(),
    formId: uuid('formulario_id')
      .notNull()
      .references(() => formulario.id, { onDelete: 'cascade' }),
    version: integer('versao').notNull(),
    publicadaEm: moment('publicada_em'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_versao_uk').on(t.formId, t.version)],
);

export const TIPOS_PERGUNTA = [
  'texto',
  'texto_longo',
  'numero',
  'data',
  'booleano',
  'selecao_unica',
  'selecao_multipla',
] as const;

export const formularioPergunta = pgTable(
  'formulario_pergunta',
  {
    id: id(),
    tenantId: refTenant(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => formularioVersao.id, { onDelete: 'cascade' }),
    code: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    type: text('tipo').notNull(),
    options: jsonb('opcoes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    order: integer('ordem').notNull().default(0),
    required: boolean('obrigatoria').notNull().default(false),
  },
  (t) => [
    listaCheck('formulario_pergunta_tipo_ck', t.type, TIPOS_PERGUNTA),
    uniqueIndex('formulario_pergunta_uk').on(t.versaoId, t.code),
  ],
);

/**
 * A resposta é linha, com a versão do formulário junto: mudar o questionário não quebra
 * o histórico, e o questionário de março continua legível depois do de setembro.
 */
export const respostaFormulario = pgTable(
  'resposta_formulario',
  {
    id: id(),
    tenantId: refTenant(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => lead.id, { onDelete: 'cascade' }),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => formularioVersao.id, { onDelete: 'restrict' }),
    perguntaId: uuid('pergunta_id')
      .notNull()
      .references(() => formularioPergunta.id, { onDelete: 'restrict' }),
    valueText: text('valor_texto'),
    valueNumber: numeric('valor_num', { precision: 20, scale: 6 }),
    valueData: moment('valor_data'),
    valueBoolean: boolean('valor_bool'),
    valueJson: jsonb('valor_json'),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('resposta_formulario_uk').on(t.leadId, t.perguntaId),
    index('resposta_formulario_pergunta_idx').on(t.tenantId, t.perguntaId),
  ],
);

export const regraScore = pgTable(
  'regra_score',
  {
    id: id(),
    tenantId: refTenant(),
    version: integer('versao').notNull(),
    name: text('nome').notNull(),
    condition: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    pontos: integer('pontos').notNull(),
    active: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [index('regra_score_versao_idx').on(t.tenantId, t.version, t.active)],
);

/**
 * Cada cálculo é uma linha nova. `explicacao` guarda o array de {regra, versão, pontos}
 * que produziu o número: é o que responde *por que* o lead tirou 74 e o que permite
 * recalcular a base inteira quando a regra muda, sem perder o histórico.
 */
export const scoreLead = pgTable(
  'score_lead',
  {
    id: id(),
    tenantId: refTenant(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => lead.id, { onDelete: 'cascade' }),
    versaoRegra: integer('versao_regra').notNull(),
    value: integer('valor').notNull(),
    faixa: text('faixa'),
    explanation: jsonb('explicacao')
      .notNull()
      .default(sql`'[]'::jsonb`),
    calculadoEm: moment('calculado_em').notNull().defaultNow(),
  },
  (t) => [index('score_lead_lead_idx').on(t.tenantId, t.leadId, t.calculadoEm.desc())],
);

export const ESTRATEGIAS_PROPRIETARIO = ['rodizio', 'menor_carga', 'fixo', 'nenhuma'] as const;

/** A faixa é a saída do motor de score, e é ela que decide fila e proprietário. */
export const faixaScore = pgTable(
  'faixa_score',
  {
    id: id(),
    tenantId: refTenant(),
    version: integer('versao').notNull(),
    name: text('nome').notNull(),
    minimo: integer('minimo').notNull(),
    maximo: integer('maximo').notNull(),
    queueId: uuid('fila_id').references(() => queue.id, { onDelete: 'set null' }),
    estrategiaProprietario: text('estrategia_proprietario').notNull().default('nenhuma'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('faixa_score_estrategia_ck', t.estrategiaProprietario, ESTRATEGIAS_PROPRIETARIO),
    uniqueIndex('faixa_score_uk').on(t.tenantId, t.version, t.name),
  ],
);

export const opportunity = pgTable(
  'oportunidade',
  {
    id: id(),
    tenantId: refTenant(),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'set null' }),
    accountId: uuid('conta_id').references(() => account.id, { onDelete: 'set null' }),
    name: text('nome').notNull(),
    value: money('valor'),
    moeda: text('moeda').notNull().default('BRL'),
    fase: text('fase').notNull(),
    probability: smallint('probabilidade'),
    closingExpected: date('fechamento_previsto'),
    fechadaEm: moment('fechada_em'),
    ganha: boolean('ganha'),
    motivoPerda: text('motivo_perda'),
    proprietarioId: uuid('proprietario_id').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    index('oportunidade_tenant_fase_idx').on(t.tenantId, t.fase),
    index('oportunidade_tenant_fechamento_idx').on(t.tenantId, t.closingExpected),
  ],
);

export const TYPES_ACTIVITY = [
  'nota',
  'ligacao',
  'reuniao',
  'email',
  'conversa',
  'tarefa',
  'mudanca_fase',
] as const;

export const activity = pgTable(
  'atividade',
  {
    id: id(),
    tenantId: refTenant(),
    type: text('tipo').notNull(),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'cascade' }),
    contaId: uuid('conta_id').references(() => account.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversa_id').references(() => conversation.id, { onDelete: 'set null' }),
    userId: uuid('usuario_id').references(() => user.id, { onDelete: 'set null' }),
    summary: text('resumo'),
    body: text('corpo'),
    ocorridaEm: moment('ocorrida_em').notNull().defaultNow(),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('atividade_tipo_ck', t.type, TYPES_ACTIVITY),
    index('atividade_lead_idx').on(t.tenantId, t.leadId, t.ocorridaEm.desc()),
    index('atividade_conta_idx').on(t.tenantId, t.contaId, t.ocorridaEm.desc()),
  ],
);

export const ORIGINS_IMPORT = ['salesforce', 'hubspot', 'rd_station', 'csv'] as const;
export const STATES_IMPORT = [
  'rascunho',
  'validando',
  'pronta',
  'executando',
  'concluida',
  'falhou',
] as const;

export const contactImport = pgTable(
  'importacao',
  {
    id: id(),
    tenantId: refTenant(),
    origin: text('origem').notNull(),
    file: text('arquivo'),
    mapping: jsonb('mapeamento')
      .notNull()
      .default(sql`'{}'::jsonb`),
    state: text('estado').notNull().default('rascunho'),
    total: integer('total').notNull().default(0),
    aceitos: integer('aceitos').notNull().default(0),
    rejeitados: integer('rejeitados').notNull().default(0),
    /** Chave no storage do relatório de linhas rejeitadas. */
    keyReport: text('chave_relatorio'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('importacao_origem_ck', t.origin, ORIGINS_IMPORT),
    listaCheck('importacao_estado_ck', t.state, STATES_IMPORT),
  ],
);

export const OBJETOS_CUSTOMIZAVEIS = ['lead', 'conta', 'contato', 'oportunidade'] as const;

export const campoCustomizado = pgTable(
  'campo_customizado',
  {
    id: id(),
    tenantId: refTenant(),
    objeto: text('objeto').notNull(),
    code: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    type: text('tipo').notNull(),
    opcoes: jsonb('opcoes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('campo_customizado_objeto_ck', t.objeto, OBJETOS_CUSTOMIZAVEIS),
    listaCheck('campo_customizado_tipo_ck', t.type, TIPOS_PERGUNTA),
    uniqueIndex('campo_customizado_uk').on(t.tenantId, t.objeto, t.code),
  ],
);
