/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder.UnitTests/FlowManagerTests.cs, OutputConditions/OutputConditionsTests.cs
 * e Actions/ActionConditionsTests.cs
 * — modificado: xUnit/NSubstitute → vitest com um `ServicosDoMotor` falso; onde o
 * original usa `ExecuteScript` para gravar variável, aqui é `SetVariable` (script não
 * existe no Pipe); as asserções olham o contexto e o que saiu, e não chamadas de mock.
 */
import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import {
  ProcessingOutputError,
  MotorError,
  SuspensaoDeProcessHttp,
  processarInbound,
} from './manager.js';
import type { Acao, State, FlowBlip } from './modelos.js';

const FLOW_ID = 'f1';
const KEY_STATE = `stateId@${FLOW_ID}`;

function servicosFalsos(falharAttendance = false) {
  const enviadas: OutputMessage[] = [];
  const attendances: unknown[] = [];
  const eventos: unknown[] = [];
  return {
    enviadas,
    attendances,
    eventos,
    servicos: {
      async send(m: OutputMessage) {
        enviadas.push(m);
      },
      async encaminharForAttendance(p: unknown) {
        if (falharAttendance) throw new Error('fila fechada');
        attendances.push(p);
        return { id: 'atd-1', status: 'Open' };
      },
      async registerEvent(e: Record<string, unknown>) {
        eventos.push(e);
      },
    },
  };
}

async function rodar(
  states: State[],
  conteudo: unknown,
  options: {
    variables?: Record<string, string>;
    tipo?: string;
    falharAttendance?: boolean;
    contact?: Record<string, unknown>;
  } = {},
) {
  const f = servicosFalsos(options.falharAttendance);
  const flow: FlowBlip = { id: FLOW_ID, states };
  const variables = options.variables ?? {};
  const context: Context = {
    user: 'user@domain',
    flow,
    inbound: createInbound({ id: 'm1', tipo: options.tipo ?? 'text/plain', conteudo }),
    variables,
    inboundContext: new Map(),
    contact: options.contact ?? null,
    services: f.servicos,
  };
  const rastro = await processarInbound(context);
  return { ...f, rastro, variables, textos: f.enviadas.map((m) => m.conteudo) };
}

const enviar = (conteudo: string): Acao => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: conteudo },
});
const raiz = (outputs: State['outputs'], extra: Partial<State> = {}): State => ({
  id: 'root',
  root: true,
  input: {},
  outputs,
  ...extra,
});

describe('FlowManager.ProcessInputAsync', () => {
  it('suspends before ProcessHttp and resumes after the action without repeating the previous message', async () => {
    const enviados: string[] = [];
    const flow: FlowBlip = {
      id: FLOW_ID,
      states: [{
        id: 'root',
        root: true,
        input: {},
        outputActions: [enviar('Antes'), {
          type: 'ProcessHttp',
          settings: { uri: 'https://cliente.test/{{nome}}', responseStatusVariable: 'status' },
        }, enviar('Depois')],
        outputs: [],
      }],
    };
    const variables: Record<string, string> = { nome: 'Ana' };
    const base = {
      user: 'user@domain',
      flow,
      inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
      variables,
      inboundContext: new Map(),
      contact: null,
      services: {
        async send(m: OutputMessage) { enviados.push(String(m.conteudo)); },
        async encaminharForAttendance() { return { id: 'atd-1', status: 'Open' }; },
        async registerEvent() {},
        async callHttp() { return { status: 200, corpo: '{}' }; },
        async suspendHttp(pedido: unknown, cursor: unknown): Promise<never> {
          throw new SuspensaoDeProcessHttp(pedido as never, cursor as never);
        },
      },
    } satisfies Context;

    await expect(processarInbound(base)).rejects.toMatchObject({ pedido: {
      url: 'https://cliente.test/Ana',
    } });
    expect(enviados).toEqual(['Antes']);

    await processarInbound({
      ...base,
      inboundContext: new Map(),
      services: {
        ...base.services,
        async callHttp() { return { status: 200, corpo: '{}' }; },
        async suspendHttp() { throw new Error('não deveria suspender de novo'); },
      },
    }, {
      retomarProcessHttp: {
        lista: 'conteudo', estadoId: 'root', indice: 1,
        resposta: { status: 200, corpo: '{}' },
      },
    });
    expect(enviados).toEqual(['Antes', 'Depois']);
    expect(variables.status).toBe('200');
  });

  it('with no condition it changes state, sends the message, and with no output it clears the state', async () => {
    const r = await rodar(
      [raiz([{ stateId: 'ping' }]), { id: 'ping', inputActions: [enviar('Pong!')] }],
      'Ping!',
    );
    expect(r.textos).toEqual(['Pong!']);
    expect(r.variables[KEY_STATE]).toBeUndefined();
    expect(r.variables[`previous-stateId@${FLOW_ID}`]).toBe('ping');
    expect(r.rastro.estados.map((e) => e.stateId)).toEqual(['root', 'ping']);
  });

  it('replaces the text variable with the value', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{variableName1}}!')] },
      ],
      'Ping!',
      {
        variables: { variableName1: 'OutputVariable value 1' },
      },
    );
    expect(r.textos).toEqual(['Hello OutputVariable value 1!']);
  });

  it('a variable with JSON is escaped and swapped without breaking the settings', async () => {
    const value = '{"propertyName1":"propertyValue1","propertyName2":2}';
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{variableName1}}!')] },
      ],
      'Ping!',
      {
        variables: { variableName1: value },
      },
    );
    expect(r.textos).toEqual([`Hello ${value}!`]);
  });

  it('a variable that does not exist becomes empty', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{context.variableName1}}!')] },
      ],
      'Ping!',
    );
    expect(r.textos).toEqual(['Hello !']);
  });

  it('JSON variable property with @', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('{{pedido@cliente.nome}}')] },
      ],
      'x',
      {
        variables: { pedido: '{"cliente":{"nome":"Ana"}}' },
      },
    );
    expect(r.textos).toEqual(['Ana']);
  });

  it('TrackEvent with an invalid variable source breaks processing', async () => {
    const error = await rodar(
      [
        raiz(null, {
          outputActions: [
            { type: 'TrackEvent', settings: { category: 'c', action: '{{variable.doesntExist}}' } },
          ],
        }),
      ],
      'Ping!',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MotorError);
    expect((error as Error).message).toContain('TrackEvent');
  });

  it('eleven transitions without input exceed the limit of 10 (MaxTransitionsByInput)', async () => {
    const estados: State[] = [raiz([{ stateId: 't2' }])];
    for (let i = 2; i <= 10; i++)
      estados.push({ id: `t${i}`, outputs: [{ stateId: `t${i + 1}` }] });
    estados.push({ id: 't11' });
    const error = await rodar(estados, 'Ping!').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MotorError);
    expect((error as Error).message).toContain('limite de 10 transições');
  });

  it('input.variable stores the input in the context', async () => {
    const r = await rodar([{ id: 'root', root: true, input: { variable: 'MyVariable' } }], 'Ping!');
    expect(r.variables['MyVariable']).toBe('Ping!');
    expect(r.variables[KEY_STATE]).toBeUndefined();
  });

  it('a state with bypass does not write input.variable', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'first' }]),
        { id: 'first', input: { bypass: true, variable: 'MyVariable' } },
      ],
      'Ping!',
    );
    expect(r.variables['MyVariable']).toBeUndefined();
  });

  it('{{contact.name}} comes from the contact', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'welcome' }]),
        { id: 'welcome', inputActions: [enviar('Hello, {{contact.name}}')] },
      ],
      'Hi!',
      {
        contact: { name: 'Bob' },
      },
    );
    expect(r.textos).toEqual(['Hello, Bob']);
  });

  it('a context condition picks the output', async () => {
    const estados: State[] = [
      raiz(
        [
          {
            stateId: 'marco',
            conditions: [{ source: 'context', variable: 'Word', values: ['Marco!'] }],
          },
          {
            stateId: 'ping',
            conditions: [{ source: 'context', variable: 'Word', values: ['Ping!'] }],
          },
        ],
        { input: { variable: 'Word' } },
      ),
      { id: 'ping', inputActions: [enviar('Pong!')] },
      { id: 'marco', inputActions: [enviar('Polo!')] },
    ];
    const r = await rodar(estados, 'Ping!');
    expect(r.textos).toEqual(['Pong!']);
    expect(r.variables['Word']).toBe('Ping!');
  });

  const inboundStatesWithCondition = (value: string): State[] => [
    raiz([{ stateId: 'Start' }]),
    {
      id: 'Start',
      input: { conditions: [{ source: 'context', variable: 'InputIsValid', values: ['true'] }] },
      inputActions: [{ type: 'SetVariable', settings: { variable: 'InputIsValid', value: value } }],
      outputs: [
        {
          stateId: 'Ok',
          conditions: [{ source: 'context', variable: 'InputIsValid', values: ['true'] }],
        },
        {
          stateId: 'NOk',
          conditions: [{ source: 'context', variable: 'InputIsValid', values: ['false'] }],
        },
        { stateId: 'error' },
      ],
    },
    { id: 'Ok', inputActions: [enviar('OK')] },
    { id: 'NOk', inputActions: [enviar('NOK')] },
    { id: 'error', inputActions: [enviar('failed to set variable')] },
  ];

  it('met entry condition: it stays in the waiting state', async () => {
    const r = await rodar(inboundStatesWithCondition('true'), 'OK!');
    expect(r.variables[KEY_STATE]).toBe('Start');
    expect(r.textos).toEqual([]);
  });

  it('unmet entry condition: it does not wait, it follows the outputs', async () => {
    const r = await rodar(inboundStatesWithCondition('false'), 'NOK!');
    expect(r.textos).toEqual(['NOK']);
    expect(r.variables[KEY_STATE]).toBeUndefined();
  });

  it('two entries in sequence with the same context', async () => {
    const estados: State[] = [
      raiz([
        { stateId: 'marco', conditions: [{ values: ['Marco!'] }] },
        { stateId: 'ping', conditions: [{ values: ['Ping!'] }] },
      ]),
      { id: 'ping', inputActions: [enviar('Pong!')] },
      { id: 'marco', inputActions: [enviar('Polo!')] },
    ];
    const variables: Record<string, string> = {};
    const a = await rodar(estados, 'Ping!', { variables });
    const b = await rodar(estados, 'Marco!', { variables });
    expect([...a.textos, ...b.textos]).toEqual(['Pong!', 'Polo!']);
  });

  it('continueOnError esquece a ação que falhou e segue', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        {
          id: 'ping',
          inputActions: [
            { type: 'SetVariable', settings: {}, continueOnError: true },
            enviar('Pong!'),
          ],
        },
      ],
      'Ping!',
    );
    expect(r.textos).toEqual(['Pong!']);
    expect(r.rastro.estados[1]!.actions[0]).toMatchObject({ tipo: 'SetVariable', esquecida: true });
  });

  it('without continueOnError, the action that failed breaks processing', async () => {
    const error = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [{ type: 'SetVariable', settings: {} }] },
      ],
      'Ping!',
    ).catch((e: unknown) => e);
    expect((error as Error).message).toContain("ação 'SetVariable' falhou");
  });

  it('an action with no implementation in Pipe (ExecuteScript) breaks processing', async () => {
    const error = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [{ type: 'ExecuteScript', settings: {} }] },
      ],
      'x',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MotorError);
    expect((error as Error).message).toContain("'ExecuteScript' não existe no Pipe");
  });

  it('entry validation: outside the rule it sends the error and stays in the state', async () => {
    const estados: State[] = [
      raiz([{ stateId: 'idade' }]),
      {
        id: 'idade',
        inputActions: [enviar('Qual a sua idade?')],
        input: { variable: 'idade', validation: { rule: 'number', error: 'Só números.' } },
        outputs: [{ stateId: 'fim' }],
      },
      { id: 'fim', inputActions: [enviar('Obrigado.')] },
    ];
    const variables: Record<string, string> = {};
    await rodar(estados, 'oi', { variables });
    const errado = await rodar(estados, 'vinte', { variables });
    expect(errado.textos).toEqual(['Só números.']);
    expect(variables[KEY_STATE]).toBe('idade');
    const certo = await rodar(estados, '20', { variables });
    expect(certo.textos).toEqual(['Obrigado.']);
    expect(variables['idade']).toBe('20');
  });
});

describe('OutputConditions', () => {
  const pingMarco: State[] = [
    raiz([
      { stateId: 'marco', conditions: [{ values: ['Marco!'] }] },
      { stateId: 'ping', conditions: [{ values: ['Ping!'] }] },
    ]),
    { id: 'ping', inputActions: [enviar('Pong!')] },
    { id: 'marco', inputActions: [enviar('Polo!')] },
  ];

  it('a saída que casa vence', async () => {
    const r = await rodar(pingMarco, 'Ping!');
    expect(r.textos).toEqual(['Pong!']);
  });

  it('no output matches: it clears the state and sends nothing', async () => {
    const r = await rodar(pingMarco, 'XPTO!', { variables: { [KEY_STATE]: 'root' } });
    expect(r.textos).toEqual([]);
    expect(r.variables[KEY_STATE]).toBeUndefined();
  });

  it('matches over a context variable', async () => {
    const r = await rodar(
      [
        raiz(
          [
            {
              stateId: 'state2',
              conditions: [
                {
                  source: 'context',
                  comparison: 'matches',
                  variable: 'MyVariable',
                  values: ['(Ping!)'],
                },
              ],
            },
          ],
          {
            input: { variable: 'MyVariable' },
          },
        ),
        { id: 'state2', inputActions: [enviar('Pong!')] },
      ],
      'Ping!',
    );
    expect(r.textos).toEqual(['Pong!']);
  });

  const stateByVariable: State[] = [
    raiz([
      { stateId: '{{variableWithState}}', conditions: [{ source: 'input', comparison: 'exists' }] },
    ]),
    { id: 'state2' },
  ];

  it('a {{variable}} destination goes to the state the variable names', async () => {
    const r = await rodar(stateByVariable, 'hello', {
      variables: { variableWithState: 'state2' },
    });
    expect(r.rastro.estados.map((e) => e.stateId)).toEqual(['root', 'state2']);
  });

  it.each([[undefined], [''], ['  '], ['inexistent state']])(
    'destino {{variável}} inválido (%s) é erro',
    async (value) => {
      const variables: Record<string, string> =
        value === undefined ? {} : { variableWithState: value };
      const error = await rodar(stateByVariable, 'hello', { variables }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MotorError);
      expect((error as MotorError).cause).toBeInstanceOf(ProcessingOutputError);
    },
  );
});

describe('ActionConditions', () => {
  const doisEstados = (actions: Partial<State>, onde: 'root' | 'ping'): State[] => [
    raiz(
      [
        { stateId: 'ping', conditions: [{ values: ['Ping!'] }] },
        { stateId: 'pong', conditions: [{ values: ['Pong!'] }] },
      ],
      onde === 'root' ? actions : {},
    ),
    {
      id: 'ping',
        input: {},
      outputs: [{ stateId: 'pong', conditions: [{ values: ['Pong!'] }] }],
      ...(onde === 'ping' ? actions : {}),
    },
    { id: 'pong', input: {}, outputs: [{ stateId: 'ping', conditions: [{ values: ['Ping!'] }] }] },
  ];
  const marcar = (nome: string, value: string): Acao => ({
    type: 'SetVariable',
    settings: { variable: nome, value: 'sim' },
    conditions: [{ values: [value] }],
  });

  it('the entry action only runs when the condition matches', async () => {
    const r = await rodar(
      doisEstados(
        { inputActions: [marcar('primeira', 'Ping!'), marcar('outra', 'Other!')] },
        'ping',
      ),
      'Ping!',
    );
    expect(r.variables['primeira']).toBe('sim');
    expect(r.variables['outra']).toBeUndefined();
  });

  it('the exit action only runs when the condition matches', async () => {
    const r = await rodar(
      doisEstados(
        { outputActions: [marcar('primeira', 'Ping!'), marcar('outra', 'Other!')] },
        'root',
      ),
      'Ping!',
    );
    expect(r.variables['primeira']).toBe('sim');
    expect(r.variables['outra']).toBeUndefined();
  });

  it('the "after state change" action runs in the state that was exited', async () => {
    const r = await rodar(
      doisEstados({ afterStateChangedActions: [marcar('trocou', 'Ping!')] }, 'root'),
      'Ping!',
    );
    expect(r.variables['trocou']).toBe('sim');
  });
});

describe('attendance block (desk:) the way Blip\'s editor builds it', () => {
  const deskStates: State[] = [
    raiz([{ stateId: 'desk:suporte' }]),
    {
      id: 'desk:suporte',
      inputActions: [{ type: 'ForwardToDesk', settings: {} }],
      input: {
        conditions: [
          { source: 'context', variable: 'desk_forwardToDeskState_status', values: ['Success'] },
        ],
      },
      afterStateChangedActions: [{ type: 'LeavingFromDesk', settings: {} }],
      outputs: [
        {
          order: 0,
          stateId: 'pos',
          conditions: [
            {
              source: 'context',
              variable: 'input.type',
              values: ['application/vnd.iris.ticket+json'],
            },
            { source: 'context', variable: 'input.content@status', values: ['ClosedAttendant'] },
          ],
        },
        {
          order: 1,
          stateId: 'erro',
          conditions: [
            { source: 'context', variable: 'desk_forwardToDeskState_status', values: ['Error'] },
          ],
        },
        { order: 2, stateId: 'root' },
      ],
    },
    { id: 'pos', inputActions: [enviar('Atendimento encerrado.')], input: {} },
    { id: 'erro', inputActions: [enviar('Sem atendente agora.')] },
  ];

  it('forwards and stays silent on the desk: waiting for attendance to end', async () => {
    const r = await rodar(deskStates, 'quero falar com alguém');
    expect(r.attendances).toHaveLength(1);
    expect(r.variables['desk_forwardToDeskState_status']).toBe('Success');
    expect(r.variables[KEY_STATE]).toBe('desk:suporte');
    expect(r.textos).toEqual([]);
  });

  it('the ticket closed by the agent is the entry that unblocks the block', async () => {
    const variables: Record<string, string> = {};
    await rodar(deskStates, 'quero falar com alguém', { variables });
    const r = await rodar(
      deskStates,
      { id: 'atd-1', status: 'ClosedAttendant' },
      { variables, tipo: 'application/vnd.iris.ticket+json' },
    );
    expect(r.textos).toEqual(['Atendimento encerrado.']);
    expect(variables[KEY_STATE]).toBe('pos');
  });

  it('a forwarding failure becomes Error and follows attendance\'s default output', async () => {
    const r = await rodar(deskStates, 'quero falar com alguém', { falharAttendance: true });
    expect(r.variables['desk_forwardToDeskState_status']).toBe('Error');
    expect(r.textos).toEqual(['Sem atendente agora.']);
  });
});

describe('Redirect (router service)', () => {
  const redirecionar = (address: string): State[] => [
    raiz([{ stateId: 'vai' }]),
    {
      id: 'vai',
      inputActions: [
        { type: 'Redirect', settings: { address, context: { type: 'text/plain', value: 'x' } } },
      ],
      input: {},
    },
  ];

  it('asks the router for the service by name, along with the context', async () => {
    const pedidos: unknown[] = [];
    const f = servicosFalsos();
    const context: Context = {
      user: 'user@domain',
      flow: { id: FLOW_ID, states: redirecionar('{{destino}}') },
      inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
      variables: { destino: 'suporte' },
      inboundContext: new Map(),
      services: {
        ...f.servicos,
        async redirect(p) {
          pedidos.push(p);
        },
      },
    };
    await processarInbound(context);
    expect(pedidos).toEqual([
      { endereco: 'suporte', contexto: { type: 'text/plain', value: 'x' } },
    ]);
  });

  it('outside the router, Redirect fails — in Blip it goes to the exceptions block', async () => {
    await expect(rodar(redirecionar('suporte'), 'oi')).rejects.toBeInstanceOf(MotorError);
  });

  it('sem address, falha antes de redirecionar', async () => {
    await expect(rodar(redirecionar('  '), 'oi')).rejects.toThrow(/address/);
  });
});
