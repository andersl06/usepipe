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
import { carimbos, dinheiro, id, listaCheck, momento } from './comum.js';
import { refTenant, usuario } from './identidade.js';
import { contato, conversa, fila } from './conversas.js';

/**
 * Módulo 2 — CRM. As duas decisões que sustentam o módulo: pergunta de formulário é
 * linha e não coluna (o Lead do Salesforce de hoje tem 353 campos, 304 customizados),
 * e o score se explica — cada cálculo é uma linha nova, não uma sobrescrita.
 */

export const conta = pgTable(
  'conta',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    /** CPF/CNPJ em `text`: o CNPJ alfanumérico de 2026 quebra coluna numérica e máscara fixa. */
    documento: text('documento'),
    dominio: text('dominio'),
    atributos: jsonb('atributos')
      .notNull()
      .default(sql`'{}'::jsonb`),
    proprietarioId: uuid('proprietario_id').references(() => usuario.id, { onDelete: 'set null' }),
    excluidoEm: momento('excluido_em'),
    /** O `id` da `company` correspondente no Twenty. Ver `contato.twenty_pessoa_id`. */
    twentyEmpresaId: text('twenty_empresa_id'),
    ...carimbos(),
  },
  (t) => [
    index('conta_tenant_documento_idx').on(t.tenantId, t.documento),
    index('conta_tenant_nome_idx').on(t.tenantId, t.nome),
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
    contatoId: uuid('contato_id').references(() => contato.id, { onDelete: 'set null' }),
    contaId: uuid('conta_id').references(() => conta.id, { onDelete: 'set null' }),
    origem: text('origem'),
    campanha: text('campanha'),
    utm: jsonb('utm')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('novo'),
    fase: text('fase'),
    faseDesde: momento('fase_desde'),
    proprietarioId: uuid('proprietario_id').references(() => usuario.id, { onDelete: 'set null' }),
    /** Denormalizados de `score_lead` porque são os dois campos filtrados o tempo todo. */
    scoreAtual: integer('score_atual'),
    faixaAtual: text('faixa_atual'),
    desqualificadoEm: momento('desqualificado_em'),
    motivoDesqualificacaoId: uuid('motivo_desqualificacao_id'),
    /** Campo customizado por tenant vive aqui, com índice GIN — nunca `alter table` em runtime. */
    customizados: jsonb('customizados')
      .notNull()
      .default(sql`'{}'::jsonb`),
    excluidoEm: momento('excluido_em'),
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
    nome: text('nome').notNull(),
    slug: text('slug').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_tenant_slug_uk').on(t.tenantId, t.slug)],
);

export const formularioVersao = pgTable(
  'formulario_versao',
  {
    id: id(),
    tenantId: refTenant(),
    formularioId: uuid('formulario_id')
      .notNull()
      .references(() => formulario.id, { onDelete: 'cascade' }),
    versao: integer('versao').notNull(),
    publicadaEm: momento('publicada_em'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_versao_uk').on(t.formularioId, t.versao)],
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
    codigo: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    tipo: text('tipo').notNull(),
    opcoes: jsonb('opcoes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    ordem: integer('ordem').notNull().default(0),
    obrigatoria: boolean('obrigatoria').notNull().default(false),
  },
  (t) => [
    listaCheck('formulario_pergunta_tipo_ck', t.tipo, TIPOS_PERGUNTA),
    uniqueIndex('formulario_pergunta_uk').on(t.versaoId, t.codigo),
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
    valorTexto: text('valor_texto'),
    valorNum: numeric('valor_num', { precision: 20, scale: 6 }),
    valorData: momento('valor_data'),
    valorBool: boolean('valor_bool'),
    valorJson: jsonb('valor_json'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
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
    versao: integer('versao').notNull(),
    nome: text('nome').notNull(),
    condicao: jsonb('condicao')
      .notNull()
      .default(sql`'{}'::jsonb`),
    pontos: integer('pontos').notNull(),
    ativa: boolean('ativa').notNull().default(true),
    ...carimbos(),
  },
  (t) => [index('regra_score_versao_idx').on(t.tenantId, t.versao, t.ativa)],
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
    valor: integer('valor').notNull(),
    faixa: text('faixa'),
    explicacao: jsonb('explicacao')
      .notNull()
      .default(sql`'[]'::jsonb`),
    calculadoEm: momento('calculado_em').notNull().defaultNow(),
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
    versao: integer('versao').notNull(),
    nome: text('nome').notNull(),
    minimo: integer('minimo').notNull(),
    maximo: integer('maximo').notNull(),
    filaId: uuid('fila_id').references(() => fila.id, { onDelete: 'set null' }),
    estrategiaProprietario: text('estrategia_proprietario').notNull().default('nenhuma'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('faixa_score_estrategia_ck', t.estrategiaProprietario, ESTRATEGIAS_PROPRIETARIO),
    uniqueIndex('faixa_score_uk').on(t.tenantId, t.versao, t.nome),
  ],
);

export const oportunidade = pgTable(
  'oportunidade',
  {
    id: id(),
    tenantId: refTenant(),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'set null' }),
    contaId: uuid('conta_id').references(() => conta.id, { onDelete: 'set null' }),
    nome: text('nome').notNull(),
    valor: dinheiro('valor'),
    moeda: text('moeda').notNull().default('BRL'),
    fase: text('fase').notNull(),
    probabilidade: smallint('probabilidade'),
    fechamentoPrevisto: date('fechamento_previsto'),
    fechadaEm: momento('fechada_em'),
    ganha: boolean('ganha'),
    motivoPerda: text('motivo_perda'),
    proprietarioId: uuid('proprietario_id').references(() => usuario.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    index('oportunidade_tenant_fase_idx').on(t.tenantId, t.fase),
    index('oportunidade_tenant_fechamento_idx').on(t.tenantId, t.fechamentoPrevisto),
  ],
);

export const TIPOS_ATIVIDADE = [
  'nota',
  'ligacao',
  'reuniao',
  'email',
  'conversa',
  'tarefa',
  'mudanca_fase',
] as const;

export const atividade = pgTable(
  'atividade',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull(),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'cascade' }),
    contaId: uuid('conta_id').references(() => conta.id, { onDelete: 'cascade' }),
    conversaId: uuid('conversa_id').references(() => conversa.id, { onDelete: 'set null' }),
    usuarioId: uuid('usuario_id').references(() => usuario.id, { onDelete: 'set null' }),
    resumo: text('resumo'),
    corpo: text('corpo'),
    ocorridaEm: momento('ocorrida_em').notNull().defaultNow(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('atividade_tipo_ck', t.tipo, TIPOS_ATIVIDADE),
    index('atividade_lead_idx').on(t.tenantId, t.leadId, t.ocorridaEm.desc()),
    index('atividade_conta_idx').on(t.tenantId, t.contaId, t.ocorridaEm.desc()),
  ],
);

export const ORIGENS_IMPORTACAO = ['salesforce', 'hubspot', 'rd_station', 'csv'] as const;
export const ESTADOS_IMPORTACAO = [
  'rascunho',
  'validando',
  'pronta',
  'executando',
  'concluida',
  'falhou',
] as const;

export const importacao = pgTable(
  'importacao',
  {
    id: id(),
    tenantId: refTenant(),
    origem: text('origem').notNull(),
    arquivo: text('arquivo'),
    mapeamento: jsonb('mapeamento')
      .notNull()
      .default(sql`'{}'::jsonb`),
    estado: text('estado').notNull().default('rascunho'),
    total: integer('total').notNull().default(0),
    aceitos: integer('aceitos').notNull().default(0),
    rejeitados: integer('rejeitados').notNull().default(0),
    /** Chave no storage do relatório de linhas rejeitadas. */
    chaveRelatorio: text('chave_relatorio'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('importacao_origem_ck', t.origem, ORIGENS_IMPORTACAO),
    listaCheck('importacao_estado_ck', t.estado, ESTADOS_IMPORTACAO),
  ],
);

export const OBJETOS_CUSTOMIZAVEIS = ['lead', 'conta', 'contato', 'oportunidade'] as const;

export const campoCustomizado = pgTable(
  'campo_customizado',
  {
    id: id(),
    tenantId: refTenant(),
    objeto: text('objeto').notNull(),
    codigo: text('codigo').notNull(),
    rotulo: text('rotulo').notNull(),
    tipo: text('tipo').notNull(),
    opcoes: jsonb('opcoes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...carimbos(),
  },
  (t) => [
    listaCheck('campo_customizado_objeto_ck', t.objeto, OBJETOS_CUSTOMIZAVEIS),
    listaCheck('campo_customizado_tipo_ck', t.tipo, TIPOS_PERGUNTA),
    uniqueIndex('campo_customizado_uk').on(t.tenantId, t.objeto, t.codigo),
  ],
);
