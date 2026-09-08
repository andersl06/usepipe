import { NIVEIS_ATRIBUIVEIS } from '@pipe/core/conversa';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  TIPOS_DIMENSAO,
  TIPOS_EVENTO_ATENDIMENTO,
  carimbos,
  id,
  listaCheck,
  momento,
} from './comum.js';
import { refTenant, usuario } from './identidade.js';
import { conversa, fila } from './conversas.js';

/**
 * Módulo 4 — Gestão. Toda métrica é derivada de `evento_atendimento`, nunca de campo
 * mutável da conversa: é isso que permite recalcular o passado quando a definição de
 * uma métrica muda.
 */

/**
 * Imutável e particionada por mês em `em`. A chave primária carrega a chave de
 * partição, como em `mensagem`.
 */
export const eventoAtendimento = pgTable(
  'evento_atendimento',
  {
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    em: momento('em').notNull().defaultNow(),
    usuarioId: uuid('usuario_id').references(() => usuario.id, { onDelete: 'set null' }),
    filaId: uuid('fila_id').references(() => fila.id, { onDelete: 'set null' }),
    dados: jsonb('dados')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.em] }),
    listaCheck('evento_atendimento_tipo_ck', t.tipo, TIPOS_EVENTO_ATENDIMENTO),
    index('evento_atendimento_conversa_idx').on(t.tenantId, t.conversaId, t.em),
    index('evento_atendimento_tipo_idx').on(t.tenantId, t.tipo, t.em),
  ],
);

export const metricaDiaria = pgTable(
  'metrica_diaria',
  {
    id: id(),
    tenantId: refTenant(),
    dia: date('dia').notNull(),
    dimensaoTipo: text('dimensao_tipo').notNull(),
    dimensaoId: uuid('dimensao_id'),
    conversasCriadas: integer('conversas_criadas').notNull().default(0),
    conversasEncerradas: integer('conversas_encerradas').notNull().default(0),
    conversasPerdidas: integer('conversas_perdidas').notNull().default(0),
    conversasAbandonadas: integer('conversas_abandonadas').notNull().default(0),
    mensagensEntrada: integer('mensagens_entrada').notNull().default(0),
    mensagensSaida: integer('mensagens_saida').notNull().default(0),
    /** Somas em segundos; a média é a soma dividida pela contagem, na hora de exibir. */
    esperaFilaSeg: integer('espera_fila_seg').notNull().default(0),
    esperaFilaN: integer('espera_fila_n').notNull().default(0),
    primeiraRespostaSeg: integer('primeira_resposta_seg').notNull().default(0),
    primeiraRespostaN: integer('primeira_resposta_n').notNull().default(0),
    atendimentoSeg: integer('atendimento_seg').notNull().default(0),
    atendimentoN: integer('atendimento_n').notNull().default(0),
    slaCumpridos: integer('sla_cumpridos').notNull().default(0),
    slaEstourados: integer('sla_estourados').notNull().default(0),
    ...carimbos(),
  },
  (t) => [
    listaCheck('metrica_diaria_dimensao_tipo_ck', t.dimensaoTipo, TIPOS_DIMENSAO),
    uniqueIndex('metrica_diaria_uk').on(t.tenantId, t.dia, t.dimensaoTipo, t.dimensaoId),
  ],
);

/**
 * Régua determinística de esforço (§4.4 da spec): 200 char/min escrito, 1.000 char/min
 * lido, áudio em 1×. `chars_de_resposta_pronta` é o desconto do texto que o atendente
 * não digitou — sem ele, template e resposta pronta inflam o esforço.
 */
export const esforcoConversa = pgTable(
  'esforco_conversa',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    atendenteId: uuid('atendente_id').references(() => usuario.id, { onDelete: 'set null' }),
    charsEscritos: integer('chars_escritos').notNull().default(0),
    charsLidos: integer('chars_lidos').notNull().default(0),
    audioOuvidoSeg: integer('audio_ouvido_seg').notNull().default(0),
    audioGravadoSeg: integer('audio_gravado_seg').notNull().default(0),
    charsDeRespostaPronta: integer('chars_de_resposta_pronta').notNull().default(0),
    esforcoSeg: integer('esforco_seg').notNull().default(0),
    pausadoSeg: integer('pausado_seg').notNull().default(0),
    calculadoEm: momento('calculado_em').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('esforco_conversa_uk').on(t.conversaId, t.atendenteId)],
);

export const esforcoAtendenteDia = pgTable(
  'esforco_atendente_dia',
  {
    id: id(),
    tenantId: refTenant(),
    dia: date('dia').notNull(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    esforcoSeg: integer('esforco_seg').notNull().default(0),
    tickets: integer('tickets').notNull().default(0),
    sessaoSeg: integer('sessao_seg').notNull().default(0),
    ocupacao: numeric('ocupacao', { precision: 5, scale: 4 }),
    ...carimbos(),
  },
  (t) => [uniqueIndex('esforco_atendente_dia_uk').on(t.tenantId, t.dia, t.usuarioId)],
);

export const COMBINADORES = ['e', 'ou'] as const;

export const regraFila = pgTable(
  'regra_fila',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull().default(0),
    combinador: text('combinador').notNull().default('e'),
    filaDestinoId: uuid('fila_destino_id')
      .notNull()
      .references(() => fila.id, { onDelete: 'cascade' }),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [
    listaCheck('regra_fila_combinador_ck', t.combinador, COMBINADORES),
    index('regra_fila_ordem_idx').on(t.tenantId, t.ativa, t.ordem),
  ],
);

export const regraFilaCondicao = pgTable(
  'regra_fila_condicao',
  {
    id: id(),
    tenantId: refTenant(),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regraFila.id, { onDelete: 'cascade' }),
    campo: text('campo').notNull(),
    operador: text('operador').notNull(),
    valor: text('valor'),
  },
  (t) => [index('regra_fila_condicao_regra_idx').on(t.regraId)],
);

export const ESCOPOS_REGRA = ['tenant', 'fila', 'inbox', 'equipe', 'etiqueta'] as const;

export const regraPrioridade = pgTable(
  'regra_prioridade',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    nivel: text('nivel').notNull(),
    escopoTipo: text('escopo_tipo').notNull().default('tenant'),
    escopoId: uuid('escopo_id'),
    condicao: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [
    listaCheck('regra_prioridade_nivel_ck', t.nivel, NIVEIS_ATRIBUIVEIS),
    listaCheck('regra_prioridade_escopo_tipo_ck', t.escopoTipo, ESCOPOS_REGRA),
  ],
);

export const ALVOS_SLA = ['primeira_resposta', 'resposta', 'resolucao', 'espera_fila'] as const;

export const regraSla = pgTable(
  'regra_sla',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    alvo: text('alvo').notNull(),
    prazoSeg: integer('prazo_seg').notNull(),
    alertaSeg: integer('alerta_seg'),
    escopoTipo: text('escopo_tipo').notNull().default('tenant'),
    escopoId: uuid('escopo_id'),
    acaoAlerta: jsonb('acao_alerta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    acaoEstouro: jsonb('acao_estouro')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [
    listaCheck('regra_sla_alvo_ck', t.alvo, ALVOS_SLA),
    listaCheck('regra_sla_escopo_tipo_ck', t.escopoTipo, ESCOPOS_REGRA),
  ],
);

export const ESTADOS_SLA = ['correndo', 'alertado', 'estourado', 'cumprido', 'cancelado'] as const;

export const slaConversa = pgTable(
  'sla_conversa',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regraSla.id, { onDelete: 'cascade' }),
    prazoEm: momento('prazo_em').notNull(),
    alertadoEm: momento('alertado_em'),
    estouradoEm: momento('estourado_em'),
    estado: text('estado').notNull().default('correndo'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('sla_conversa_estado_ck', t.estado, ESTADOS_SLA),
    uniqueIndex('sla_conversa_uk').on(t.conversaId, t.regraId),
    index('sla_conversa_prazo_idx').on(t.tenantId, t.estado, t.prazoEm),
  ],
);

export const horarioAtendimento = pgTable('horario_atendimento', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  fuso: text('fuso').notNull().default('America/Sao_Paulo'),
  ...carimbos(),
});

export const horarioFaixa = pgTable(
  'horario_faixa',
  {
    id: id(),
    tenantId: refTenant(),
    horarioId: uuid('horario_id')
      .notNull()
      .references(() => horarioAtendimento.id, { onDelete: 'cascade' }),
    /** 0 = domingo, seguindo `extract(dow)` do Postgres. */
    diaSemana: smallint('dia_semana').notNull(),
    inicio: time('inicio').notNull(),
    fim: time('fim').notNull(),
  },
  (t) => [index('horario_faixa_horario_idx').on(t.horarioId, t.diaSemana)],
);

export const horarioExcecao = pgTable(
  'horario_excecao',
  {
    id: id(),
    tenantId: refTenant(),
    horarioId: uuid('horario_id')
      .notNull()
      .references(() => horarioAtendimento.id, { onDelete: 'cascade' }),
    data: date('data').notNull(),
    fechado: boolean('fechado').notNull().default(true),
    inicio: time('inicio'),
    fim: time('fim'),
    motivo: text('motivo'),
  },
  (t) => [uniqueIndex('horario_excecao_uk').on(t.horarioId, t.data)],
);

export const TIPOS_PESQUISA = ['csat', 'nps'] as const;

export const pesquisa = pgTable(
  'pesquisa',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull(),
    escalaMin: smallint('escala_min').notNull(),
    escalaMax: smallint('escala_max').notNull(),
    pergunta: text('pergunta').notNull(),
    /** Quando disparar: `encerramento`, `primeira_resposta`, `manual`. */
    disparo: text('disparo').notNull().default('encerramento'),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [listaCheck('pesquisa_tipo_ck', t.tipo, TIPOS_PESQUISA)],
);

/**
 * Guarda a escala junto da nota de propósito: sem isso, um 4 de CSAT e um 4 de NPS
 * acabam somados no mesmo gráfico quando a empresa tem os dois modelos.
 */
export const respostaPesquisa = pgTable(
  'resposta_pesquisa',
  {
    id: id(),
    tenantId: refTenant(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversa.id, { onDelete: 'cascade' }),
    pesquisaId: uuid('pesquisa_id')
      .notNull()
      .references(() => pesquisa.id, { onDelete: 'cascade' }),
    nota: smallint('nota'),
    escalaMin: smallint('escala_min').notNull(),
    escalaMax: smallint('escala_max').notNull(),
    /** `promotor` | `neutro` | `detrator` para NPS; `satisfeito` | `insatisfeito` para CSAT. */
    classe: text('classe'),
    comentario: text('comentario'),
    respondidaEm: momento('respondida_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('resposta_pesquisa_uk').on(t.conversaId, t.pesquisaId),
    index('resposta_pesquisa_periodo_idx').on(t.tenantId, t.respondidaEm),
  ],
);
