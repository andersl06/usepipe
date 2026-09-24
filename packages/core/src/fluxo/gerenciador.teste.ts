/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder.UnitTests/FlowManagerTests.cs, OutputConditions/OutputConditionsTests.cs
 * e Actions/ActionConditionsTests.cs
 * — modificado: xUnit/NSubstitute → vitest com um `ServicosDoMotor` falso; onde o
 * original usa `ExecuteScript` para gravar variável, aqui é `SetVariable` (script não
 * existe no Pipe); as asserções olham o contexto e o que saiu, e não chamadas de mock.
 */
import { describe, expect, it } from 'vitest';
import { criarEntrada } from './contexto.js';
import type { Contexto, MensagemDeSaida } from './contexto.js';
import {
  ErroDeProcessamentoDeSaida,
  ErroDoMotor,
  SuspensaoDeProcessHttp,
  processarEntrada,
} from './gerenciador.js';
import type { Acao, Estado, FluxoBlip } from './modelos.js';

const FLUXO_ID = 'f1';
const CHAVE_ESTADO = `stateId@${FLUXO_ID}`;

function servicosFalsos(falharAtendimento = false) {
  const enviadas: MensagemDeSaida[] = [];
  const atendimentos: unknown[] = [];
  const eventos: unknown[] = [];
  return {
    enviadas,
    atendimentos,
    eventos,
    servicos: {
      async enviar(m: MensagemDeSaida) {
        enviadas.push(m);
      },
      async encaminharParaAtendimento(p: unknown) {
        if (falharAtendimento) throw new Error('fila fechada');
        atendimentos.push(p);
        return { id: 'atd-1', status: 'Open' };
      },
      async registrarEvento(e: Record<string, unknown>) {
        eventos.push(e);
      },
    },
  };
}

async function rodar(
  states: Estado[],
  conteudo: unknown,
  opcoes: {
    variaveis?: Record<string, string>;
    tipo?: string;
    falharAtendimento?: boolean;
    contato?: Record<string, unknown>;
  } = {},
) {
  const f = servicosFalsos(opcoes.falharAtendimento);
  const fluxo: FluxoBlip = { id: FLUXO_ID, states };
  const variaveis = opcoes.variaveis ?? {};
  const contexto: Contexto = {
    usuario: 'user@domain',
    fluxo,
    entrada: criarEntrada({ id: 'm1', tipo: opcoes.tipo ?? 'text/plain', conteudo }),
    variaveis,
    entradaContexto: new Map(),
    contato: opcoes.contato ?? null,
    servicos: f.servicos,
  };
  const rastro = await processarEntrada(contexto);
  return { ...f, rastro, variaveis, textos: f.enviadas.map((m) => m.conteudo) };
}

const enviar = (conteudo: string): Acao => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: conteudo },
});
const raiz = (outputs: Estado['outputs'], extra: Partial<Estado> = {}): Estado => ({
  id: 'root',
  root: true,
  input: {},
  outputs,
  ...extra,
});

describe('FlowManager.ProcessInputAsync', () => {
  it('suspende antes do ProcessHttp e retoma depois da ação sem repetir a mensagem anterior', async () => {
    const enviados: string[] = [];
    const fluxo: FluxoBlip = {
      id: FLUXO_ID,
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
    const variaveis: Record<string, string> = { nome: 'Ana' };
    const base = {
      usuario: 'user@domain',
      fluxo,
      entrada: criarEntrada({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
      variaveis,
      entradaContexto: new Map(),
      contato: null,
      servicos: {
        async enviar(m: MensagemDeSaida) { enviados.push(String(m.conteudo)); },
        async encaminharParaAtendimento() { return { id: 'atd-1', status: 'Open' }; },
        async registrarEvento() {},
        async chamarHttp() { return { status: 200, corpo: '{}' }; },
        async suspenderHttp(pedido: unknown, cursor: unknown): Promise<never> {
          throw new SuspensaoDeProcessHttp(pedido as never, cursor as never);
        },
      },
    } satisfies Contexto;

    await expect(processarEntrada(base)).rejects.toMatchObject({ pedido: {
      url: 'https://cliente.test/Ana',
    } });
    expect(enviados).toEqual(['Antes']);

    await processarEntrada({
      ...base,
      entradaContexto: new Map(),
      servicos: {
        ...base.servicos,
        async chamarHttp() { return { status: 200, corpo: '{}' }; },
        async suspenderHttp() { throw new Error('não deveria suspender de novo'); },
      },
    }, {
      retomarProcessHttp: {
        lista: 'conteudo', estadoId: 'root', indice: 1,
        resposta: { status: 200, corpo: '{}' },
      },
    });
    expect(enviados).toEqual(['Antes', 'Depois']);
    expect(variaveis.status).toBe('200');
  });

  it('sem condição troca de estado, manda a mensagem e, sem saída, apaga o estado', async () => {
    const r = await rodar(
      [raiz([{ stateId: 'ping' }]), { id: 'ping', inputActions: [enviar('Pong!')] }],
      'Ping!',
    );
    expect(r.textos).toEqual(['Pong!']);
    expect(r.variaveis[CHAVE_ESTADO]).toBeUndefined();
    expect(r.variaveis[`previous-stateId@${FLUXO_ID}`]).toBe('ping');
    expect(r.rastro.estados.map((e) => e.estadoId)).toEqual(['root', 'ping']);
  });

  it('troca a variável do texto pelo valor', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{variableName1}}!')] },
      ],
      'Ping!',
      {
        variaveis: { variableName1: 'OutputVariable value 1' },
      },
    );
    expect(r.textos).toEqual(['Hello OutputVariable value 1!']);
  });

  it('variável com JSON é escapada e trocada sem quebrar as configurações', async () => {
    const valor = '{"propertyName1":"propertyValue1","propertyName2":2}';
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{variableName1}}!')] },
      ],
      'Ping!',
      {
        variaveis: { variableName1: valor },
      },
    );
    expect(r.textos).toEqual([`Hello ${valor}!`]);
  });

  it('variável que não existe vira vazio', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('Hello {{context.variableName1}}!')] },
      ],
      'Ping!',
    );
    expect(r.textos).toEqual(['Hello !']);
  });

  it('propriedade de variável JSON com @', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [enviar('{{pedido@cliente.nome}}')] },
      ],
      'x',
      {
        variaveis: { pedido: '{"cliente":{"nome":"Ana"}}' },
      },
    );
    expect(r.textos).toEqual(['Ana']);
  });

  it('TrackEvent com fonte de variável inválida quebra o processamento', async () => {
    const erro = await rodar(
      [
        raiz(null, {
          outputActions: [
            { type: 'TrackEvent', settings: { category: 'c', action: '{{variable.doesntExist}}' } },
          ],
        }),
      ],
      'Ping!',
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoMotor);
    expect((erro as Error).message).toContain('TrackEvent');
  });

  it('onze transições sem entrada estouram o limite de 10 (MaxTransitionsByInput)', async () => {
    const estados: Estado[] = [raiz([{ stateId: 't2' }])];
    for (let i = 2; i <= 10; i++)
      estados.push({ id: `t${i}`, outputs: [{ stateId: `t${i + 1}` }] });
    estados.push({ id: 't11' });
    const erro = await rodar(estados, 'Ping!').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoMotor);
    expect((erro as Error).message).toContain('limite de 10 transições');
  });

  it('input.variable grava a entrada no contexto', async () => {
    const r = await rodar([{ id: 'root', root: true, input: { variable: 'MyVariable' } }], 'Ping!');
    expect(r.variaveis['MyVariable']).toBe('Ping!');
    expect(r.variaveis[CHAVE_ESTADO]).toBeUndefined();
  });

  it('estado com bypass não grava input.variable', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'first' }]),
        { id: 'first', input: { bypass: true, variable: 'MyVariable' } },
      ],
      'Ping!',
    );
    expect(r.variaveis['MyVariable']).toBeUndefined();
  });

  it('{{contact.name}} vem do contato', async () => {
    const r = await rodar(
      [
        raiz([{ stateId: 'welcome' }]),
        { id: 'welcome', inputActions: [enviar('Hello, {{contact.name}}')] },
      ],
      'Hi!',
      {
        contato: { name: 'Bob' },
      },
    );
    expect(r.textos).toEqual(['Hello, Bob']);
  });

  it('condição de contexto escolhe a saída', async () => {
    const estados: Estado[] = [
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
    expect(r.variaveis['Word']).toBe('Ping!');
  });

  const estadosComCondicaoDeEntrada = (valor: string): Estado[] => [
    raiz([{ stateId: 'Start' }]),
    {
      id: 'Start',
      input: { conditions: [{ source: 'context', variable: 'InputIsValid', values: ['true'] }] },
      inputActions: [{ type: 'SetVariable', settings: { variable: 'InputIsValid', value: valor } }],
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

  it('condição de entrada satisfeita: fica no estado esperando', async () => {
    const r = await rodar(estadosComCondicaoDeEntrada('true'), 'OK!');
    expect(r.variaveis[CHAVE_ESTADO]).toBe('Start');
    expect(r.textos).toEqual([]);
  });

  it('condição de entrada não satisfeita: não espera, segue pelas saídas', async () => {
    const r = await rodar(estadosComCondicaoDeEntrada('false'), 'NOK!');
    expect(r.textos).toEqual(['NOK']);
    expect(r.variaveis[CHAVE_ESTADO]).toBeUndefined();
  });

  it('duas entradas em sequência com o mesmo contexto', async () => {
    const estados: Estado[] = [
      raiz([
        { stateId: 'marco', conditions: [{ values: ['Marco!'] }] },
        { stateId: 'ping', conditions: [{ values: ['Ping!'] }] },
      ]),
      { id: 'ping', inputActions: [enviar('Pong!')] },
      { id: 'marco', inputActions: [enviar('Polo!')] },
    ];
    const variaveis: Record<string, string> = {};
    const a = await rodar(estados, 'Ping!', { variaveis });
    const b = await rodar(estados, 'Marco!', { variaveis });
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
    expect(r.rastro.estados[1]!.acoes[0]).toMatchObject({ tipo: 'SetVariable', esquecida: true });
  });

  it('sem continueOnError a ação que falhou quebra o processamento', async () => {
    const erro = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [{ type: 'SetVariable', settings: {} }] },
      ],
      'Ping!',
    ).catch((e: unknown) => e);
    expect((erro as Error).message).toContain("ação 'SetVariable' falhou");
  });

  it('ação sem implementação no Pipe (ExecuteScript) quebra o processamento', async () => {
    const erro = await rodar(
      [
        raiz([{ stateId: 'ping' }]),
        { id: 'ping', inputActions: [{ type: 'ExecuteScript', settings: {} }] },
      ],
      'x',
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoMotor);
    expect((erro as Error).message).toContain("'ExecuteScript' não existe no Pipe");
  });

  it('validação de entrada: fora da regra manda o erro e fica no estado', async () => {
    const estados: Estado[] = [
      raiz([{ stateId: 'idade' }]),
      {
        id: 'idade',
        inputActions: [enviar('Qual a sua idade?')],
        input: { variable: 'idade', validation: { rule: 'number', error: 'Só números.' } },
        outputs: [{ stateId: 'fim' }],
      },
      { id: 'fim', inputActions: [enviar('Obrigado.')] },
    ];
    const variaveis: Record<string, string> = {};
    await rodar(estados, 'oi', { variaveis });
    const errado = await rodar(estados, 'vinte', { variaveis });
    expect(errado.textos).toEqual(['Só números.']);
    expect(variaveis[CHAVE_ESTADO]).toBe('idade');
    const certo = await rodar(estados, '20', { variaveis });
    expect(certo.textos).toEqual(['Obrigado.']);
    expect(variaveis['idade']).toBe('20');
  });
});

describe('OutputConditions', () => {
  const pingMarco: Estado[] = [
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

  it('nenhuma saída casa: apaga o estado e não manda nada', async () => {
    const r = await rodar(pingMarco, 'XPTO!', { variaveis: { [CHAVE_ESTADO]: 'root' } });
    expect(r.textos).toEqual([]);
    expect(r.variaveis[CHAVE_ESTADO]).toBeUndefined();
  });

  it('matches sobre variável de contexto', async () => {
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

  const estadoPorVariavel: Estado[] = [
    raiz([
      { stateId: '{{variableWithState}}', conditions: [{ source: 'input', comparison: 'exists' }] },
    ]),
    { id: 'state2' },
  ];

  it('destino {{variável}} vai para o estado que a variável diz', async () => {
    const r = await rodar(estadoPorVariavel, 'hello', {
      variaveis: { variableWithState: 'state2' },
    });
    expect(r.rastro.estados.map((e) => e.estadoId)).toEqual(['root', 'state2']);
  });

  it.each([[undefined], [''], ['  '], ['inexistent state']])(
    'destino {{variável}} inválido (%s) é erro',
    async (valor) => {
      const variaveis: Record<string, string> =
        valor === undefined ? {} : { variableWithState: valor };
      const erro = await rodar(estadoPorVariavel, 'hello', { variaveis }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDoMotor);
      expect((erro as ErroDoMotor).cause).toBeInstanceOf(ErroDeProcessamentoDeSaida);
    },
  );
});

describe('ActionConditions', () => {
  const doisEstados = (acoes: Partial<Estado>, onde: 'root' | 'ping'): Estado[] => [
    raiz(
      [
        { stateId: 'ping', conditions: [{ values: ['Ping!'] }] },
        { stateId: 'pong', conditions: [{ values: ['Pong!'] }] },
      ],
      onde === 'root' ? acoes : {},
    ),
    {
      id: 'ping',
        input: {},
      outputs: [{ stateId: 'pong', conditions: [{ values: ['Pong!'] }] }],
      ...(onde === 'ping' ? acoes : {}),
    },
    { id: 'pong', input: {}, outputs: [{ stateId: 'ping', conditions: [{ values: ['Ping!'] }] }] },
  ];
  const marcar = (nome: string, valor: string): Acao => ({
    type: 'SetVariable',
    settings: { variable: nome, value: 'sim' },
    conditions: [{ values: [valor] }],
  });

  it('ação de entrada só roda quando a condição casa', async () => {
    const r = await rodar(
      doisEstados(
        { inputActions: [marcar('primeira', 'Ping!'), marcar('outra', 'Other!')] },
        'ping',
      ),
      'Ping!',
    );
    expect(r.variaveis['primeira']).toBe('sim');
    expect(r.variaveis['outra']).toBeUndefined();
  });

  it('ação de saída só roda quando a condição casa', async () => {
    const r = await rodar(
      doisEstados(
        { outputActions: [marcar('primeira', 'Ping!'), marcar('outra', 'Other!')] },
        'root',
      ),
      'Ping!',
    );
    expect(r.variaveis['primeira']).toBe('sim');
    expect(r.variaveis['outra']).toBeUndefined();
  });

  it('ação de "depois de trocar de estado" roda no estado que saiu', async () => {
    const r = await rodar(
      doisEstados({ afterStateChangedActions: [marcar('trocou', 'Ping!')] }, 'root'),
      'Ping!',
    );
    expect(r.variaveis['trocou']).toBe('sim');
  });
});

describe('bloco de atendimento (desk:) como o editor da Blip monta', () => {
  const deskStates: Estado[] = [
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

  it('encaminha e fica calado no desk: esperando o fim do atendimento', async () => {
    const r = await rodar(deskStates, 'quero falar com alguém');
    expect(r.atendimentos).toHaveLength(1);
    expect(r.variaveis['desk_forwardToDeskState_status']).toBe('Success');
    expect(r.variaveis[CHAVE_ESTADO]).toBe('desk:suporte');
    expect(r.textos).toEqual([]);
  });

  it('o ticket encerrado pelo atendente é a entrada que destrava o bloco', async () => {
    const variaveis: Record<string, string> = {};
    await rodar(deskStates, 'quero falar com alguém', { variaveis });
    const r = await rodar(
      deskStates,
      { id: 'atd-1', status: 'ClosedAttendant' },
      { variaveis, tipo: 'application/vnd.iris.ticket+json' },
    );
    expect(r.textos).toEqual(['Atendimento encerrado.']);
    expect(variaveis[CHAVE_ESTADO]).toBe('pos');
  });

  it('encaminhamento que falha vira Error e segue pela saída padrão do atendimento', async () => {
    const r = await rodar(deskStates, 'quero falar com alguém', { falharAtendimento: true });
    expect(r.variaveis['desk_forwardToDeskState_status']).toBe('Error');
    expect(r.textos).toEqual(['Sem atendente agora.']);
  });
});

describe('Redirect (serviço do roteador)', () => {
  const redirecionar = (address: string): Estado[] => [
    raiz([{ stateId: 'vai' }]),
    {
      id: 'vai',
      inputActions: [
        { type: 'Redirect', settings: { address, context: { type: 'text/plain', value: 'x' } } },
      ],
      input: {},
    },
  ];

  it('pede ao roteador o serviço pelo nome, com o contexto junto', async () => {
    const pedidos: unknown[] = [];
    const f = servicosFalsos();
    const contexto: Contexto = {
      usuario: 'user@domain',
      fluxo: { id: FLUXO_ID, states: redirecionar('{{destino}}') },
      entrada: criarEntrada({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
      variaveis: { destino: 'suporte' },
      entradaContexto: new Map(),
      servicos: {
        ...f.servicos,
        async redirecionar(p) {
          pedidos.push(p);
        },
      },
    };
    await processarEntrada(contexto);
    expect(pedidos).toEqual([
      { endereco: 'suporte', contexto: { type: 'text/plain', value: 'x' } },
    ]);
  });

  it('fora do roteador, o Redirect falha — na Blip vai para o bloco de exceções', async () => {
    await expect(rodar(redirecionar('suporte'), 'oi')).rejects.toBeInstanceOf(ErroDoMotor);
  });

  it('sem address, falha antes de redirecionar', async () => {
    await expect(rodar(redirecionar('  '), 'oi')).rejects.toThrow(/address/);
  });
});
