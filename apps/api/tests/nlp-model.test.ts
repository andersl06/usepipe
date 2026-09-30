import { describe, expect, it } from 'vitest';
import type { FlowAiModelInput } from '@pipe/contracts';
import type { AgentModelRequest, AgentModelResponse } from '@pipe/core';
import { normalizeAiModel } from '../src/domain/management/flow-ai-model.js';
import {
  classifierRequest,
  findEntities,
  lexicalAnswersRetriever,
  lexicalIntents,
  matchContentInModel,
  nlpServices,
  parseClassifierReply,
  type AnswersRetriever,
} from '../src/domain/nlp-model.js';

/**
 * P16 services without a database: validation of the flow's AI model, deterministic entities,
 * content matching, the classifier request/reply, AI Answers, and the keyless behaviour of
 * production (no intent, status 500) versus the Builder test run (lexical stand-ins).
 */

const MODEL: FlowAiModelInput = normalizeAiModel({
  settings: { provider: null, model: 'gpt-4.1', apiKeySecret: 'CHAVE_NLP' },
  intents: [
    { id: 'i1', name: 'rastrear_pedido', description: 'Cliente quer saber do pedido', examples: ['onde está meu pedido', 'rastrear entrega'], answers: ['Vou verificar.'] },
    { id: 'i2', name: 'cancelar', examples: ['quero cancelar a compra'], answers: [] },
  ],
  entities: [
    { id: 'e1', name: 'produto', values: [{ name: 'caneta', synonyms: ['esferográfica'] }, { name: 'caderno', synonyms: [] }] },
    { id: 'e2', name: 'cor', values: [{ name: 'azul', synonyms: [] }] },
  ],
  contents: [
    { id: 'c1', name: 'Rastreio', combinations: [{ intent: 'rastrear_pedido', entities: [] }], result: 'Veja em Meus pedidos.' },
    { id: 'c2', name: 'Caneta azul', combinations: [{ intent: null, entities: ['caneta', 'azul'] }], result: 'Temos caneta azul.' },
    { id: 'c3', name: 'Qualquer caneta', combinations: [{ intent: null, entities: ['caneta', 'azul'], minEntityMatch: 1 }], result: 'Temos canetas.' },
  ],
  assistants: [
    {
      id: 'a1', name: 'Trocas', companyName: 'Loja Exemplo', profile: 'Cordial', guidelines: 'Seja breve.',
      invalidAnswer: 'Não sei responder isso.',
      knowledge: [
        { question: 'Qual o prazo de troca?', answer: 'Trocas em até 7 dias.' },
        { question: 'Vocês entregam no sábado?', answer: 'Entregamos de segunda a sábado.' },
      ],
    },
  ],
});

const reply = (text: string, stopReason = 'end'): AgentModelResponse => ({ text, toolCalls: [], stopReason, model: 'gpt-4.1' });

function services(options: { key: boolean; stub: boolean; model?: FlowAiModelInput | null; answer?: (r: AgentModelRequest) => AgentModelResponse; retriever?: AnswersRetriever }) {
  const calls: AgentModelRequest[] = [];
  const s = nlpServices({
    loadModel: async () => (options.model === undefined ? MODEL : options.model),
    callModel: async (request) => {
      calls.push(request);
      if (!options.key) throw new Error("A variável sensível 'CHAVE_NLP' com a chave do provedor OpenAI não está configurada neste fluxo.");
      return (options.answer ?? (() => reply('{"intents":[]}')))(request);
    },
    hasKey: async () => options.key,
    stubWhenNoKey: options.stub,
    ...(options.retriever ? { retriever: options.retriever } : {}),
  });
  return { s, calls };
}

describe('flow AI model validation', () => {
  it('normalises ids, trims and removes duplicate examples', () => {
    const m = normalizeAiModel({ intents: [{ name: 'oi', examples: [' olá ', 'olá'] }] });
    expect(m.intents[0]).toMatchObject({ name: 'oi', examples: ['olá'], answers: [] });
    expect(m.intents[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.settings).toEqual({ provider: null, model: null, apiKeySecret: null });
  });

  it('rejects invalid names, duplicates, unknown intents in combinations and bad providers', () => {
    expect(() => normalizeAiModel({ intents: [{ name: 'com espaço' }] })).toThrow(/letras, números/);
    expect(() => normalizeAiModel({ intents: [{ name: 'a' }, { name: 'A' }] })).toThrow(/mais de uma intenção/);
    expect(() => normalizeAiModel({ contents: [{ name: 'x', result: 'r', combinations: [{ intent: 'nada' }] }] })).toThrow(/não existe/);
    expect(() => normalizeAiModel({ contents: [{ name: 'x', result: 'r', combinations: [] }] })).toThrow(/combinação/);
    expect(() => normalizeAiModel({ settings: { provider: 'blip' } })).toThrow(/Anthropic ou OpenAI/);
    expect(() => normalizeAiModel({ assistants: [{ name: 'x' }] })).toThrow(/fora da base/);
  });
});

describe('entities and contents', () => {
  it('finds entity values and synonyms as whole words, ignoring accents and case', () => {
    expect(findEntities(MODEL, 'Quero uma ESFEROGRAFICA Azul')).toEqual([
      { id: 'e1', name: 'produto', value: 'caneta' },
      { id: 'e2', name: 'cor', value: 'azul' },
    ]);
    expect(findEntities(MODEL, 'canetas')).toEqual([]);
  });

  it('matches the most specific content', () => {
    expect(matchContentInModel(MODEL, { intent: 'rastrear_pedido', entities: [] })?.result).toBe('Veja em Meus pedidos.');
    const both = [{ name: 'produto', value: 'caneta' }, { name: 'cor', value: 'azul' }];
    expect(matchContentInModel(MODEL, { intent: null, entities: both })?.name).toBe('Caneta azul');
    expect(matchContentInModel(MODEL, { intent: null, entities: [{ name: 'produto', value: 'caneta' }] })?.name).toBe('Qualquer caneta');
    expect(matchContentInModel(MODEL, { intent: 'cancelar', entities: [] })).toBeNull();
  });
});

describe('intent classification', () => {
  it('sends the catalogue to the provider and keeps only known intents', () => {
    const request = classifierRequest(MODEL, 'cadê meu pedido?');
    expect(request).toMatchObject({ provider: 'openai', model: 'gpt-4.1', apiKeySecret: 'CHAVE_NLP', tools: [], temperature: null });
    expect(request.system).toContain('rastrear_pedido: Cliente quer saber do pedido');
    expect(request.system).toContain('"quero cancelar a compra"');
    const intents = parseClassifierReply(MODEL, reply('Claro: {"intents":[{"name":"RASTREAR_PEDIDO","score":0.91},{"name":"inventada","score":0.99},{"name":"cancelar","score":"x"}]}'));
    expect(intents).toEqual([{ id: 'i1', name: 'rastrear_pedido', score: 0.91, answer: 'Vou verificar.' }]);
    expect(parseClassifierReply(MODEL, reply('sem json'))).toEqual([]);
  });

  it('the lexical stand-in scores examples', () => {
    const [best] = lexicalIntents(MODEL, 'onde está meu pedido');
    expect(best).toMatchObject({ name: 'rastrear_pedido', score: 1 });
    expect(lexicalIntents(MODEL, 'bom dia')).toEqual([]);
  });

  it('production with a key classifies through the provider; entities never call it', async () => {
    const { s, calls } = services({ key: true, stub: false, answer: () => reply('{"intents":[{"name":"cancelar","score":0.8}]}') });
    await expect(s.analyzeInput!({ text: 'desisto da compra, caneta' })).resolves.toEqual({
      intentions: [{ id: 'i2', name: 'cancelar', score: 0.8 }],
      entities: [{ id: 'e1', name: 'produto', value: 'caneta' }],
    });
    expect(calls).toHaveLength(1);
    const entitiesOnly = services({ key: true, stub: false, model: { ...MODEL, intents: [] } });
    await expect(entitiesOnly.s.analyzeInput!({ text: 'caderno' })).resolves.toMatchObject({ intentions: [] });
    expect(entitiesOnly.calls).toHaveLength(0);
    const none = services({ key: true, stub: false, model: null });
    await expect(none.s.analyzeInput!({ text: 'x' })).resolves.toBeNull();
  });

  it('without a key production fails the analysis (the engine reads no intent) while the test run uses the stand-in', async () => {
    const production = services({ key: false, stub: false });
    await expect(production.s.analyzeInput!({ text: 'onde está meu pedido' })).rejects.toThrow(/não está configurada/);
    const testRun = services({ key: false, stub: true });
    const analysis = await testRun.s.analyzeInput!({ text: 'onde está meu pedido' });
    expect(analysis?.intentions[0]).toMatchObject({ name: 'rastrear_pedido' });
    expect(testRun.calls).toHaveLength(0);
  });
});

describe('AI Answers', () => {
  it('grounds the provider on the retrieved knowledge and the assistant profile', async () => {
    const { s, calls } = services({ key: true, stub: false, answer: () => reply(' Você tem 7 dias para trocar. ') });
    await expect(s.processAnswers!({ userInput: 'qual o prazo pra troca?', contactId: 'c', assistantId: 'A1' })).resolves.toEqual({
      statusCode: 200, response: 'Você tem 7 dias para trocar.',
    });
    expect(calls[0]!.system).toContain('for Loja Exemplo');
    expect(calls[0]!.system).toContain('Seja breve.');
    expect(calls[0]!.system).toContain('Não sei responder isso.');
    expect(calls[0]!.system.indexOf('Trocas em até 7 dias.')).toBeLessThan(calls[0]!.system.indexOf('Entregamos'));
    expect(calls[0]!.messages).toEqual([{ role: 'user', content: 'qual o prazo pra troca?' }]);
  });

  it('reports an unknown assistant, a refusal and an empty knowledge set', async () => {
    const { s } = services({ key: true, stub: false, answer: () => reply('', 'refusal') });
    await expect(s.processAnswers!({ userInput: 'x', contactId: null, assistantId: 'nada' })).resolves.toMatchObject({ statusCode: 404 });
    await expect(s.processAnswers!({ userInput: 'prazo de troca', contactId: null, assistantId: 'a1' })).resolves.toEqual({
      statusCode: 422, response: 'Não sei responder isso.',
    });
    const empty = services({ key: true, stub: false, model: { ...MODEL, assistants: [{ ...MODEL.assistants[0]!, knowledge: [] }] } });
    await expect(empty.s.processAnswers!({ userInput: 'x', contactId: null, assistantId: 'a1' })).resolves.toEqual({
      statusCode: 200, response: 'Não sei responder isso.',
    });
    expect(empty.calls).toHaveLength(0);
  });

  it('without a key: production throws (status 500 in the engine), the test run answers from the best passage', async () => {
    const production = services({ key: false, stub: false });
    await expect(production.s.processAnswers!({ userInput: 'prazo de troca', contactId: null, assistantId: 'a1' })).rejects.toThrow();
    const testRun = services({ key: false, stub: true });
    await expect(testRun.s.processAnswers!({ userInput: 'qual o prazo de troca?', contactId: null, assistantId: 'a1' })).resolves.toEqual({
      statusCode: 200, response: '[Simulação] Trocas em até 7 dias.',
    });
    await expect(testRun.s.processAnswers!({ userInput: 'bom dia', contactId: null, assistantId: 'a1' })).resolves.toEqual({
      statusCode: 200, response: '[Simulação] Não sei responder isso.',
    });
  });

  it('takes its passages from the retriever it is given', async () => {
    const retriever: AnswersRetriever = { retrieve: async () => [{ question: 'Q externa', answer: 'R externa', score: 0.9 }] };
    const { s, calls } = services({ key: true, stub: false, retriever, answer: () => reply('ok') });
    await s.processAnswers!({ userInput: 'x', contactId: null, assistantId: 'a1' });
    expect(calls[0]!.system).toContain('R externa');
    expect(calls[0]!.system).not.toContain('Trocas em até 7 dias.');
    await expect(lexicalAnswersRetriever.retrieve({ assistant: MODEL.assistants[0]!, query: 'entregam sábado', limit: 1 })).resolves.toEqual([
      expect.objectContaining({ answer: 'Entregamos de segunda a sábado.' }),
    ]);
  });
});
