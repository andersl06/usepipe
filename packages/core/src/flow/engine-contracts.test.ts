import { afterEach, describe, expect, it, vi } from 'vitest';
import { botTimeZone } from './actions.js';
import { EXPIRATIONS_KEY, createInbound, stateSaved, timeSpanSeconds, type Context, type OutputMessage, type ScriptRequest } from './context.js';
import { importReport } from './editor.js';
import { processInbound } from './manager.js';
import type { FlowBlip } from './modelos.js';

function context(flow: Partial<FlowBlip> = {}, variables: Record<string, string> = {}): Context & { sent: OutputMessage[] } {
  const sent: OutputMessage[] = [];
  return {
    sent,
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [], outputs: [] }], ...flow },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variables,
    inboundContext: new Map(),
    services: {
      send: async (m) => void sent.push(m),
      forwardForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
    },
  };
}

/** What the API does between two messages: the variables map goes through `execucao_fluxo.contexto` (jsonb). */
const persisted = (variables: Record<string, string>): Record<string, string> =>
  JSON.parse(JSON.stringify(variables)) as Record<string, string>;

afterEach(() => vi.useRealTimers());

describe('SetVariable.expiration', () => {
  it('survives persistence and disappears once the deadline passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const c = context();
    c.flow.states[0]!.outputActions = [
      { type: 'SetVariable', settings: { variable: 'code', value: '123', expiration: 60 } },
      { type: 'SetVariable', settings: { variable: 'name', value: 'Ana' } },
    ];
    await processInbound(c);

    const next = context({}, persisted(c.variables));
    next.flow.states[0]!.outputActions = [{ type: 'SetVariable', settings: { variable: 'seen', value: '{{code}}' } }];
    vi.setSystemTime(new Date('2026-01-01T12:00:59Z'));
    await processInbound(next);
    expect(next.variables['seen']).toBe('123');

    vi.setSystemTime(new Date('2026-01-01T12:01:01Z'));
    await processInbound(next);
    expect(next.variables['seen']).toBe('');
    expect(next.variables['code']).toBeUndefined();
    expect(next.variables['name']).toBe('Ana');
    expect(next.variables[EXPIRATIONS_KEY]).toBeUndefined();
  });

  it('overwriting without expiration makes the variable permanent again', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [
      { type: 'SetVariable', settings: { variable: 'code', value: '1', expiration: 60 } },
      { type: 'SetVariable', settings: { variable: 'code', value: '2' } },
    ];
    await processInbound(c);
    expect(c.variables['code']).toBe('2');
    expect(c.variables[EXPIRATIONS_KEY]).toBeUndefined();
  });
});

describe('builder:stateExpiration', () => {
  const flow = (): Partial<FlowBlip> => ({
    configuration: { 'builder:stateExpiration': '00:10:00' },
    states: [
      { id: 'raiz', root: true, input: {}, outputs: [{ stateId: 'menu' }] },
      {
        id: 'menu',
        input: {},
        outputActions: [{ type: 'SetVariable', settings: { variable: 'visited', value: '{{state.id}}' } }],
        outputs: [{ stateId: 'menu' }],
      },
    ],
  });

  it('sends an inactive user back to the root, and each input renews the session', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const c = context(flow());
    await processInbound(c);
    expect(stateSaved(c.variables, 'fluxo-1')).toBe('menu');

    vi.setSystemTime(new Date('2026-01-01T12:09:00Z'));
    expect((await processInbound(c)).estados[0]!.stateId).toBe('menu');

    vi.setSystemTime(new Date('2026-01-01T12:18:00Z'));
    expect(stateSaved(c.variables, 'fluxo-1')).toBe('menu');
    vi.setSystemTime(new Date('2026-01-01T12:19:01Z'));
    expect(stateSaved(c.variables, 'fluxo-1')).toBeNull();
    const rastro = await processInbound(context(flow(), persisted(c.variables)));
    expect(rastro.estados[0]!.stateId).toBe('raiz');
  });

  it('without the key the state never expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const c = context({ ...flow(), configuration: {} });
    await processInbound(c);
    vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    expect(stateSaved(c.variables, 'fluxo-1')).toBe('menu');
    expect(c.variables[EXPIRATIONS_KEY]).toBeUndefined();
  });
});

describe('builder:actionExecutionTimeout', () => {
  const timeLimitSeen = async (configuration: Record<string, string>): Promise<number> => {
    const c = context({ configuration });
    let timeoutMs = 0;
    c.services.callHttp = async (pedido) => {
      timeoutMs = pedido.timeoutMs;
      return { status: 200, corpo: '' };
    };
    c.flow.states[0]!.outputActions = [{ type: 'ProcessHttp', settings: { uri: 'https://x.test', method: 'GET' } }];
    await processInbound(c);
    return timeoutMs;
  };

  it('replaces the 30 s default, capped by the 60 s input limit', async () => {
    expect(await timeLimitSeen({})).toBe(30_000);
    expect(await timeLimitSeen({ 'builder:actionExecutionTimeout': '00:00:05' })).toBe(5_000);
    expect(await timeLimitSeen({ 'builder:actionExecutionTimeout': '00:05:00' })).toBe(60_000);
    expect(await timeLimitSeen({ 'builder:actionExecutionTimeout': 'nonsense' })).toBe(30_000);
  });
});

describe('SurveyMessage and ForwardMessageToDesk', () => {
  it('sends the survey question with the scale options', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [
      {
        type: 'SurveyMessage',
        settings: {
          type: 'builder-tabs-content.survey.types.chatbotSurvey',
          scale: 'builder-tabs-content.survey.scales.scaleStarOneToThreeNumber',
          surveyContent: 'Como você se sentiu em relação ao atendimento neste canal?',
        },
      },
      {
        type: 'SurveyMessage',
        settings: {
          type: 'builder-tabs-content.survey.types.chatbotSurvey',
          scale: 'builder-tabs-content.survey.scales.scaleStarOneToFive',
          surveyContent: 'Nota?',
        },
      },
      {
        type: 'SurveyMessage',
        settings: {
          type: 'builder-tabs-content.survey.types.recomendationSurvey',
          scale: 'builder-tabs-content.survey.scales.scaleStarOneToFive',
          surveyContent: 'Você recomendaria esse chatbot?',
        },
      },
    ];
    await processInbound(c);
    const options = c.sent.map((m) => (m.conteudo as { options: { text: string }[] }).options.map((o) => o.text));
    expect(c.sent.every((m) => m.tipo === 'application/vnd.lime.select+json')).toBe(true);
    expect((c.sent[0]!.conteudo as { text: string }).text).toBe('Como você se sentiu em relação ao atendimento neste canal?');
    expect(options).toEqual([
      ['1', '2', '3'],
      ['★', '★★', '★★★', '★★★★', '★★★★★'],
      ['Recomendaria', 'Não recomendaria'],
    ]);
  });

  it('ForwardMessageToDesk runs (Pipe already routes messages of an open ticket to Desk)', async () => {
    const c = context();
    c.flow.states[0]!.outputActions = [{ type: 'ForwardMessageToDesk', settings: {} }];
    const rastro = await processInbound(c);
    expect(rastro.estados[0]!.actions).toEqual([{ tipo: 'ForwardMessageToDesk' }]);
    expect(importReport(c.flow).naoSuportado).toEqual({});
  });
});

describe('ticket.* after the handoff', () => {
  it('exposes every field the API returns for the new ticket', async () => {
    const c = context();
    c.services.forwardForAttendance = async () => ({
      id: 'conv-1', sequentialId: 42, status: 'Waiting', team: 'Suporte', customerIdentity: 'contato-1', closed: false,
    });
    c.flow.states[0]!.outputActions = [
      { type: 'ForwardToDesk', settings: {} },
      { type: 'SetVariable', settings: { variable: 'resumo', value: '#{{ticket.sequentialId}} {{ticket.team}} {{ticket.status}} {{ticket.closed}}' } },
    ];
    await processInbound(c);
    expect(c.variables['resumo']).toBe('#42 Suporte Waiting false');
  });
});

describe('LocalTimeZoneEnabled and the bot time zone', () => {
  const zoneOf = async (enabled: boolean, configuration: Record<string, string> = {}): Promise<ScriptRequest> => {
    const c = context({ configuration });
    let request: ScriptRequest | undefined;
    c.services.runScript = async (r) => ((request = r), null);
    c.flow.states[0]!.outputActions = [{
      type: 'ExecuteScript',
      settings: { function: 'run', source: 'function run() { return 1; }', outputVariable: 'x', LocalTimeZoneEnabled: enabled },
    }];
    await processInbound(c);
    return request!;
  };

  it('runs scripts in UTC unless LocalTimeZoneEnabled asks for the bot zone', async () => {
    expect(await zoneOf(false)).toMatchObject({ localTimeZone: false, timeZone: 'UTC' });
    expect(await zoneOf(true)).toMatchObject({ localTimeZone: true, timeZone: 'America/Sao_Paulo' });
    expect(await zoneOf(true, { 'builder:#localTimeZone': 'Pacific SA Standard Time' })).toMatchObject({ timeZone: 'America/Santiago' });
  });

  it('botTimeZone maps Windows ids, accepts IANA ids and falls back to São Paulo', () => {
    expect(botTimeZone(null)).toBe('America/Sao_Paulo');
    expect(botTimeZone({ 'builder:#localTimeZone': 'E. South America Standard Time' })).toBe('America/Sao_Paulo');
    expect(botTimeZone({ 'builder:#localTimeZone': 'America/Manaus' })).toBe('America/Manaus');
    expect(botTimeZone({ 'builder:#localTimeZone': 'Atlantis Standard Time' })).toBe('America/Sao_Paulo');
  });
});

describe('timeSpanSeconds (.NET TimeSpan.Parse)', () => {
  it('reads the forms Blip stores', () => {
    expect(timeSpanSeconds('00:01:30')).toBe(90);
    expect(timeSpanSeconds('8:0')).toBe(8 * 3600);
    expect(timeSpanSeconds('1.02:00:00')).toBe(86_400 + 7200);
    expect(timeSpanSeconds('00:00:01.5')).toBe(1.5);
    expect(timeSpanSeconds('2')).toBe(2 * 86_400);
    expect(timeSpanSeconds('24:00:00')).toBeNull();
    expect(timeSpanSeconds('')).toBeNull();
    expect(timeSpanSeconds(undefined)).toBeNull();
  });
});

describe('export excerpt (desk180326…json)', () => {
  // The export's only SendRawMessage: type and content come from a variable built by a script.
  const flow: FlowBlip = {
    id: 'fluxo-1',
    states: [{
      id: 'raiz',
      root: true,
      input: {},
      outputActions: [
        {
          type: 'ExecuteScript',
          settings: {
            function: 'run',
            source: 'function run() { return {}; }',
            inputVariables: [],
            outputVariable: 'ignored',
            LocalTimeZoneEnabled: false,
          },
        },
        {
          type: 'SendRawMessage',
          settings: {
            metadata: { '#stateName': '{{state.name}}', '#stateId': '{{state.id}}', '#messageId': '{{input.message@id}}' },
            type: '{{messageComponent@type}}',
            rawContent: '{{messageComponent@content}}',
          },
        },
      ],
      outputs: [],
    }],
  };

  it('sends a menu stored in a variable through SendRawMessage and is not reported as unsupported', async () => {
    const menu = { text: 'Escolha', options: [{ order: 1, text: 'Boleto' }, { order: 2, text: 'Pix' }] };
    const c = context(flow, { messageComponent: JSON.stringify({ type: 'application/vnd.lime.select+json', content: menu }) });
    const requests: ScriptRequest[] = [];
    c.services.runScript = async (r) => (requests.push(r), {});
    await processInbound(c);
    expect(requests[0]!.timeZone).toBe('UTC');
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0]).toMatchObject({ tipo: 'application/vnd.lime.select+json', bruto: true });
    expect(JSON.parse(c.sent[0]!.conteudo as string)).toEqual(menu);
    expect(importReport(flow).naoSuportado).toEqual({});
  });

  it('SendRawMessage with a literal MIME the channel sends is supported; one it cannot send is reported', () => {
    const raw = (type: string): FlowBlip => ({
      id: 'f',
      states: [{ id: 'raiz', root: true, outputActions: [{ type: 'SendRawMessage', settings: { type, rawContent: '{}' } }] }],
    });
    expect(importReport(raw('application/vnd.lime.media-link+json')).naoSuportado).toEqual({});
    expect(importReport(raw('application/vnd.lime.collection+json')).naoSuportado).toEqual({
      'conteudo:application/vnd.lime.collection+json': 1,
    });
  });
});
