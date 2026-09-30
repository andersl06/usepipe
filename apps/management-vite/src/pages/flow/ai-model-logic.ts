import type { FlowAiModelInput } from '@pipe/contracts';
import type { ConditionBlip } from '@pipe/core';

/** Client-side feedback for relational errors; API remains authoritative for size limits. */
export function aiModelErrors(model: FlowAiModelInput): string[] {
  const errors: string[] = [];
  const names = (items: { name: string }[], label: string, restricted = false) => {
    const seen = new Set<string>();
    for (const item of items) {
      const name = item.name.trim();
      if (!name) errors.push(`${label}: preencha o nome.`);
      else if (restricted && !/^[\p{L}\p{N}_-]{1,190}$/u.test(name)) errors.push(`${label}: use apenas letras, números, "_" ou "-" no nome.`);
      if (seen.has(name.toLowerCase())) errors.push(`${label}: nome duplicado "${name}".`);
      seen.add(name.toLowerCase());
    }
  };
  names(model.intents, 'Intenção', true);
  names(model.entities, 'Entidade', true);
  names(model.contents, 'Conteúdo');
  names(model.assistants, 'Assistente');
  if (model.settings.apiKeySecret && !/^[\p{L}\p{N}_.]{1,190}$/u.test(model.settings.apiKeySecret.trim())) errors.push('Variável sensível: use apenas letras, números, "_" ou ".".');
  for (const entity of model.entities) names(entity.values, `Valores de ${entity.name}`);
  const intents = new Set(model.intents.map((x) => x.name.trim().toLowerCase()));
  const values = entityValueKeys(model);
  for (const content of model.contents) {
    if (!content.result.trim()) errors.push(`Conteúdo ${content.name}: preencha a resposta.`);
    if (!content.combinations.length) errors.push(`Conteúdo ${content.name}: adicione uma combinação.`);
    for (const combination of content.combinations) {
      if (combination.intent && !intents.has(combination.intent.trim().toLowerCase())) errors.push(`Conteúdo ${content.name}: a intenção "${combination.intent}" não existe.`);
      if (combination.intent != null && !combination.intent.trim()) errors.push(`Conteúdo ${content.name}: uma combinação está com a intenção em branco. Escolha uma intenção ou "Qualquer intenção".`);
      else if (!combination.intent?.trim() && !combination.entities.length) errors.push(`Conteúdo ${content.name}: escolha uma intenção ou valores de entidades.`);
      for (const value of combination.entities) {
        if (!values.has(entityValueKey(value))) errors.push(`Conteúdo ${content.name}: o valor de entidade "${value}" não existe em nenhuma entidade. Escolha um valor cadastrado ou remova-o da combinação.`);
      }
      const min = combination.minEntityMatch;
      if (min !== undefined && (!Number.isInteger(min) || min < 0 || min > combination.entities.length)) errors.push(`Conteúdo ${content.name}: mínimo de entidades deve estar entre 0 e ${combination.entities.length}.`);
    }
  }
  for (const assistant of model.assistants) {
    if (!assistant.invalidAnswer.trim()) errors.push(`Assistente ${assistant.name}: preencha a resposta de fallback.`);
    if (assistant.knowledge.some((x) => !x.question.trim() || !x.answer.trim())) errors.push(`Assistente ${assistant.name}: preencha pergunta e resposta de cada item.`);
  }
  return errors;
}

/**
 * Name that content references still carry for each item whose name field is currently empty.
 * The form keeps one per editor so a clear-then-type rename can still move its references.
 */
export type RenameMemory = Map<string, string>;

/** Pick the name references carry: the current one, or the last one before the field was cleared. */
function referenceName(current: string, key: string, next: string, memory: RenameMemory): string {
  const from = current.trim() ? current : memory.get(key) ?? '';
  if (next.trim()) memory.delete(key);
  else if (from.trim()) memory.set(key, from);
  return from.trim();
}

/**
 * Keep the model's content references valid when an intent is renamed. References never become
 * empty (an empty intent means "any intent" at runtime): while the field is cleared they keep the
 * last name, which validation flags until a new name is typed.
 */
export function renameIntent(model: FlowAiModelInput, id: string, name: string, memory: RenameMemory = new Map()): FlowAiModelInput {
  const from = referenceName(model.intents.find((x) => x.id === id)?.name ?? '', id, name, memory).toLowerCase();
  const shared = model.intents.some((x) => x.id !== id && x.name.trim().toLowerCase() === from);
  const rewrite = !!name.trim() && !!from && !shared;
  return {
    ...model,
    intents: model.intents.map((x) => x.id === id ? { ...x, name } : x),
    contents: rewrite
      ? model.contents.map((x) => ({ ...x, combinations: x.combinations.map((c) => c.intent?.trim().toLowerCase() === from ? { ...c, intent: name } : c) }))
      : model.contents,
  };
}

/** Same text normalization the runtime applies before comparing combination values with entity values. */
export function entityValueKey(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Normalized names of every entity value; combinations can only match these. */
export function entityValueKeys(model: FlowAiModelInput): Set<string> {
  return new Set(model.entities.flatMap((entity) => entity.values.map((value) => entityValueKey(value.name))).filter(Boolean));
}

/** Combination values that no entity value can produce at runtime. */
export function orphanEntityValues(model: FlowAiModelInput, values: string[]): string[] {
  const known = entityValueKeys(model);
  return values.filter((value) => !known.has(entityValueKey(value)));
}

const valueMemoryKey = (entityId: string, index: number) => `${entityId}#${index}`;

/**
 * Rename one entity value and move combination references to it. References are only rewritten when
 * the old value is unambiguous: if another entity value still has that text, references keep matching
 * it and are left alone. Cleared names keep references on the last name, like intents.
 */
export function renameEntityValue(model: FlowAiModelInput, entityId: string, index: number, name: string, memory: RenameMemory = new Map()): FlowAiModelInput {
  const current = model.entities.find((x) => x.id === entityId)?.values[index]?.name ?? '';
  const from = entityValueKey(referenceName(current, valueMemoryKey(entityId, index), name, memory));
  const shared = model.entities.some((entity) => entity.values.some((value, i) => !(entity.id === entityId && i === index) && entityValueKey(value.name) === from));
  const rewrite = !!entityValueKey(name) && !!from && !shared;
  return {
    ...model,
    entities: model.entities.map((entity) => entity.id === entityId ? { ...entity, values: entity.values.map((value, i) => i === index ? { ...value, name } : value) } : entity),
    contents: rewrite
      ? model.contents.map((content) => ({ ...content, combinations: content.combinations.map((c) => c.entities.some((e) => entityValueKey(e) === from) ? { ...c, entities: c.entities.map((e) => entityValueKey(e) === from ? name : e) } : c) }))
      : model.contents,
  };
}

/** Remove an entity value; references stay so validation can show what stopped matching. */
export function removeEntityValue(model: FlowAiModelInput, entityId: string, index: number, memory: RenameMemory = new Map()): FlowAiModelInput {
  for (const key of [...memory.keys()]) if (key.startsWith(`${entityId}#`)) memory.delete(key);
  return { ...model, entities: model.entities.map((entity) => entity.id === entityId ? { ...entity, values: entity.values.filter((_, i) => i !== index) } : entity) };
}

export function aiConditionSuggestions(model: FlowAiModelInput | null, condition: ConditionBlip): string[] {
  if (condition.source?.toLowerCase() === 'intent') return model?.intents.map((x) => x.name) ?? [];
  if (condition.source?.toLowerCase() === 'entity') return model?.entities.find((x) => x.name.toLowerCase() === condition.entity?.toLowerCase())?.values.map((x) => x.name) ?? [];
  return [];
}
