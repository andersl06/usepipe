import { describe, expect, it } from 'vitest';
import { AI_ANSWERS_VARIABLES_KEY, createInbound, getVariable, type Context, type OutputMessage, type ServicosDoMotor } from './context.js';
import { converterDoEditor, importReport, type ExportDoEditor } from './editor.js';
import { processInbound } from './manager.js';
import { bestIntent, minimumIntentScore, type InputAnalysis } from './nlp.js';
import { processAnswers, type AnswersRequest } from './ai-answers.js';
import type { FlowBlip } from './modelos.js';

/** Invented flow: a menu routed by intent and entity, and an AI Answers block (no Blip content copied). */
function editorFlow(): ExportDoEditor {
  return {
    flow: {
      inicio: {
        id: 'inicio',
        root: true,
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [
          { stateId: 'pedido', conditions: [{ source: 'intent', comparison: 'equals', values: ['rastrear_pedido'] }] },
          {
            stateId: 'produto',
            conditions: [{ source: 'entity', entity: 'produto', comparison: 'equals', values: ['caneta'] }],
          },
          { stateId: 'duvidas', conditions: [{ source: 'input', comparison: 'equals', values: ['dúvidas'] }] },
        ],
        $defaultOutput: { stateId: 'naoEntendi' },
      },
      pedido: {
        id: 'pedido',
        $contentActions: [
          {
            action: {
              type: 'SendMessage',
              settings: {
                type: 'text/plain',
                content: 'Intenção {{input.intent.name}} ({{input.intent.score}}): {{input.intent.answer}} / {{input.contentAssistant.result}}',
              },
            },
          },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
      produto: {
        id: 'produto',
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: 'Produto: {{input.entity.produto.value}}' } } },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
      naoEntendi: {
        id: 'naoEntendi',
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: 'Não entendi' } } },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
      duvidas: {
        id: 'duvidas',
        $title: 'AI Answers',
        $contentActions: [{ input: { bypass: false } }],
        $leavingCustomActions: [
          {
            type: 'ProcessAnswers',
            settings: { UserInput: '{{input.content}}', ContactId: '{{contact.identity}}', AssistantId: 'assistente-1' },
          },
        ],
        $conditionOutputs: [
          {
            stateId: 'resposta',
            conditions: [{ source: 'context', variable: 'aiAnswers.statusCode', comparison: 'equals', values: ['200'] }],
          },
        ],
        $defaultOutput: { stateId: 'naoEntendi' },
      },
      resposta: {
        id: 'resposta',
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: '{{aiAnswers.response}}' } } },
          { input: { bypass: false } },
        ],
        $defaultOutput: { stateId: 'inicio' },
      },
    },
  };
}

function harness(
  flow: FlowBlip,
  services: Partial<ServicosDoMotor>,
): { sent: OutputMessage[]; variables: Record<string, string>; run: (text: string, tipo?: string) => Promise<Context> } {
  const sent: OutputMessage[] = [];
  const variables: Record<string, string> = {};
  let n = 0;
  const run = async (text: string, tipo = 'text/plain'): Promise<Context> => {
    const c: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id: `m-${n++}`, tipo, conteudo: text }),
      variables,
      inboundContext: new Map(),
      contact: { identity: 'contato-1' },
      services: {
        send: async (m) => { sent.push(m); },
        forwardForAttendance: async () => ({ id: 't' }),
        registerEvent: async () => {},
        ...services,
      },
    };
    await processInbound(c);
    return c;
  };
  return { sent, variables, run };
}

/** Stub classifier: fixed scores per keyword, never the network. */
function classifier(calls: string[]) {
  return async ({ text }: { text: string }): Promise<InputAnalysis> => {
    calls.push(text);
    const intentions = [];
    if (/pedido/i.test(text)) intentions.push({ id: 'i1', name: 'rastrear_pedido', score: /talvez/i.test(text) ? 0.4 : 0.92, answer: 'Vou rastrear.' });
    intentions.push({ id: 'i2', name: 'saudacao', score: 0.1 });
    const entities = /caneta/i.test(text) ? [{ id: 'e1', name: 'produto', value: 'caneta' }] : [];
    return { intentions, entities };
  };
}

const texts = (sent: OutputMessage[]) => sent.map((m) => m.conteudo);

describe('minimum intent score', () => {
  it('reads builder:minimumIntentScore, defaulting to Blip\'s 0.5', () => {
    expect(minimumIntentScore({ id: 'f', states: [], configuration: { 'builder:minimumIntentScore': '0.8' } })).toBe(0.8);
    expect(minimumIntentScore({ id: 'f', states: [], configuration: { 'builder:minimumIntentScore': 'x' } })).toBe(0.5);
    expect(minimumIntentScore({ id: 'f', states: [] })).toBe(0.5);
    expect(bestIntent([{ name: 'a', score: 0.6 }, { name: 'b', score: 0.9 }, { name: 'c', score: 0.2 }], 0.5)?.name).toBe('b');
    expect(bestIntent([{ name: 'a', score: 0.4 }], 0.5)).toBeNull();
  });
});

describe('intent and entity (P16)', () => {
  it('routes by the intent condition and fills input.intent.* and input.contentAssistant.*, analysing once', async () => {
    const calls: string[] = [];
    const contentRequests: unknown[] = [];
    const flow = converterDoEditor(editorFlow(), 'f');
    const h = harness(flow, {
      analyzeInput: classifier(calls),
      matchContent: async (request) => {
        contentRequests.push(request);
        return request.intent === 'rastrear_pedido' ? { id: 'c1', name: 'Rastreio', result: 'Acesse a área de pedidos.' } : null;
      },
    });
    await h.run('onde está meu pedido?');
    expect(texts(h.sent)).toEqual(['Intenção rastrear_pedido (0.92): Vou rastrear. / Acesse a área de pedidos.']);
    expect(calls).toEqual(['onde está meu pedido?']);
    expect(contentRequests).toEqual([{ intent: 'rastrear_pedido', entities: [] }]);
  });

  it('ignores an intent below builder:minimumIntentScore and routes by entity', async () => {
    const calls: string[] = [];
    const flow = converterDoEditor(editorFlow(), 'f');
    flow.configuration = { 'builder:minimumIntentScore': '0.5' };
    const h = harness(flow, { analyzeInput: classifier(calls) });
    await h.run('talvez um pedido de caneta');
    expect(texts(h.sent)).toEqual(['Produto: caneta']);
    flow.configuration = { 'builder:minimumIntentScore': '0.3' };
    await h.run('oi');
    await h.run('talvez um pedido de caneta');
    expect(texts(h.sent).at(-1)).toMatch(/^Intenção rastrear_pedido \(0.4\)/);
  });

  it('reads no intent when the analysis fails, the service is missing or the input is not text', async () => {
    const flow = converterDoEditor(editorFlow(), 'f');
    const failing = harness(flow, { analyzeInput: async () => { throw new Error('provedor fora'); } });
    await failing.run('meu pedido');
    expect(texts(failing.sent)).toEqual(['Não entendi']);

    const none = harness(flow, {});
    await none.run('meu pedido');
    expect(texts(none.sent)).toEqual(['Não entendi']);

    const calls: string[] = [];
    const media = harness(flow, { analyzeInput: classifier(calls) });
    await media.run(JSON.stringify({ uri: 'https://exemplo.test/pedido.png' }), 'application/vnd.lime.media-link+json');
    expect(calls).toEqual([]);
    expect(texts(media.sent)).toEqual(['Não entendi']);
  });

  it('keeps an intent that arrived prepared and never analyses it again', async () => {
    const calls: string[] = [];
    const c: Context = {
      user: 'u',
      flow: { id: 'f', states: [] },
      inbound: createInbound({ id: 'm', tipo: 'text/plain', conteudo: 'x' }, { intent: { name: 'pronta', score: 1 } }),
      variables: {},
      inboundContext: new Map(),
      services: {
        send: async () => {},
        forwardForAttendance: async () => ({ id: 't' }),
        registerEvent: async () => {},
        analyzeInput: classifier(calls),
      },
    };
    await expect(getVariable(c, 'input.intent.name')).resolves.toBe('pronta');
    await expect(getVariable(c, 'input.entity.produto.value')).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('no longer reports intent/entity conditions as unsupported on import', () => {
    const report = importReport(converterDoEditor(editorFlow(), 'f'));
    expect(Object.keys(report.naoSuportado)).toEqual([]);
  });
});

describe('AI Answers (ProcessAnswers)', () => {
  it('stores aiAnswers.response and statusCode for the flow to read and route on', async () => {
    const requests: AnswersRequest[] = [];
    const flow = converterDoEditor(editorFlow(), 'f');
    const h = harness(flow, {
      processAnswers: async (request) => {
        requests.push(request);
        return { statusCode: 200, response: 'O prazo de troca é de 7 dias.' };
      },
    });
    await h.run('dúvidas');
    await h.run('qual o prazo de troca?');
    expect(requests).toEqual([{ userInput: 'qual o prazo de troca?', contactId: 'contato-1', assistantId: 'assistente-1' }]);
    expect(texts(h.sent)).toEqual(['O prazo de troca é de 7 dias.']);
    expect(JSON.parse(h.variables[AI_ANSWERS_VARIABLES_KEY]!)).toEqual({ response: 'O prazo de troca é de 7 dias.', statusCode: 200 });
  });

  it('reports failures as a status code instead of throwing', async () => {
    const flow = converterDoEditor(editorFlow(), 'f');
    const h = harness(flow, { processAnswers: async () => { throw new Error('chave ausente'); } });
    await h.run('dúvidas');
    const c = await h.run('qual o prazo?');
    expect(texts(h.sent)).toEqual(['Não entendi']);
    await expect(getVariable(c, 'aiAnswers.statusCode')).resolves.toBe('500');
    await expect(getVariable(c, 'aianswers.response')).resolves.toBe('chave ausente');

    const semServico = harness(flow, {});
    await semServico.run('dúvidas');
    const d = await semServico.run('qual o prazo?');
    await expect(getVariable(d, 'aiAnswers.statusCode')).resolves.toBe('503');
  });

  it('asks for an assistant', async () => {
    const c: Context = {
      user: 'u',
      flow: { id: 'f', states: [] },
      inbound: createInbound({ id: 'm', tipo: 'text/plain', conteudo: 'x' }),
      variables: {},
      inboundContext: new Map(),
      services: { send: async () => {}, forwardForAttendance: async () => ({ id: 't' }), registerEvent: async () => {} },
    };
    await processAnswers.executar(c, { UserInput: 'oi' });
    await expect(getVariable(c, 'aiAnswers.statusCode')).resolves.toBe('400');
  });
});
