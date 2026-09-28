import { ehAttendance, type Mapa } from './model';
import { ordenarRegras, PREFIX_ATTRIBUTE, type OperadorDeRegra, type QueueRule } from '../../lib/rule-queue';

/**
 * Pure state and rules for the Builder's embedded queue panel (D-56 item 4, reverting D-15):
 * whether the pill's warning fires, the create-form validation, search filtering, and the
 * page/create/rules mode machine. Nothing here touches the network — `panel-queues.tsx` wires
 * these to `useRead`/`toggleQueue`/`saveQueue`.
 */

/** True when the flow has at least one attendance block (`desk:<uuid>`, `model.ts`'s `PREFIX_OF_ATTENDANCE`). */
export function hasAttendanceBlock(mapa: Mapa): boolean {
  return Object.keys(mapa).some(ehAttendance);
}

interface QueueForName {
  name: string;
}

/**
 * `'reservado'` is a sentinel, not display text: the caller shows it as the toast "Ops! Não é
 * possível criar fila com este nome." (source's reserved-name behavior) instead of a field
 * message, the same way the other two strings ARE the field message shown as-is.
 */
export type QueueNameError = 'Você precisa dar um nome para essa fila' | 'Já existe uma fila com esse nome.' | 'reservado';

export function queueNameError(nome: string, filas: QueueForName[]): QueueNameError | null {
  const trimmed = nome.trim();
  if (trimmed === '') return 'Você precisa dar um nome para essa fila';
  if (trimmed.toUpperCase() === 'DIRECT_TRANSFER') return 'reservado';
  const duplicada = filas.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (duplicada) return 'Já existe uma fila com esse nome.';
  return null;
}

/** Name match, accent-sensitive but case-insensitive (Blip's queue search has no accent folding). */
export function filterQueues<T extends { name: string }>(filas: T[], termo: string): T[] {
  const t = termo.trim().toLowerCase();
  if (t === '') return filas;
  return filas.filter((f) => f.name.toLowerCase().includes(t));
}

export interface QueuesPage<T> {
  visiveis: T[];
  total: number;
  temMais: boolean;
}

const POR_PAGINA = 100;

/** `paginas` is how many pages of 100 are currently shown, starting at 1; "Carregar mais" increments it. */
export function pageQueues<T>(filas: T[], paginas: number): QueuesPage<T> {
  const limite = Math.max(1, paginas) * POR_PAGINA;
  const visiveis = filas.slice(0, limite);
  return { visiveis, total: filas.length, temMais: visiveis.length < filas.length };
}

/** The rules that belong to one queue, in evaluation order — same order `ordenarRegras` gives the engine. */
export function queueRules<T extends QueueRule>(regras: readonly T[], filaId: string): T[] {
  return ordenarRegras(regras.filter((r) => r.queueDestinationId === filaId));
}

export type RenameBlockReason = 'atendentes' | 'regras' | 'permissao';

/**
 * The queue-rules header's pencil only opens the rename field when nothing depends on the queue's
 * identity yet: no agents linked, no rules pointing at it, and the caller can write. Priority
 * (atendentes > regras > permissao) matches the source's toast copy — an agent-having queue keeps
 * the "atendentes" message even if it also has rules.
 */
export function renameBlockReason(
  fila: { agents: readonly unknown[] },
  qtdRegras: number,
  podeGravar: boolean,
): RenameBlockReason | null {
  if (fila.agents.length > 0) return 'atendentes';
  if (qtdRegras > 0) return 'regras';
  if (!podeGravar) return 'permissao';
  return null;
}

/** `minLengthField` from the source's dictionary (`T:...minLengthField`, {0}=3), the generic field validation it reuses for this input. */
const NOME_CURTO = 'Esse campo deve ter no mínimo 3 caracteres.';

export type QueueRenameError = typeof NOME_CURTO | QueueNameError;

/** Same rules as `queueNameError`, plus the rename field's own minimum length. */
export function queueRenameError(nome: string, outrasFilas: QueueForName[]): QueueRenameError | null {
  if (nome.trim().length < 3) return NOME_CURTO;
  return queueNameError(nome, outrasFilas);
}

export type QueuesPanelMode = { modo: 'lista' } | { modo: 'criar' } | { modo: 'regras'; id: string };

export type QueuesPanelAction =
  | { tipo: 'abrirCriar' }
  | { tipo: 'criada'; id: string }
  | { tipo: 'editar'; id: string }
  | { tipo: 'voltar' };

export function queuesPanelReducer(state: QueuesPanelMode, action: QueuesPanelAction): QueuesPanelMode {
  switch (action.tipo) {
    case 'abrirCriar':
      return { modo: 'criar' };
    case 'criada':
      return { modo: 'regras', id: action.id };
    case 'editar':
      return { modo: 'regras', id: action.id };
    case 'voltar':
      return { modo: 'lista' };
    default:
      return state;
  }
}

/*
 * Inline rule card (reference `builder-attendance-rules` / `new-rule-item`). The screen speaks the
 * reference's vocabulary (`Message`, `Contains`, one chips field per condition); the rules API
 * stores one value per condition plus one E/OU combiner per rule. The helpers below translate
 * between the two without changing what the engine evaluates.
 */

export const RULE_SOURCES = [
  { value: 'Message', rotulo: 'Mensagem', field: 'mensagem' },
  { value: 'Contact.Name', rotulo: 'Nome Contato', field: 'contato.nome' },
  { value: 'Contact.Email', rotulo: 'Email Contato', field: 'contato.email' },
  { value: 'Contact.Extras', rotulo: 'Extras Contato', field: PREFIX_ATTRIBUTE },
] as const;

export const RULE_COMPARISONS = [
  { value: 'Contains', rotulo: 'Contém', operator: 'contem' },
  { value: 'NotContains', rotulo: 'Não contém', operator: 'nao_contem' },
  { value: 'Equals', rotulo: 'É igual', operator: 'igual' },
  { value: 'NotEquals', rotulo: 'Não é igual', operator: 'diferente' },
] as const satisfies readonly { value: string; rotulo: string; operator: OperadorDeRegra }[];

export type RuleComparison = (typeof RULE_COMPARISONS)[number]['value'];

export interface RuleDraftCondition {
  /** A `RULE_SOURCES` value, or the raw API field when the rule came from a field the card has no option for (e.g. `contato.telefone`). */
  source: string;
  /** Key after `contato.atributos.` when `source` is `Contact.Extras`. */
  extraKey: string;
  comparison: RuleComparison;
  values: string[];
}

export interface RuleDraft {
  name: string;
  /** Kept from the stored rule so an edit never flips E/OU behind the user's back. */
  combiner: 'e' | 'ou';
  conditions: RuleDraftCondition[];
}

export function newRuleCondition(): RuleDraftCondition {
  return { source: 'Message', extraKey: '', comparison: 'Contains', values: [] };
}

/** "Regra N" with N one past the rule count, skipping names already taken. */
export function nextRuleName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  let n = existing.length + 1;
  while (taken.has(`regra ${n}`)) n += 1;
  return `Regra ${n}`;
}

export function newRuleDraft(existing: readonly { name: string }[]): RuleDraft {
  return { name: nextRuleName(existing), combiner: 'e', conditions: [newRuleCondition()] };
}

function sourceOfField(field: string): Pick<RuleDraftCondition, 'source' | 'extraKey'> {
  const known = RULE_SOURCES.find((s) => s.value !== 'Contact.Extras' && s.field === field);
  if (known) return { source: known.value, extraKey: '' };
  if (field.startsWith(PREFIX_ATTRIBUTE)) {
    return { source: 'Contact.Extras', extraKey: field.slice(PREFIX_ATTRIBUTE.length) };
  }
  return { source: field, extraKey: '' };
}

function fieldOfCondition(c: RuleDraftCondition): string {
  if (c.source === 'Contact.Extras') return `${PREFIX_ATTRIBUTE}${c.extraKey.trim()}`;
  return RULE_SOURCES.find((s) => s.value === c.source)?.field ?? c.source;
}

function comparisonOfOperator(operator: OperadorDeRegra): RuleComparison {
  return RULE_COMPARISONS.find((c) => c.operator === operator)?.value ?? 'Contains';
}

function isNegated(comparison: RuleComparison): boolean {
  return comparison === 'NotContains' || comparison === 'NotEquals';
}

/**
 * Stored rule → card. An OU rule whose conditions all share field and operator is one condition
 * with many chips (how the card writes it back); anything else is one condition per stored row.
 */
export function ruleToDraft(rule: QueueRule): RuleDraft {
  const rows = rule.conditions;
  const first = rows[0];
  const oneGroup =
    rule.combiner === 'ou' &&
    first !== undefined &&
    rows.every((r) => r.field === first.field && r.operator === first.operator);
  const groups = oneGroup ? [rows] : rows.map((r) => [r]);
  return {
    name: rule.name,
    combiner: rule.combiner,
    conditions: groups.map((g) => ({
      ...sourceOfField(g[0]!.field),
      comparison: comparisonOfOperator(g[0]!.operator),
      values: g.map((r) => r.value),
    })),
  };
}

export interface RuleApiPayload {
  combiner: 'e' | 'ou';
  conditions: { campo: string; operador: OperadorDeRegra; value: string }[];
}

/**
 * Card → API rows, or `null` when the card can't be stored as-is. Several chips on one condition
 * mean "any of them" for Contém/É igual (needs OU) and "none of them" for the negated ones (needs
 * E); one combiner per rule holds that only when every multi-chip condition asks for the same
 * one, and with more than one condition it must also be the rule's combiner.
 */
export function draftToApi(draft: RuleDraft): RuleApiPayload | null {
  const needed = new Set(
    draft.conditions
      .filter((c) => c.values.length > 1)
      .map((c): 'e' | 'ou' => (isNegated(c.comparison) ? 'e' : 'ou')),
  );
  if (needed.size > 1) return null;
  const [required] = [...needed];
  let combiner = draft.combiner;
  if (required && required !== combiner) {
    if (draft.conditions.length > 1) return null;
    combiner = required;
  }
  return {
    combiner,
    conditions: draft.conditions.flatMap((c) => {
      const operador = RULE_COMPARISONS.find((x) => x.value === c.comparison)?.operator ?? 'contem';
      const campo = fieldOfCondition(c);
      return c.values.map((value) => ({ campo, operador, value }));
    }),
  };
}

/** Required-field flags the card shows; `confirmDisabled` also covers a card the API can't store. */
export function ruleDraftState(draft: RuleDraft): {
  nameMissing: boolean;
  valuesMissing: boolean[];
  extraKeyMissing: boolean[];
  confirmDisabled: boolean;
} {
  const nameMissing = draft.name.trim() === '';
  const valuesMissing = draft.conditions.map((c) => c.values.length === 0);
  const extraKeyMissing = draft.conditions.map(
    (c) => c.source === 'Contact.Extras' && !/^[A-Za-z0-9_]+$/.test(c.extraKey.trim()),
  );
  const confirmDisabled =
    nameMissing ||
    draft.conditions.length === 0 ||
    valuesMissing.some(Boolean) ||
    extraKeyMissing.some(Boolean) ||
    draftToApi(draft) === null;
  return { nameMissing, valuesMissing, extraKeyMissing, confirmDisabled };
}
