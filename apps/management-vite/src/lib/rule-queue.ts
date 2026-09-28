import { avaliarExpressao, type Condition, type Expressao } from '@pipe/core';

/**
 * A regra de entrada — §8 da spec de métricas.
 *
 * Decide em que fila a conversa cai quando ela chega. Duas coisas que a
 * documentação da Blip não resolve e a nossa spec define explicitamente, e que
 * são a razão deste arquivo existir separado da tela:
 *
 *   1. **Ordem de avaliação.** As regras são ordenadas, avaliadas de cima para
 *      baixo, e a PRIMEIRA que casa vence. Sem ordem, ninguém consegue prever o
 *      que acontece quando duas regras casam ao mesmo tempo.
 *   2. **Composição.** Cada regra combina as suas condições com E ou OU,
 *      escolhido pelo usuário. É o que a tela mostra em texto, e é o que esta
 *      função obedece.
 *
 * Sem nenhuma regra casada, a conversa cai na fila padrão da caixa de entrada —
 * quem decide isso é `inbox.fila_padrao_id`, não este módulo.
 *
 * Módulo PURO de propósito: nada de drizzle aqui. É ele que o formulário
 * (`'use client'`) importa para os rótulos de campo e operador, e um import de
 * `@pipe/db` arrastaria o `pg` para dentro do pacote do navegador.
 *
 * A avaliação em si é do `@pipe/core` (`score/motor.ts`): os mesmos operadores,
 * a mesma normalização sem acento e sem caixa, o mesmo caminho por ponto. Uma
 * segunda implementação de "contém" é uma segunda definição de "contém".
 */

/** Os quatro operadores da §8. O core tem doze; a regra de fila usa estes. */
export const OPERADORES_DE_REGRA = ['contem', 'nao_contem', 'igual', 'diferente'] as const;
export type OperadorDeRegra = (typeof OPERADORES_DE_REGRA)[number];

export const ROTULO_OPERADOR: Record<OperadorDeRegra, string> = {
  contem: 'contém',
  nao_contem: 'não contém',
  igual: 'é igual a',
  diferente: 'é diferente de',
};

/**
 * Os campos sobre os quais a condição fala. `message` é o conteúdo da primeira
 * mensagem do cliente; o resto sai do contato.
 *
 * `contato.atributos.` é PREFIXO, não campo: o que vem depois é a chave do
 * campo extra, que cada tenant nomeia como quiser (`contato.atributos.plano`).
 */
export const PREFIX_ATTRIBUTE = 'contato.atributos.';

export const CAMPOS_DE_REGRA = [
  'mensagem',
  'contato.nome',
  'contato.email',
  'contato.telefone',
] as const;

export const ROTULO_CAMPO: Record<string, string> = {
  mensagem: 'Conteúdo da mensagem',
  'contato.nome': 'Nome do contato',
  'contato.email': 'E-mail do contato',
  'contato.telefone': 'Telefone do contato',
};

/** Rótulo de qualquer campo, inclusive o extra que ninguém cadastrou em lista. */
export function rotuloDoCampo(campo: string): string {
  const conhecido = ROTULO_CAMPO[campo];
  if (conhecido) return conhecido;
  if (campo.startsWith(PREFIX_ATTRIBUTE)) {
    return `Campo extra “${campo.slice(PREFIX_ATTRIBUTE.length)}”`;
  }
  return campo;
}

export function operadorValido(bruto: string): bruto is OperadorDeRegra {
  return (OPERADORES_DE_REGRA as readonly string[]).includes(bruto);
}

/**
 * Campo aceito: um dos quatro fixos, ou um extra com chave não vazia.
 *
 * A validação existe porque campo livre digitado errado vira regra que nunca
 * casa — e regra que nunca casa não dá erro, só manda a conversa para a fila
 * errada em silêncio.
 */
export function campoValido(bruto: string): boolean {
  if ((CAMPOS_DE_REGRA as readonly string[]).includes(bruto)) return true;
  if (!bruto.startsWith(PREFIX_ATTRIBUTE)) return false;
  const key = bruto.slice(PREFIX_ATTRIBUTE.length);
  return /^[a-z0-9_]+$/i.test(key);
}

export interface RuleCondition {
  field: string;
  operator: OperadorDeRegra;
  value: string;
}

export interface QueueRule {
  id: string;
  name: string;
  order: number;
  combiner: 'e' | 'ou';
  queueDestinationId: string;
  queueDestinationName: string;
  active: boolean;
  conditions: readonly RuleCondition[];
}

/** O que a conversa recém-chegada oferece à regra. */
export interface ConversationContext {
  message?: string | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    atributos?: Readonly<Record<string, unknown>>;
  };
}

export interface Match {
  regraId: string;
  regraNome: string;
  queueDestinationId: string;
  queueDestinationName: string;
}

/**
 * Ordem de avaliação, estável e testável.
 *
 * Empate de `ordem` desempata por id — a mesma escolha da distribuição (§7):
 * sem o desempate, duas regras com ordem 0 são resolvidas pela ordem em que o
 * Postgres devolveu as linhas, que não é ordem nenhuma.
 */
export function ordenarRegras<T extends QueueRule>(regras: readonly T[]): T[] {
  return [...regras].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function expressao(regra: QueueRule): Expressao {
  return {
    combinador: regra.combiner,
    condicoes: regra.conditions.map((c): Condition => ({
      campo: c.field,
      operador: c.operator,
      valor: c.value,
    })),
  };
}

/**
 * A primeira regra ativa que casa. `null` quando nenhuma casa — e aí a conversa
 * segue para a fila padrão da caixa de entrada.
 *
 * Regra ativa SEM condição nenhuma nunca casa: `avaliarExpressao` devolve falso
 * para lista vazia, e é o comportamento certo. Uma regra vazia que casasse
 * sempre seria um capturador universal criado por engano, e ele engoliria toda
 * a fila abaixo dela sem ninguém entender por quê.
 */
export function destinationQueue(
  regras: readonly QueueRule[],
  context: ConversationContext,
): Match | null {
  const data = { mensagem: context.message, contato: context.contact };
  for (const regra of ordenarRegras(regras)) {
    if (!regra.active) continue;
    if (!avaliarExpressao(expressao(regra), data))
      continue;
    return {
      regraId: regra.id,
      regraNome: regra.name,
      queueDestinationId: regra.queueDestinationId,
      queueDestinationName: regra.queueDestinationName,
    };
  }
  return null;
}

/** A regra escrita por extenso, do jeito que a tela mostra no cartão. */
export function descreverRegra(regra: QueueRule): string {
  if (regra.conditions.length === 0) return 'Sem condição — nunca casa';
  const cola = regra.combiner === 'e' ? ' E ' : ' OU ';
  return regra.conditions
    .map((c) => `${rotuloDoCampo(c.field)} ${ROTULO_OPERADOR[c.operator]} “${c.value}”`)
    .join(cola);
}

/**
 * Regras que nunca vão ser alcançadas, por índice na ordem de avaliação.
 *
 * Duas causas, e as duas são erro de cadastro que a tela precisa apontar:
 * regra ativa sem condição (nunca casa) e regra colocada abaixo de outra
 * idêntica (a de cima vence sempre). Sem este aviso, o gestor cadastra a
 * segunda, testa, não funciona, e não tem como saber que o problema é a ordem.
 */
export function regrasInalcancaveis(regras: readonly QueueRule[]): string[] {
  const vistas = new Set<string>();
  const mortas: string[] = [];
  for (const regra of ordenarRegras(regras)) {
    if (!regra.active) continue;
    if (regra.conditions.length === 0) {
      mortas.push(regra.id);
      continue;
    }
    const assinatura = `${regra.combiner}|${regra.conditions
      .map((c) => `${c.field} ${c.operator} ${c.value.trim().toLowerCase()}`)
      .sort()
      .join('|')}`;
    if (vistas.has(assinatura)) mortas.push(regra.id);
    else vistas.add(assinatura);
  }
  return mortas;
}
