import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { carimbos, id, listaCheck, moment } from './comum.js';
import { refTenant, user } from './identity.js';
import { conversation, queue } from './conversations.js';

/**
 * Module 5, AI quality review: form (group -> criterion -> weight, with a fatal criterion that zeroes the score), evaluation (human or AI), and cycle (feedback -> dispute -> calibration -> coaching).
 */

export const formEvaluation = pgTable(
  'formulario_avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    versao: integer('versao').notNull().default(1),
    notaMaxima: numeric('nota_maxima', { precision: 6, scale: 2 }).notNull().default('100'),
    scopeQueueId: uuid('escopo_fila_id').references(() => queue.id, { onDelete: 'set null' }),
    ativo: boolean('ativo').notNull().default(true),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_avaliacao_uk').on(t.tenantId, t.nome, t.versao)],
);

export const grupoCriterio = pgTable(
  'grupo_criterio',
  {
    id: id(),
    tenantId: refTenant(),
    formularioId: uuid('formulario_id')
      .notNull()
      .references(() => formEvaluation.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    peso: numeric('peso', { precision: 6, scale: 2 }).notNull().default('1'),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [index('grupo_criterio_formulario_idx').on(t.formularioId, t.ordem)],
);

export const TIPOS_CRITERIO = ['conforme', 'escala', 'nota'] as const;

export const criterio = pgTable(
  'criterio',
  {
    id: id(),
    tenantId: refTenant(),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupoCriterio.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    description: text('descricao'),
    peso: numeric('peso', { precision: 6, scale: 2 }).notNull().default('1'),
    tipo: text('tipo').notNull().default('conforme'),
    /** A fatal criterion zeroes the entire evaluation score. */
    fatal: boolean('fatal').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [
    listaCheck('criterio_tipo_ck', t.tipo, TIPOS_CRITERIO),
    index('criterio_grupo_idx').on(t.grupoId, t.ordem),
  ],
);

export const TIPOS_AVALIADOR = ['humano', 'ia'] as const;
export const STATES_EVALUATION = [
  'rascunho',
  'concluida',
  'contestada',
  'revisada',
  'encerrada',
] as const;

export const evaluation = pgTable(
  'avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    formularioId: uuid('formulario_id')
      .notNull()
      .references(() => formEvaluation.id, { onDelete: 'restrict' }),
    avaliadoId: uuid('avaliado_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    avaliadorTipo: text('avaliador_tipo').notNull(),
    avaliadorId: uuid('avaliador_id').references(() => user.id, { onDelete: 'set null' }),
    nota: numeric('nota', { precision: 6, scale: 2 }),
    conceito: text('conceito'),
    /**
     * The AI score starts as a suggestion and becomes effective according to tenant policy: always, only above this threshold, or never.
     */
    confiancaIa: numeric('confianca_ia', { precision: 5, scale: 4 }),
    state: text('estado').notNull().default('rascunho'),
    avaliadaEm: moment('avaliada_em'),
    reviewedBy: uuid('revisada_por').references(() => user.id, { onDelete: 'set null' }),
    revisadaEm: moment('revisada_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('avaliacao_avaliador_tipo_ck', t.avaliadorTipo, TIPOS_AVALIADOR),
    listaCheck('avaliacao_estado_ck', t.state, STATES_EVALUATION),
    index('avaliacao_avaliado_idx').on(t.tenantId, t.avaliadoId, t.avaliadaEm.desc()),
    index('avaliacao_conversa_idx').on(t.tenantId, t.conversaId),
    index('avaliacao_estado_idx').on(t.tenantId, t.state),
  ],
);

/**
 * `evidencia_mensagem_id` identifies the quoted passage supporting the score. It has no foreign key because `message` is partitioned and unique on (id, criada_em).
 */
export const responseEvaluation = pgTable(
  'resposta_avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    evaluationId: uuid('avaliacao_id')
      .notNull()
      .references(() => evaluation.id, { onDelete: 'cascade' }),
    criterioId: uuid('criterio_id')
      .notNull()
      .references(() => criterio.id, { onDelete: 'restrict' }),
    value: text('valor'),
    pontos: numeric('pontos', { precision: 6, scale: 2 }),
    justificativa: text('justificativa'),
    evidenceMessageId: uuid('evidencia_mensagem_id'),
  },
  (t) => [uniqueIndex('resposta_avaliacao_uk').on(t.evaluationId, t.criterioId)],
);

export const STATES_DISPUTE = ['aberta', 'aceita', 'recusada'] as const;

export const dispute = pgTable(
  'contestacao',
  {
    id: id(),
    tenantId: refTenant(),
    avaliacaoId: uuid('avaliacao_id')
      .notNull()
      .references(() => evaluation.id, { onDelete: 'cascade' }),
    openBy: uuid('aberta_por')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    motivo: text('motivo').notNull(),
    estado: text('estado').notNull().default('aberta'),
    resposta: text('resposta'),
    decidedBy: uuid('decidida_por').references(() => user.id, { onDelete: 'set null' }),
    decididaEm: moment('decidida_em'),
    ...carimbos(),
  },
  (t) => [listaCheck('contestacao_estado_ck', t.estado, STATES_DISPUTE)],
);

/** Calibration measures the gap between human and AI scores for each criterion. */
export const calibration = pgTable('calibracao', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  periodStart: date('periodo_inicio').notNull(),
  periodEnd: date('periodo_fim').notNull(),
  amostraN: integer('amostra_n').notNull().default(0),
  ...carimbos(),
});

export const calibrationItem = pgTable(
  'calibracao_item',
  {
    id: id(),
    tenantId: refTenant(),
    calibrationId: uuid('calibracao_id')
      .notNull()
      .references(() => calibration.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    evaluationHumanId: uuid('avaliacao_humana_id').references(() => evaluation.id, {
      onDelete: 'set null',
    }),
    evaluationAiId: uuid('avaliacao_ia_id').references(() => evaluation.id, {
      onDelete: 'set null',
    }),
    desvioTotal: numeric('desvio_total', { precision: 6, scale: 2 }),
    deviationByCriterion: jsonb('desvio_por_criterio')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex('calibracao_item_uk').on(t.calibrationId, t.conversationId)],
);

export const feedback = pgTable(
  'feedback',
  {
    id: id(),
    tenantId: refTenant(),
    avaliacaoId: uuid('avaliacao_id')
      .notNull()
      .references(() => evaluation.id, { onDelete: 'cascade' }),
    ofUserId: uuid('de_usuario_id').references(() => user.id, { onDelete: 'set null' }),
    forUserId: uuid('para_usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    corpo: text('corpo').notNull(),
    lidoEm: moment('lido_em'),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [index('feedback_para_idx').on(t.tenantId, t.forUserId, t.lidoEm)],
);

export const ESTADOS_PLANO_COACH = ['aberto', 'em_andamento', 'concluido', 'cancelado'] as const;

export const planoCoach = pgTable(
  'plano_coach',
  {
    id: id(),
    tenantId: refTenant(),
    userId: uuid('usuario_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    criterioId: uuid('criterio_id').references(() => criterio.id, { onDelete: 'set null' }),
    meta: text('meta').notNull(),
    prazo: date('prazo'),
    estado: text('estado').notNull().default('aberto'),
    createdBy: uuid('criado_por').references(() => user.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [listaCheck('plano_coach_estado_ck', t.estado, ESTADOS_PLANO_COACH)],
);

export const SENTIMENTS = ['positivo', 'neutro', 'negativo'] as const;

export const classificationConversation = pgTable(
  'classificacao_conversa',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    categoria: text('categoria'),
    subcategoria: text('subcategoria'),
    resumo: text('resumo'),
    intent: text('intencao'),
    sentiment: text('sentimento'),
    confianca: numeric('confianca', { precision: 5, scale: 4 }),
    template: text('modelo'),
    criadaEm: moment('criada_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('classificacao_conversa_sentimento_ck', t.sentiment, SENTIMENTS),
    uniqueIndex('classificacao_conversa_uk').on(t.conversaId),
    index('classificacao_conversa_categoria_idx').on(t.tenantId, t.categoria, t.criadaEm),
  ],
);


export const insight = pgTable(
  'insight',
  {
    id: id(),
    tenantId: refTenant(),
    periodoInicio: date('periodo_inicio').notNull(),
    periodoFim: date('periodo_fim').notNull(),
    categoria: text('categoria').notNull(),
    volume: integer('volume').notNull().default(0),
    variationPercent: numeric('variacao_pct', { precision: 8, scale: 2 }),
    candidateAutomation: boolean('candidata_automacao').notNull().default(false),
    exemplos: uuid('exemplos')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...carimbos(),
  },
  (t) => [uniqueIndex('insight_uk').on(t.tenantId, t.periodoInicio, t.periodoFim, t.categoria)],
);

/** Without this, AI could be sold at a loss. These records support both the customer dashboard and billing. */
export const consumoIa = pgTable(
  'consumo_ia',
  {
    id: id(),
    tenantId: refTenant(),
    functionality: text('funcionalidade').notNull(),
    modelo: text('modelo').notNull(),
    tokensInbound: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    custoCentavos: integer('custo_centavos').notNull().default(0),
    objetoTipo: text('objeto_tipo'),
    objetoId: uuid('objeto_id'),
    em: moment('em').notNull().defaultNow(),
  },
  (t) => [index('consumo_ia_periodo_idx').on(t.tenantId, t.functionality, t.em)],
);

export const baseKnowledge = pgTable('base_conhecimento', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  active: boolean('ativa').notNull().default(true),
  ...carimbos(),
});

/**
 * Incremental and versioned: documents are independent, and every passage traces to its document and version. This lets copilot suggestions cite their source.
 */
export const documentKnowledge = pgTable(
  'documento_conhecimento',
  {
    id: id(),
    tenantId: refTenant(),
    baseId: uuid('base_id')
      .notNull()
      .references(() => baseKnowledge.id, { onDelete: 'cascade' }),
    titulo: text('titulo').notNull(),
    corpo: text('corpo').notNull(),
    versao: integer('versao').notNull().default(1),
    atualizadoEm: moment('atualizado_em'),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: moment('criado_em').notNull().defaultNow(),
  },
  (t) => [index('documento_conhecimento_base_idx').on(t.tenantId, t.baseId, t.ativo)],
);

export const snippetKnowledge = pgTable(
  'trecho_conhecimento',
  {
    id: id(),
    tenantId: refTenant(),
    documentId: uuid('documento_id')
      .notNull()
      .references(() => documentKnowledge.id, { onDelete: 'cascade' }),
    texto: text('texto').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    order: integer('ordem').notNull().default(0),
  },
  (t) => [index('trecho_conhecimento_documento_idx').on(t.tenantId, t.documentId, t.order)],
);
