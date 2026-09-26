import { COMPARISONS, ValidationError, ehUnaria, validateCondition } from '@pipe/core';
import type { Comparison, ConditionBlip } from '@pipe/core';
import type { Block, SaidaDoEditor } from './model';
import { LIMITE_DE_SAIDAS, MESSAGES, gerarId, withoutDestination } from './model';

/**
 * Block-exit and action conditions use engine vocabulary (`packages/core/src/fluxo/condicao.ts`) and literal Blip Exit conditions tab labels (`builder-tabs-outputs`, pt-BR `sources`, `comparisons`, `and`/`or`). Offer only supported `input` and `context` sources, 13 `COMPARACOES` in enum order, and `or`/`and` among values. Blip `intent`/`entity` lack a Pipe AI provider: show an imported condition with a warning but do not offer creation. Exit order is evaluation order; the engine takes the first match (`FlowManager.ProcessOutputsAsync` ported in `gerenciador.ts`), then default. Provide up/down controls.
 */

export const FONTES_DA_TELA = [
  { valor: 'input', rotulo: 'Resposta do usuário' },
  { valor: 'context', rotulo: 'Variável' },
] as const;

/** Label any source, including ones the screen does not offer. */
export const ROTULO_DA_FONTE: Record<string, string> = {
  input: 'Resposta do usuário',
  context: 'Variável',
  intent: 'Intenção identificada',
  entity: 'Entidade identificada',
};

export const LABEL_OF_COMPARISON: Record<Comparison, string> = {
  equals: 'Igual a',
  notEquals: 'Diferente de',
  contains: 'Contém',
  startsWith: 'Começa com',
  endsWith: 'Termina com',
  greaterThan: 'Maior que',
  lessThan: 'Menor que',
  greaterThanOrEquals: 'Maior ou igual a',
  lessThanOrEquals: 'Menor ou igual a',
  matches: 'Corresponde à regex',
  approximateTo: 'Parecido com',
  exists: 'Existe',
  notExists: 'Não existe',
};

export const COMPARISONS_OF_SCREEN = COMPARISONS.map((value) => ({
  value,
  rotulo: LABEL_OF_COMPARISON[value],
}));

export const OPERADORES_DA_TELA = [
  { valor: 'or', rotulo: 'OU' },
  { valor: 'and', rotulo: 'E' },
] as const;

export const ROTULOS_DAS_SAIDAS = {
  titulo: 'Condições de saída',
  info: 'Defina as regras e o bloco para o qual o usuário será direcionado',
  se: 'Se',
  condicao: 'Condição',
  irPara: 'Ir para',
  valores: 'Valores',
  nomeDaVariavel: 'Nome da variável',
  adicionar: '+ Adicionar condição de saída',
  saidaPadrao: 'Saída padrão',
  saidaPadraoInfo:
    'Defina para qual bloco o usuário será direcionado se nenhuma das condições forem cumpridas',
  saidasDeAtendimento: 'Saídas de atendimento',
  semSeta: 'A seta que liga os blocos não será exibida',
  direcionar: 'Direcionar para bloco',
  naoPreenchida: 'Definição de saída não preenchida',
} as const;

/** Read comparison as the engine does: case-insensitively, defaulting to `equals`. */
export function comparisonOf(c: ConditionBlip): Comparison {
  const bruta = (c.comparison ?? 'equals').toLowerCase();
  return COMPARISONS.find((x) => x.toLowerCase() === bruta) ?? 'equals';
}

export const fonteDe = (c: ConditionBlip): string => (c.source ?? 'input').toLowerCase();

/** New condition defaults to user response equals, matching the engine. */
export function newCondition(): ConditionBlip {
  return { source: 'input', comparison: 'equals', values: [] };
}

/** Changing comparison clears values when that comparison no longer needs them. */
export function withComparison(c: ConditionBlip, comparison: Comparison): ConditionBlip {
  return ehUnaria(comparison)
    ? { ...c, comparison: comparison, values: [] }
    : { ...c, comparison: comparison, values: c.values ?? [] };
}

/** Changing the source clears a variable name that no longer applies. */
export function comFonte(c: ConditionBlip, fonte: string): ConditionBlip {
  const resto: ConditionBlip = { ...c, source: fonte };
  delete resto.variable;
  delete resto.entity;
  if (fonte === 'context') resto.variable = c.variable ?? '';
  return resto;
}

/** Add one value on Enter; ignore duplicates and blanks. */
export function addValue(c: ConditionBlip, value: string): ConditionBlip {
  const texto = value.trim();
  const current = c.values ?? [];
  if (!texto || current.includes(texto)) return c;
  return { ...c, values: [...current, texto] };
}

export function removeValue(c: ConditionBlip, indice: number): ConditionBlip {
  const current = c.values ?? [];
  return { ...c, values: current.filter((_, i) => i !== indice) };
}

/** Return `validarCondicao` engine wording or nothing when valid. */
export function conditionError(c: ConditionBlip): string | null {
  try {
    validateCondition(c);
    return null;
  } catch (error) {
    if (error instanceof ValidationError) return error.message;
    throw error;
  }
}

/** Pipe's engine has no AI provider, so intent and entity conditions can never match. */
export const fonteSemSuporte = (c: ConditionBlip): boolean => {
  const fonte = fonteDe(c);
  return fonte === 'intent' || fonte === 'entity';
};



/** Add an exit with no destination and one empty condition. */
export function novaSaida(id = gerarId()): SaidaDoEditor {
  return { $id: id, typeOfStateId: 'state', conditions: [newCondition()], $invalid: false };
}

export type ResultadoDeSaida = { ok: true; block: Block } | { ok: false; error: string };

export function adicionarSaida(block: Block, saida = novaSaida()): ResultadoDeSaida {
  const saidas = block.$conditionOutputs ?? [];
  if (saidas.length >= LIMITE_DE_SAIDAS) return { ok: false, error: MESSAGES.limiteDeSaidas };
  return { ok: true, block: { ...block, $conditionOutputs: [...saidas, saida] } };
}

export function removerSaida(block: Block, indice: number): Block {
  const saidas = block.$conditionOutputs ?? [];
  return { ...block, $conditionOutputs: saidas.filter((_, i) => i !== indice) };
}

/** Move an exit up/down in evaluation order; out-of-range positions do nothing. */
export function moverSaida(block: Block, de: number, para: number): Block {
  const saidas = [...(block.$conditionOutputs ?? [])];
  if (de < 0 || de >= saidas.length || para < 0 || para >= saidas.length || de === para) return block;
  const [saida] = saidas.splice(de, 1);
  saidas.splice(para, 0, saida!);
  return { ...block, $conditionOutputs: saidas };
}

export function outputSetDestination(block: Block, indice: number, destination: string): Block {
  const saidas = (block.$conditionOutputs ?? []).map((s, i) => {
    if (i !== indice) return s;
    if (!destination) return withoutDestination(s);
    return { ...s, stateId: destination, typeOfStateId: s.typeOfStateId ?? 'state' };
  });
  return { ...block, $conditionOutputs: saidas };
}

export function outputSetConditions(block: Block, indice: number, conditions: ConditionBlip[]): Block {
  const saidas = (block.$conditionOutputs ?? []).map((s, i) =>
    i === indice ? { ...s, conditions: conditions } : s,
  );
  return { ...block, $conditionOutputs: saidas };
}

export function definirSaidaPadrao(block: Block, destination: string): Block {
  return { ...block, $defaultOutput: destination ? { stateId: destination, $invalid: false } : null };
}

/** Show exit errors using panel wording. */
export function outputErrors(saida: SaidaDoEditor, existe: (id: string) => boolean): string[] {
  const errors: string[] = [];
  if (!saida.stateId && !saida.$isDeskOutput) errors.push(ROTULOS_DAS_SAIDAS.naoPreenchida);
  if (saida.stateId && !existe(saida.stateId) && !/^{{.*}}$/.test(saida.stateId)) {
    errors.push(`O estado de destino '${saida.stateId}' da saída não existe.`);
  }
  for (const c of saida.conditions ?? []) {
    const error = conditionError(c);
    if (error && !errors.includes(error)) errors.push(error);
  }
  return errors;
}
