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
import { carimbos, id, listaCheck, momento } from './comum.js';
import { refTenant, usuario } from './identidade.js';
import { conversa, fila } from './conversas.js';

/**
 * Módulo 5 — Monitoria com IA. Formulário (grupo → critério → peso, com critério fatal
 * que zera a nota) × avaliação (humana ou IA) × ciclo (feedback → contestação →
 * calibração → coach).
 */

export const formularioAvaliacao = pgTable(
  'formulario_avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    versao: integer('versao').notNull().default(1),
    notaMaxima: numeric('nota_maxima', { precision: 6, scale: 2 }).notNull().default('100'),
    escopoFilaId: uuid('escopo_fila_id').references(() => fila.id, { onDelete: 'set null' }),
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
      .references(() => formularioAvaliacao.id, { onDelete: 'cascade' }),
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
    descricao: text('descricao'),
    peso: numeric('peso', { precision: 6, scale: 2 }).notNull().default('1'),
    tipo: text('tipo').notNull().default('conforme'),
    /** Critério fatal zera a nota da avaliação inteira. */
    fatal: boolean('fatal').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [
    listaCheck('criterio_tipo_ck', t.tipo, TIPOS_CRITERIO),
    index('criterio_grupo_idx').on(t.grupoId, t.ordem),
  ],
);

export const TIPOS_AVALIADOR = ['humano', 'ia'] as const;
export const ESTADOS_AVALIACAO = [
  'rascunho',
  'concluida',
  'contestada',
  'revisada',
  'encerrada',
] as const;

export const avaliacao = pgTable(
  'avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    formularioId: uuid('formulario_id')
      .notNull()
      .references(() => formularioAvaliacao.id, { onDelete: 'restrict' }),
    avaliadoId: uuid('avaliado_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    avaliadorTipo: text('avaliador_tipo').notNull(),
    avaliadorId: uuid('avaliador_id').references(() => usuario.id, { onDelete: 'set null' }),
    nota: numeric('nota', { precision: 6, scale: 2 }),
    conceito: text('conceito'),
    /**
     * A nota da IA nasce como sugestão e vira efetiva conforme a política do tenant —
     * sempre, só acima deste limiar, ou nunca.
     */
    confiancaIa: numeric('confianca_ia', { precision: 5, scale: 4 }),
    estado: text('estado').notNull().default('rascunho'),
    avaliadaEm: momento('avaliada_em'),
    revisadaPor: uuid('revisada_por').references(() => usuario.id, { onDelete: 'set null' }),
    revisadaEm: momento('revisada_em'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('avaliacao_avaliador_tipo_ck', t.avaliadorTipo, TIPOS_AVALIADOR),
    listaCheck('avaliacao_estado_ck', t.estado, ESTADOS_AVALIACAO),
    index('avaliacao_avaliado_idx').on(t.tenantId, t.avaliadoId, t.avaliadaEm.desc()),
    index('avaliacao_conversa_idx').on(t.tenantId, t.conversaId),
    index('avaliacao_estado_idx').on(t.tenantId, t.estado),
  ],
);

/**
 * `evidencia_mensagem_id` é o trecho citado que sustenta a nota. Sem chave estrangeira
 * porque `mensagem` é particionada e sua unicidade é (id, criada_em).
 */
export const respostaAvaliacao = pgTable(
  'resposta_avaliacao',
  {
    id: id(),
    tenantId: refTenant(),
    avaliacaoId: uuid('avaliacao_id')
      .notNull()
      .references(() => avaliacao.id, { onDelete: 'cascade' }),
    criterioId: uuid('criterio_id')
      .notNull()
      .references(() => criterio.id, { onDelete: 'restrict' }),
    valor: text('valor'),
    pontos: numeric('pontos', { precision: 6, scale: 2 }),
    justificativa: text('justificativa'),
    evidenciaMensagemId: uuid('evidencia_mensagem_id'),
  },
  (t) => [uniqueIndex('resposta_avaliacao_uk').on(t.avaliacaoId, t.criterioId)],
);

export const ESTADOS_CONTESTACAO = ['aberta', 'aceita', 'recusada'] as const;

export const contestacao = pgTable(
  'contestacao',
  {
    id: id(),
    tenantId: refTenant(),
    avaliacaoId: uuid('avaliacao_id')
      .notNull()
      .references(() => avaliacao.id, { onDelete: 'cascade' }),
    abertaPor: uuid('aberta_por')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    motivo: text('motivo').notNull(),
    estado: text('estado').notNull().default('aberta'),
    resposta: text('resposta'),
    decididaPor: uuid('decidida_por').references(() => usuario.id, { onDelete: 'set null' }),
    decididaEm: momento('decidida_em'),
    ...carimbos(),
  },
  (t) => [listaCheck('contestacao_estado_ck', t.estado, ESTADOS_CONTESTACAO)],
);

/** Bancada de medição: mede o desvio entre a nota humana e a da IA, critério a critério. */
export const calibracao = pgTable('calibracao', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  periodoInicio: date('periodo_inicio').notNull(),
  periodoFim: date('periodo_fim').notNull(),
  amostraN: integer('amostra_n').notNull().default(0),
  ...carimbos(),
});

export const calibracaoItem = pgTable(
  'calibracao_item',
  {
    id: id(),
    tenantId: refTenant(),
    calibracaoId: uuid('calibracao_id')
      .notNull()
      .references(() => calibracao.id, { onDelete: 'cascade' }),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    avaliacaoHumanaId: uuid('avaliacao_humana_id').references(() => avaliacao.id, {
      onDelete: 'set null',
    }),
    avaliacaoIaId: uuid('avaliacao_ia_id').references(() => avaliacao.id, {
      onDelete: 'set null',
    }),
    desvioTotal: numeric('desvio_total', { precision: 6, scale: 2 }),
    desvioPorCriterio: jsonb('desvio_por_criterio')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex('calibracao_item_uk').on(t.calibracaoId, t.conversaId)],
);

export const feedback = pgTable(
  'feedback',
  {
    id: id(),
    tenantId: refTenant(),
    avaliacaoId: uuid('avaliacao_id')
      .notNull()
      .references(() => avaliacao.id, { onDelete: 'cascade' }),
    deUsuarioId: uuid('de_usuario_id').references(() => usuario.id, { onDelete: 'set null' }),
    paraUsuarioId: uuid('para_usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    corpo: text('corpo').notNull(),
    lidoEm: momento('lido_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [index('feedback_para_idx').on(t.tenantId, t.paraUsuarioId, t.lidoEm)],
);

export const ESTADOS_PLANO_COACH = ['aberto', 'em_andamento', 'concluido', 'cancelado'] as const;

export const planoCoach = pgTable(
  'plano_coach',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    criterioId: uuid('criterio_id').references(() => criterio.id, { onDelete: 'set null' }),
    meta: text('meta').notNull(),
    prazo: date('prazo'),
    estado: text('estado').notNull().default('aberto'),
    criadoPor: uuid('criado_por').references(() => usuario.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [listaCheck('plano_coach_estado_ck', t.estado, ESTADOS_PLANO_COACH)],
);

export const SENTIMENTOS = ['positivo', 'neutro', 'negativo'] as const;

export const classificacaoConversa = pgTable(
  'classificacao_conversa',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    categoria: text('categoria'),
    subcategoria: text('subcategoria'),
    resumo: text('resumo'),
    intencao: text('intencao'),
    sentimento: text('sentimento'),
    confianca: numeric('confianca', { precision: 5, scale: 4 }),
    modelo: text('modelo'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('classificacao_conversa_sentimento_ck', t.sentimento, SENTIMENTOS),
    uniqueIndex('classificacao_conversa_uk').on(t.conversaId),
    index('classificacao_conversa_categoria_idx').on(t.tenantId, t.categoria, t.criadaEm),
  ],
);

/** Onde o gestor decide o que automatizar: volume, tendência e conversas de exemplo. */
export const insight = pgTable(
  'insight',
  {
    id: id(),
    tenantId: refTenant(),
    periodoInicio: date('periodo_inicio').notNull(),
    periodoFim: date('periodo_fim').notNull(),
    categoria: text('categoria').notNull(),
    volume: integer('volume').notNull().default(0),
    variacaoPct: numeric('variacao_pct', { precision: 8, scale: 2 }),
    candidataAutomacao: boolean('candidata_automacao').notNull().default(false),
    exemplos: uuid('exemplos')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...carimbos(),
  },
  (t) => [uniqueIndex('insight_uk').on(t.tenantId, t.periodoInicio, t.periodoFim, t.categoria)],
);

/** Sem isto o produto vende IA no prejuízo: é painel para o cliente e base de cobrança. */
export const consumoIa = pgTable(
  'consumo_ia',
  {
    id: id(),
    tenantId: refTenant(),
    funcionalidade: text('funcionalidade').notNull(),
    modelo: text('modelo').notNull(),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    custoCentavos: integer('custo_centavos').notNull().default(0),
    objetoTipo: text('objeto_tipo'),
    objetoId: uuid('objeto_id'),
    em: momento('em').notNull().defaultNow(),
  },
  (t) => [index('consumo_ia_periodo_idx').on(t.tenantId, t.funcionalidade, t.em)],
);

export const baseConhecimento = pgTable('base_conhecimento', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  ...carimbos(),
});

/**
 * Incremental e versionada: documentos independentes, cada trecho rastreável até o
 * documento e a versão. É o que faz a sugestão do copiloto poder citar a fonte.
 */
export const documentoConhecimento = pgTable(
  'documento_conhecimento',
  {
    id: id(),
    tenantId: refTenant(),
    baseId: uuid('base_id')
      .notNull()
      .references(() => baseConhecimento.id, { onDelete: 'cascade' }),
    titulo: text('titulo').notNull(),
    corpo: text('corpo').notNull(),
    versao: integer('versao').notNull().default(1),
    atualizadoEm: momento('atualizado_em'),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [index('documento_conhecimento_base_idx').on(t.tenantId, t.baseId, t.ativo)],
);

export const trechoConhecimento = pgTable(
  'trecho_conhecimento',
  {
    id: id(),
    tenantId: refTenant(),
    documentoId: uuid('documento_id')
      .notNull()
      .references(() => documentoConhecimento.id, { onDelete: 'cascade' }),
    texto: text('texto').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [index('trecho_conhecimento_documento_idx').on(t.tenantId, t.documentoId, t.ordem)],
);
