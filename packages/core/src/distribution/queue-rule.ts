import { avaliarExpressao, type Condition, type Expressao } from '../score/motor.js';

/**
 * Attendance (queue) rules — metrics spec §8, Blip's "regras de atendimento".
 *
 * Decides which queue a conversation lands in when it enters a queue without an explicit
 * destination. Rules are evaluated in `order` (ties broken by id) and the FIRST active rule that
 * matches wins; each rule combines its conditions with the E/OU the user stored. No match means
 * the caller's default queue (`inbox.fila_padrao_id`).
 *
 * Stored fields keep the Pipe vocabulary (`mensagem`, `contato.nome`, `contato.email`,
 * `contato.telefone`, `contato.atributos.<key>`), which the Builder card shows as Blip's
 * `Message`, `Contact.Name`, `Contact.Email`, `Contact.Extras.<prop>`; operators are
 * `contem`/`nao_contem`/`igual`/`diferente` (Blip `Contains`/`NotContains`/`Equals`/`NotEquals`).
 *
 * Pure and browser-safe: the management screens import the labels and validators from here, and
 * the api evaluates with the same function.
 */

/** The four §8 operators. The core evaluator knows more; queue rules use these. */
export const OPERADORES_DE_REGRA = ['contem', 'nao_contem', 'igual', 'diferente'] as const;
export type OperadorDeRegra = (typeof OPERADORES_DE_REGRA)[number];

export const ROTULO_OPERADOR: Record<OperadorDeRegra, string> = {
  contem: 'contém',
  nao_contem: 'não contém',
  igual: 'é igual a',
  diferente: 'é diferente de',
};

/** Prefix, not a field: what follows is the tenant-named extra key (`contato.atributos.plano`). */
export const PREFIX_ATTRIBUTE = 'contato.atributos.';

export const CAMPOS_DE_REGRA = ['mensagem', 'contato.nome', 'contato.email', 'contato.telefone'] as const;

export const ROTULO_CAMPO: Record<string, string> = {
  mensagem: 'Conteúdo da mensagem',
  'contato.nome': 'Nome do contato',
  'contato.email': 'E-mail do contato',
  'contato.telefone': 'Telefone do contato',
};

export function rotuloDoCampo(campo: string): string {
  const conhecido = ROTULO_CAMPO[campo];
  if (conhecido) return conhecido;
  if (campo.startsWith(PREFIX_ATTRIBUTE)) return `Campo extra “${campo.slice(PREFIX_ATTRIBUTE.length)}”`;
  return campo;
}

export function operadorValido(bruto: string): bruto is OperadorDeRegra {
  return (OPERADORES_DE_REGRA as readonly string[]).includes(bruto);
}

/** A mistyped free field would be a rule that silently never matches, so only known fields pass. */
export function campoValido(bruto: string): boolean {
  if ((CAMPOS_DE_REGRA as readonly string[]).includes(bruto)) return true;
  if (!bruto.startsWith(PREFIX_ATTRIBUTE)) return false;
  return /^[a-z0-9_]+$/i.test(bruto.slice(PREFIX_ATTRIBUTE.length));
}

export interface QueueRuleCondition {
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
  conditions: readonly QueueRuleCondition[];
}

/** What a conversation entering a queue offers the rules, in Blip `Contact` vocabulary. */
export interface QueueRuleContext {
  message?: string | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    extras?: Readonly<Record<string, unknown>> | null;
  } | null;
}

export interface QueueRuleMatch {
  regraId: string;
  regraNome: string;
  queueDestinationId: string;
  queueDestinationName: string;
}

/** The context under the stored field names (`mensagem`, `contato.*`) the evaluator reads by dotted path. */
export function queueRuleData(context: QueueRuleContext): Record<string, unknown> {
  const contact = context.contact ?? {};
  return {
    mensagem: context.message ?? null,
    contato: {
      nome: contact.name ?? null,
      email: contact.email ?? null,
      telefone: contact.phone ?? null,
      atributos: contact.extras ?? {},
    },
  };
}

/** Evaluation order: `order`, then id — never the order the database returned rows in. */
export function ordenarRegras<T extends QueueRule>(regras: readonly T[]): T[] {
  return [...regras].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function expressionOf(rule: QueueRule): Expressao {
  return {
    combinador: rule.combiner,
    condicoes: rule.conditions.map((c): Condition => ({ campo: c.field, operador: c.operator, valor: c.value })),
  };
}

/**
 * The first active rule that matches, or `null` (the conversation goes to the default queue).
 * An active rule with no condition never matches: an empty rule matching everything would be a
 * catch-all created by mistake, swallowing every rule below it.
 */
export function destinationQueue(rules: readonly QueueRule[], context: QueueRuleContext): QueueRuleMatch | null {
  const data = queueRuleData(context);
  for (const rule of ordenarRegras(rules)) {
    if (!rule.active || !avaliarExpressao(expressionOf(rule), data)) continue;
    return {
      regraId: rule.id,
      regraNome: rule.name,
      queueDestinationId: rule.queueDestinationId,
      queueDestinationName: rule.queueDestinationName,
    };
  }
  return null;
}

/** The rule spelled out the way the card shows it. */
export function descreverRegra(regra: QueueRule): string {
  if (regra.conditions.length === 0) return 'Sem condição — nunca casa';
  const cola = regra.combiner === 'e' ? ' E ' : ' OU ';
  return regra.conditions
    .map((c) => `${rotuloDoCampo(c.field)} ${ROTULO_OPERADOR[c.operator]} “${c.value}”`)
    .join(cola);
}

/**
 * Ids of rules that can never win: active with no condition, or identical to a rule above them.
 * Both are registration mistakes the screen must point out.
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
      .map((c) => `${c.field}\u0000${c.operator}\u0000${c.value.trim().toLowerCase()}`)
      .sort()
      .join('|')}`;
    if (vistas.has(assinatura)) mortas.push(regra.id);
    else vistas.add(assinatura);
  }
  return mortas;
}
