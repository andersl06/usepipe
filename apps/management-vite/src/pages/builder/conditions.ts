import { COMPARISONS, ValidationError, ehUnaria, validateCondition } from '@pipe/core';
import type { Comparison, ConditionBlip } from '@pipe/core';
import type { Block, SaidaDoEditor } from './model';
import { LIMITE_DE_SAIDAS, MESSAGES, gerarId, withoutDestination } from './model';

/**
 * As condições — das saídas do bloco e das ações — com o vocabulário do
 * motor (`packages/core/src/fluxo/condicao.ts`) e os rótulos literais da aba
 * "Condições de saída" do editor da Blip (`builder-tabs-outputs` no pacote de
 * tradução pt-BR: `sources`, `comparisons`, `and`/`or`).
 *
 * O que o motor entende, e só isso, entra no seletor: fonte `input`
 * ("Resposta do usuário") e `context` ("Variável"); as treze comparações de
 * `COMPARACOES`, na ordem do enum; o operador `or`/`and` entre os valores.
 * `intent` e `entity` existem no editor da Blip mas o Pipe não tem provedor
 * de IA — uma condição dessas carregada de um fluxo importado aparece como
 * está, com o aviso, e não se cria outra.
 *
 * A ordem das saídas é a ordem de avaliação: o motor toma a primeira que casa
 * (`FlowManager.ProcessOutputsAsync`, portado em `gerenciador.ts`), e a saída
 * padrão só depois de todas. Por isso a lista tem "subir/descer".
 */

export const FONTES_DA_TELA = [
  { valor: 'input', rotulo: 'Resposta do usuário' },
  { valor: 'context', rotulo: 'Variável' },
] as const;

/** Rótulo de qualquer fonte, inclusive as que a tela não oferece. */
export const ROTULO_DA_FONTE: Record<string, string> = {
  input: 'Resposta do usuário',
  context: 'Variável',
  intent: 'Intenção identificada',
  entity: 'Entidade identificada',
};

export const ROTULO_OF_COMPARISON: Record<Comparison, string> = {
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

export const COMPARISONS_OF_TELA = COMPARISONS.map((value) => ({
  value,
  rotulo: ROTULO_OF_COMPARISON[value],
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

/** A comparação lida como o motor lê: sem diferenciar maiúscula, `equals` por padrão. */
export function comparisonOf(c: ConditionBlip): Comparison {
  const bruta = (c.comparison ?? 'equals').toLowerCase();
  return COMPARISONS.find((x) => x.toLowerCase() === bruta) ?? 'equals';
}

export const fonteDe = (c: ConditionBlip): string => (c.source ?? 'input').toLowerCase();

/** A condição que o "+" cria: resposta do usuário igual a… (o padrão do motor). */
export function newCondition(): ConditionBlip {
  return { source: 'input', comparison: 'equals', values: [] };
}

/** Trocar a comparação limpa os valores quando ela deixa de precisar deles. */
export function withComparison(c: ConditionBlip, comparison: Comparison): ConditionBlip {
  return ehUnaria(comparison)
    ? { ...c, comparison: comparison, values: [] }
    : { ...c, comparison: comparison, values: c.values ?? [] };
}

/** Trocar a fonte tira o nome de variável quando ele deixa de fazer sentido. */
export function comFonte(c: ConditionBlip, fonte: string): ConditionBlip {
  const resto: ConditionBlip = { ...c, source: fonte };
  delete resto.variable;
  delete resto.entity;
  if (fonte === 'context') resto.variable = c.variable ?? '';
  return resto;
}

/** Um valor a mais na lista (o Enter do campo de valores). Repetido ou vazio não entra. */
export function addValue(c: ConditionBlip, value: string): ConditionBlip {
  const texto = value.trim();
  const current = c.values ?? [];
  if (!texto || current.includes(texto)) return c;
  return { ...c, values: [...current, texto] };
}

export function removerValue(c: ConditionBlip, indice: number): ConditionBlip {
  const current = c.values ?? [];
  return { ...c, values: current.filter((_, i) => i !== indice) };
}

/** A frase de `validarCondicao` do motor, ou nada quando a condição está boa. */
export function conditionError(c: ConditionBlip): string | null {
  try {
    validateCondition(c);
    return null;
  } catch (error) {
    if (error instanceof ValidationError) return error.message;
    throw error;
  }
}

/** O motor não tem provedor de IA: intenção e entidade nunca casam no Pipe. */
export const fonteSemSuporte = (c: ConditionBlip): boolean => {
  const fonte = fonteDe(c);
  return fonte === 'intent' || fonte === 'entity';
};

/* ------------------------------------------------------------- as saídas */

/** "+ Adicionar condição de saída": uma saída nova, sem destino e com uma condição vazia. */
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

/** Sobe ou desce uma saída na ordem de avaliação. Fora da lista, nada muda. */
export function moverSaida(block: Block, de: number, para: number): Block {
  const saidas = [...(block.$conditionOutputs ?? [])];
  if (de < 0 || de >= saidas.length || para < 0 || para >= saidas.length || de === para) return block;
  const [saida] = saidas.splice(de, 1);
  saidas.splice(para, 0, saida!);
  return { ...block, $conditionOutputs: saidas };
}

export function outputDefinirDestination(block: Block, indice: number, destination: string): Block {
  const saidas = (block.$conditionOutputs ?? []).map((s, i) => {
    if (i !== indice) return s;
    if (!destination) return withoutDestination(s);
    return { ...s, stateId: destination, typeOfStateId: s.typeOfStateId ?? 'state' };
  });
  return { ...block, $conditionOutputs: saidas };
}

export function outputDefinirConditions(block: Block, indice: number, conditions: ConditionBlip[]): Block {
  const saidas = (block.$conditionOutputs ?? []).map((s, i) =>
    i === indice ? { ...s, conditions: conditions } : s,
  );
  return { ...block, $conditionOutputs: saidas };
}

export function definirSaidaPadrao(block: Block, destination: string): Block {
  return { ...block, $defaultOutput: destination ? { stateId: destination, $invalid: false } : null };
}

/** Os erros de uma saída, na frase que o painel mostra. */
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
