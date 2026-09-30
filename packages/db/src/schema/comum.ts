import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { check, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Data-model §1 conventions live in one place. A change here prevents a second table from using a different timestamp convention.
 */

export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const criadoEm = () =>
  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const atualizadoEm = () => timestamp('atualizado_em', { withTimezone: true });

export const carimbos = () => ({ criadoEm: criadoEm(), atualizadoEm: atualizadoEm() });

/** Soft deletion only where history matters; otherwise delete the row. */
export const excluidoEm = () => timestamp('excluido_em', { withTimezone: true });

export const moment = (nome: string) => timestamp(nome, { withTimezone: true });

/** Money is never floating point; currency lives in a separate column. */
export const money = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/**
 * Use `text` plus `check` for enumerations, never native PostgreSQL `enum`: adding enum values can lock production migrations, and values will be added often.
 */
export function listaCheck(nome: string, column: AnyPgColumn, values: readonly string[]) {
  const literals = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return check(nome, sql.raw(`"${column.name}" in (${literals})`));
}

export const TYPES_CHANNEL = ['whatsapp_cloud', 'instagram', 'messenger', 'email', 'widget'] as const;
/** `com_bot`: with the channel's flow, before any handoff (no ticket yet); see `@pipe/core` `maquina.ts`. */
export const STATES_CONVERSATION = [
  'com_bot',
  'na_fila',
  'atribuida',
  'em_atendimento',
  'em_espera',
  'encerrada',
] as const;
export const STATES_DELIVERY = [
  'pendente',
  'enviando',
  'enviada',
  'entregue',
  'lida',
  'falhou',
] as const;
export const CATEGORIAS_COBRANCA = ['livre', 'utilidade', 'marketing', 'autenticacao'] as const;
export const CATEGORIAS_TEMPLATE = ['utilidade', 'marketing', 'autenticacao'] as const;
/*
 * Priority ordering lives in `@pipe/core/conversa`, not here. Importing this file brings `drizzle-orm/pg-core` and its driver into browser consumers. The agent app formerly kept a parallel weight map that diverged. Pure rules belong in the pure rules package; the schema imports them for constraints, never the reverse.
 */
export const TIPOS_DIMENSAO = ['fila', 'atendente', 'equipe', 'inbox', 'etiqueta'] as const;

/** Data-model §4 closed catalog for `evento_atendimento.tipo`. */
export const TYPES_EVENT_ATTENDANCE = [
  'criada',
  'enfileirada',
  'atribuida',
  'reatribuida',
  'transferida_fila',
  'primeira_resposta',
  'mensagem_entrada',
  'mensagem_saida',
  'espera_iniciada',
  'espera_encerrada',
  'sla_alertado',
  'sla_estourado',
  'encerrada',
  'reaberta',
  'avaliada',
  'pesquisa_respondida',
] as const;
