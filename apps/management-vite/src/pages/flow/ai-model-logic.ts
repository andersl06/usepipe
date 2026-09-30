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
  for (const content of model.contents) {
    if (!content.result.trim()) errors.push(`Conteúdo ${content.name}: preencha a resposta.`);
    if (!content.combinations.length) errors.push(`Conteúdo ${content.name}: adicione uma combinação.`);
    for (const combination of content.combinations) {
      if (combination.intent && !intents.has(combination.intent.trim().toLowerCase())) errors.push(`Conteúdo ${content.name}: a intenção "${combination.intent}" não existe.`);
      if (!combination.intent?.trim() && !combination.entities.length) errors.push(`Conteúdo ${content.name}: escolha uma intenção ou valores de entidades.`);
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

/** Keep the model's content references valid when an intent is renamed. */
export function renameIntent(model: FlowAiModelInput, id: string, name: string): FlowAiModelInput {
  const previous = model.intents.find((x) => x.id === id)?.name;
  return {
    ...model,
    intents: model.intents.map((x) => x.id === id ? { ...x, name } : x),
    contents: model.contents.map((x) => ({ ...x, combinations: x.combinations.map((c) => previous && c.intent?.toLowerCase() === previous.toLowerCase() ? { ...c, intent: name } : c) })),
  };
}

export function aiConditionSuggestions(model: FlowAiModelInput | null, condition: ConditionBlip): string[] {
  if (condition.source?.toLowerCase() === 'intent') return model?.intents.map((x) => x.name) ?? [];
  if (condition.source?.toLowerCase() === 'entity') return model?.entities.find((x) => x.name.toLowerCase() === condition.entity?.toLowerCase())?.values.map((x) => x.name) ?? [];
  return [];
}
