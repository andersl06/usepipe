import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { check, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Convenções da §1 do modelo de dados, num lugar só. Se uma delas mudar, muda aqui —
 * é o que impede a segunda tabela de nascer com um carimbo diferente da primeira.
 */

export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const criadoEm = () =>
  timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const atualizadoEm = () => timestamp('atualizado_em', { withTimezone: true });

export const carimbos = () => ({ criadoEm: criadoEm(), atualizadoEm: atualizadoEm() });

/** Exclusão lógica: só onde o histórico importa. No resto, exclusão real. */
export const excluidoEm = () => timestamp('excluido_em', { withTimezone: true });

export const momento = (nome: string) => timestamp(nome, { withTimezone: true });

/** Dinheiro nunca é ponto flutuante, e a moeda mora em coluna separada. */
export const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/**
 * Enumeração é `text` com `check`, nunca `enum` nativo: acrescentar valor num enum do
 * Postgres trava a migration em produção, e vamos acrescentar valor o tempo todo.
 */
export function listaCheck(nome: string, coluna: AnyPgColumn, valores: readonly string[]) {
  const literais = valores.map((valor) => `'${valor.replace(/'/g, "''")}'`).join(', ');
  return check(nome, sql.raw(`"${coluna.name}" in (${literais})`));
}

export const TIPOS_CANAL = ['whatsapp_cloud', 'instagram', 'email', 'widget'] as const;
export const ESTADOS_CONVERSA = [
  'na_fila',
  'atribuida',
  'em_atendimento',
  'em_espera',
  'encerrada',
] as const;
export const ESTADOS_ENTREGA = [
  'pendente',
  'enviando',
  'enviada',
  'entregue',
  'lida',
  'falhou',
] as const;
export const CATEGORIAS_COBRANCA = ['livre', 'utilidade', 'marketing', 'autenticacao'] as const;
export const CATEGORIAS_TEMPLATE = ['utilidade', 'marketing', 'autenticacao'] as const;
export const NIVEIS_PRIORIDADE = ['baixa', 'media', 'alta'] as const;
export const TIPOS_DIMENSAO = ['fila', 'atendente', 'equipe', 'inbox', 'etiqueta'] as const;

/** §4 do modelo de dados: catálogo fechado de `evento_atendimento.tipo`. */
export const TIPOS_EVENTO_ATENDIMENTO = [
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
