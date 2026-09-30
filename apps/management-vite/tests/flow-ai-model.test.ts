import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlowAiModel, FlowAiModelInput } from '@pipe/contracts';
import type { RenameMemory } from '../src/pages/flow/ai-model-logic';
import { FONTES_DA_TELA, fonteSemSuporte, comFonte } from '../src/pages/builder/conditions';
import { actionErrors, novaAcao, tipoDeAcao } from '../src/pages/builder/actions-of-block';
import { duplicateBlock } from '../src/pages/builder/model';
import type { Block } from '../src/pages/builder/model';
import { itensDoMenu } from '../src/pages/flow/itens';

Object.assign(globalThis, { React });
// CSS has no behavior in server rendering; retain the real components and all event logic.
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, nextLoad) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context); }")}`, import.meta.url);
const model: FlowAiModelInput = {
  settings: { provider: 'openai', model: 'custom-model', apiKeySecret: 'AI_KEY' },
  intents: [{ id: 'i', name: 'trocas', examples: ['Quero trocar'], answers: ['Vamos ajudar'], description: 'Trocas' }],
  entities: [{ id: 'e', name: 'produto', values: [{ name: 'camisa', synonyms: ['blusa'] }] }],
  contents: [{ id: 'c', name: 'Troca camisa', combinations: [{ intent: 'trocas', entities: ['camisa'], minEntityMatch: 1 }], result: 'Troque em 30 dias' }],
  assistants: [{ id: 'a', name: 'Ajuda', companyName: 'Pipe', profile: 'Gentil', guidelines: 'Seja breve', invalidAnswer: 'Não sei', knowledge: [{ question: 'Qual prazo?', answer: '30 dias' }] }],
};

test('AI area follows the bot path and builder permissions', () => {
  assert.equal(itensDoMenu('fluxo', '/application/detail/demo').find((x) => x.rotulo === 'Inteligência artificial')?.href, '/application/detail/demo/ai/model');
  assert.equal(itensDoMenu('fluxo', '/bot', { papelNoFluxo: 'personalizado', editsByAccount: false, permissoes: { builder: 'ler' } }).find((x) => x.rotulo === 'Inteligência artificial')?.href, '/bot/ai/model');
});

test('intents and entities are supported condition sources and entity selection survives source changes', () => {
  assert.ok(FONTES_DA_TELA.some((x) => String(x.valor) === 'intent'));
  assert.ok(FONTES_DA_TELA.some((x) => String(x.valor) === 'entity'));
  assert.equal(fonteSemSuporte({ source: 'intent' }), false);
  assert.equal(fonteSemSuporte({ source: 'entity' }), false);
  assert.equal(comFonte({ source: 'entity', entity: 'produto' }, 'entity').entity, 'produto');
});

test('AI Answers action requires an assistant and has engine input defaults', () => {
  assert.ok(tipoDeAcao('ProcessAnswers'));
  const action = novaAcao('ProcessAnswers', 'action');
  assert.equal(action.settings?.['UserInput'], '{{input.content}}');
  assert.equal(action.settings?.['ContactId'], '{{contact.identity}}');
  assert.ok(actionErrors(action).some((x) => x.includes('Assistente')));
  assert.deepEqual(actionErrors({ ...action, settings: { ...action.settings, AssistantId: 'a' } }), []);
});

test('AI Answers block waits for input, processes on leaving, and duplicates with its type', async () => {
  const module = await import('../src/pages/builder/ai-answers-block').catch(() => null);
  assert.ok(module, 'AI Answers block factory must exist');
  const block = module.newAiAnswersBlock({}, { top: 10, left: 20 }, 'block');
  assert.ok(block.$contentActions?.[0]?.input);
  assert.equal(block.$leavingCustomActions?.[0]?.type, 'ProcessAnswers');
  assert.equal(block.$defaultOutput?.stateId, 'fallback');
  const copy = duplicateBlock({ [block.id]: block }, block.id, 'copy');
  assert.equal(module.isAiAnswersBlock(copy['ai-answers:copy']!), true);
});

test('model validation rejects ambiguous names, incomplete knowledge and invalid combinations', async () => {
  const module = await import('../src/pages/flow/ai-model-logic').catch(() => null);
  assert.ok(module, 'AI model validation must exist');
  assert.deepEqual(module.aiModelErrors(model), []);
  assert.ok(module.aiModelErrors({ ...model, intents: [...model.intents, { ...model.intents[0]!, id: 'i2', name: 'TROCAS' }] }).some((x) => /duplicad/i.test(x)));
  assert.ok(module.aiModelErrors({ ...model, contents: [{ ...model.contents[0]!, combinations: [{ intent: 'missing', entities: [] }] }] }).some((x) => /não existe/.test(x)));
  assert.ok(module.aiModelErrors({ ...model, contents: [{ ...model.contents[0]!, combinations: [{ intent: null, entities: [] }] }] }).length);
  assert.ok(module.aiModelErrors({ ...model, assistants: [{ ...model.assistants[0]!, knowledge: [{ question: '', answer: 'Resposta' }] }] }).length);
});

test('intent rename updates content references without mutating the model', async () => {
  const module = await import('../src/pages/flow/ai-model-logic').catch(() => null);
  assert.ok(module);
  const next = module.renameIntent(model, 'i', 'devolucao');
  assert.equal(next.contents[0]?.combinations[0]?.intent, 'devolucao');
  assert.equal(model.contents[0]?.combinations[0]?.intent, 'trocas');
});

test('clearing an intent name while renaming never leaves an "any intent" reference', async () => {
  const module = await import('../src/pages/flow/ai-model-logic');
  const memory: RenameMemory = new Map();
  let current = model;
  const keystrokes = [...Array.from({ length: 'trocas'.length }, (_, i) => 'trocas'.slice(0, 'trocas'.length - 1 - i)), ...Array.from('devolucao', (_, i) => 'devolucao'.slice(0, i + 1))];
  for (const name of keystrokes) {
    current = module.renameIntent(current, 'i', name, memory);
    const intent = current.contents[0]?.combinations[0]?.intent;
    assert.ok(intent?.trim(), `reference became "${intent}" after typing "${name}"`);
    if (!name) {
      assert.equal(intent, 't', 'references keep the last non-empty name');
      assert.ok(module.aiModelErrors(current).length, 'cleared name must block save');
    }
  }
  assert.equal(current.contents[0]?.combinations[0]?.intent, 'devolucao');
  assert.deepEqual(module.aiModelErrors(current), []);
  assert.equal(model.contents[0]?.combinations[0]?.intent, 'trocas');
});

test('a combination with a blank intent is a validation error, not "any intent"', async () => {
  const module = await import('../src/pages/flow/ai-model-logic');
  const blank = { ...model, contents: [{ ...model.contents[0]!, combinations: [{ intent: '', entities: ['camisa'] }] }] };
  assert.ok(module.aiModelErrors(blank).some((x) => /em branco/.test(x)));
  const { AiModelForm } = await import('../src/pages/flow/ai-model-form');
  const html = renderToStaticMarkup(React.createElement(AiModelForm, { model: blank, secretNames: [], onChange: () => undefined }));
  assert.match(html, /\(intenção em branco\)/);
});

test('renaming an entity value keeps content matching its synonyms at runtime', async () => {
  const module = await import('../src/pages/flow/ai-model-logic');
  // The engine's own matcher: validation must agree with what actually matches.
  const runtime = await import('../../api/src/domain/nlp-model');
  const matches = (m: FlowAiModelInput, text: string) => runtime.matchContentInModel(m, { intent: 'trocas', entities: runtime.findEntities(m, text) })?.id ?? null;
  assert.equal(matches(model, 'quero trocar a blusa'), 'c');
  const memory: RenameMemory = new Map();
  let renamed = model;
  for (const name of ['camis', 'cami', 'cam', 'ca', 'c', '', 'c', 'ca', 'camiseta']) renamed = module.renameEntityValue(renamed, 'e', 0, name, memory);
  assert.deepEqual(renamed.contents[0]?.combinations[0]?.entities, ['camiseta']);
  assert.deepEqual(module.aiModelErrors(renamed), []);
  assert.equal(matches(renamed, 'quero trocar a blusa'), 'c');
  assert.deepEqual(model.contents[0]?.combinations[0]?.entities, ['camisa']);
});

test('shared entity values are not rewritten and unresolved combination values block save', async () => {
  const module = await import('../src/pages/flow/ai-model-logic');
  const shared: FlowAiModelInput = { ...model, entities: [...model.entities, { id: 'e2', name: 'roupa', values: [{ name: 'Camisa', synonyms: [] }] }] };
  const renamed = module.renameEntityValue(shared, 'e', 0, 'camiseta');
  assert.deepEqual(renamed.contents[0]?.combinations[0]?.entities, ['camisa'], 'still matches the other entity value');
  assert.deepEqual(module.aiModelErrors(renamed), []);
  const removed = module.removeEntityValue(model, 'e', 0);
  assert.ok(module.aiModelErrors(removed).some((x) => /"camisa" não existe/.test(x)));
  const withoutEntity = { ...model, entities: [] };
  assert.ok(module.aiModelErrors(withoutEntity).some((x) => /"camisa" não existe/.test(x)));
  assert.deepEqual(module.aiModelErrors({ ...model, contents: [{ ...model.contents[0]!, combinations: [{ intent: 'trocas', entities: ['Camisa!'] }] }] }), [], 'runtime normalization is honored');
  const { AiModelForm } = await import('../src/pages/flow/ai-model-form');
  const html = renderToStaticMarkup(React.createElement(AiModelForm, { model: removed, secretNames: [], onChange: () => undefined }));
  assert.match(html, /nunca serão identificados: camisa/);
});

test('model save PUTs the whole input without server metadata and exposes API errors', async () => {
  const module = await import('../src/lib/flow-ai-model').catch(() => null);
  assert.ok(module, 'AI model API adapter must exist');
  const previous = globalThis.fetch;
  const calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (path, init) => { calls.push({ path: String(path), init }); return Response.json({ ...model, flowId: 'flow', updatedAt: null }); };
  try {
    assert.equal(module.aiModelApi('flow'), '/v1/management/flows/flow/ai-model');
    const saved = await module.saveAiModel('flow', { ...model, flowId: 'flow', updatedAt: null } as FlowAiModelInput);
    assert.equal(saved.ok, true);
    assert.equal(calls[0]?.init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), model);
    globalThis.fetch = async () => Response.json({ error: { message: 'Sem permissão' } }, { status: 403 });
    assert.deepEqual(await module.saveAiModel('flow', model), { ok: false, error: 'Sem permissão' });
  } finally { globalThis.fetch = previous; }
});

test('model editor renders structured fields for the complete model and stores only secret names', async () => {
  const module = await import('../src/pages/flow/ai-model-form').catch(() => null);
  assert.ok(module, 'Structured AI model editor must exist');
  const html = renderToStaticMarkup(React.createElement(module.AiModelForm, { model, onChange: () => undefined, secretNames: ['AI_KEY'] }));
  for (const text of ['Provedor', 'Modelo', 'AI_KEY', 'Intenções', 'Entidades', 'Conteúdos', 'AI Answers', 'Quero trocar', 'blusa', 'Troque em 30 dias', 'Gentil', 'Seja breve', 'Qual prazo?', '30 dias']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /type="password"/);
});

test('assistant picker preserves unknown imported IDs and links to the assistant editor', async () => {
  const module = await import('../src/pages/builder/ai-model-context').catch(() => null);
  assert.ok(module);
  const html = renderToStaticMarkup(React.createElement(module.AiModelContext.Provider, { value: { model, editorPath: '/bot/ai/model' } },
    React.createElement(module.AssistantPicker, { value: 'imported', onChange: () => undefined })));
  const selected = renderToStaticMarkup(React.createElement(module.AiModelContext.Provider, { value: { model } }, React.createElement(module.AssistantPicker, { value: 'a', onChange: () => undefined })));
  assert.match(selected, /Ajuda/);
  assert.match(html, /imported/);
  assert.match(html, /Editar assistente/);
  assert.match(html, /\/bot\/ai\/model/);
});

test('assistant picker refetches on focus and offers an explicit refresh for edits saved in another tab', async () => {
  const module = await import('../src/pages/builder/ai-model-context');
  const { clienteDeConsultas } = await import('../src/lib/cliente-de-consultas');
  assert.equal(clienteDeConsultas.getDefaultOptions().queries?.refetchOnWindowFocus, false, 'the app-wide default is what this override exists for');
  assert.deepEqual(module.BUILDER_AI_MODEL_QUERY, { staleTime: 0, refetchOnWindowFocus: true });
  const html = renderToStaticMarkup(React.createElement(module.AiModelContext.Provider, { value: { model, editorPath: '/bot/ai/model', refresh: () => undefined } },
    React.createElement(module.AssistantPicker, { value: 'a', onChange: () => undefined })));
  assert.match(html, /Atualizar assistentes/);
  assert.match(html, /volta ao Builder/);
  const busy = renderToStaticMarkup(React.createElement(module.AiModelContext.Provider, { value: { model, refresh: () => undefined, refreshing: true } },
    React.createElement(module.AssistantPicker, { value: 'a', onChange: () => undefined })));
  assert.match(busy, /Atualizando assistentes/);
  assert.match(busy, /disabled=""[^>]*>Atualizar assistentes/);
});

test('a failed background refetch keeps the model editor mounted beside the error', async () => {
  const { AiModelReadView } = await import('../src/pages/flow/ai-model-read-view');
  const data: FlowAiModel = { ...model, flowId: 'flow', updatedAt: null };
  const editor = (d: typeof data) => React.createElement('form', { id: 'draft' }, d.flowId);
  const view = (error: Error | null, loaded: typeof data | null = data) => AiModelReadView({ data: loaded ?? undefined, error, retry: () => undefined, children: editor }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const failed = view(new Error('Rede indisponível'));
  const html = renderToStaticMarkup(failed);
  assert.match(html, /id="draft"/);
  assert.match(html, /Não foi possível atualizar o modelo: Rede indisponível/);
  assert.match(html, /alterações não salvas foram mantidas/);
  // Same element type and position before, during and after the error: React keeps the editor (and its draft) mounted.
  for (const tree of [view(null), failed, view(null)]) {
    assert.equal(tree.type, React.Fragment);
    assert.equal((tree.props.children[1] as React.ReactElement<{ id: string }>).props.id, 'draft');
  }
  assert.match(renderToStaticMarkup(view(new Error('Falhou'), null)), /Não foi possível carregar o modelo: Falhou/);
  assert.doesNotMatch(renderToStaticMarkup(view(new Error('Falhou'), null)), /id="draft"/);
});

test('condition suggestions offer intent names and entity values according to the selected entity', async () => {
  const module = await import('../src/pages/flow/ai-model-logic').catch(() => null);
  assert.ok(module);
  assert.deepEqual(module.aiConditionSuggestions(model, { source: 'intent' }), ['trocas']);
  assert.deepEqual(module.aiConditionSuggestions(model, { source: 'entity', entity: 'produto' }), ['camisa']);
  assert.deepEqual(module.aiConditionSuggestions(model, { source: 'context' }), []);
});

test('lexical test note is only applicable to NLP models or flows using AI Answers', async () => {
  const module = await import('../src/pages/builder/ai-answers-block').catch(() => null);
  assert.ok(module);
  assert.equal(module.hasLexicalAi(null, {}), false);
  assert.equal(module.hasLexicalAi(model, {}), true);
  assert.equal(module.hasLexicalAi(null, { b: { id: 'b', $leavingCustomActions: [{ type: 'ProcessAnswers' }] } }), true);
});

test('entity condition UI exposes entity name and matching-value suggestions while keeping free text', async () => {
  const context = await import('../src/pages/builder/ai-model-context');
  const { ConditionsEditor } = await import('../src/pages/builder/condition');
  const html = renderToStaticMarkup(React.createElement(context.AiModelContext.Provider, { value: { model } },
    React.createElement(ConditionsEditor, { conditions: [{ source: 'entity', entity: 'produto', comparison: 'equals', values: ['importado'] }], onMudar: () => undefined, rotuloAdicionar: 'Adicionar' })));
  assert.match(html, /Nome da entidade/);
  assert.match(html, /produto/);
  assert.match(html, /camisa/);
  assert.match(html, /importado/);
});

test('lexical stand-in notice only shows once secret metadata confirms there is no provider key', async () => {
  const module = await import('../src/pages/builder/ai-answers-block');
  assert.equal(module.needsLexicalStandIn(model, undefined), false);
  assert.equal(module.needsLexicalStandIn(model, ['AI_KEY']), false);
  assert.equal(module.needsLexicalStandIn(model, []), true);
  assert.equal(module.needsLexicalStandIn({ ...model, settings: { provider: null, model: 'gpt-4.1', apiKeySecret: null } }, ['OPENAI_API_KEY']), false);
});

test('assistant selection updates only AssistantId and survives block serialization', async () => {
  const { AiAnswersPanel } = await import('../src/pages/builder/panel-ai-answers');
  const { newAiAnswersBlock } = await import('../src/pages/builder/ai-answers-block');
  const block = newAiAnswersBlock({}, { top: 0, left: 0 }, 'b');
  block.$leavingCustomActions![0]!.settings!['extraImported'] = 'keep';
  block.$leavingCustomActions!.push({ type: 'SetVariable', settings: { variable: 'extra', value: 'keep' } });
  let changed: Block | undefined;
  const tree = AiAnswersPanel({ block, onMudar: (next) => { changed = next; } });
  const picker = (tree.props.children as React.ReactElement<{ onChange: (value: string) => void }>[])[0]!;
  picker.props.onChange('a');
  assert.ok(changed);
  const persisted: Block = JSON.parse(JSON.stringify(changed));
  assert.equal(persisted.$leavingCustomActions?.[0]?.settings?.['AssistantId'], 'a');
  assert.equal(persisted.$leavingCustomActions?.[0]?.settings?.['extraImported'], 'keep');
  assert.equal(persisted.$leavingCustomActions?.[1]?.type, 'SetVariable');
  assert.equal(block.$leavingCustomActions?.[0]?.settings?.['AssistantId'], '');
});

test('entity dictionaries allow adding values up to the existing 200-value API limit', async () => {
  const { AiModelForm } = await import('../src/pages/flow/ai-model-form');
  const html = renderToStaticMarkup(React.createElement(AiModelForm, {
    model: { ...model, entities: [{ ...model.entities[0]!, values: Array.from({ length: 100 }, (_, i) => ({ name: `valor_${i}`, synonyms: [] })) }] },
    secretNames: [], onChange: () => undefined,
  }));
  assert.doesNotMatch(html, /disabled=""[^>]*>\+ Adicionar valor/);
});
