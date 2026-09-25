import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import {
  converterDoEditor,
  ehExportDoEditor,
  blipReadFlow,
  importReport,
} from './editor.js';
import type { ExportDoEditor } from './editor.js';
import { processarInbound } from './manager.js';
import { validateFlow } from './modelos.js';
import type { FlowBlip } from './modelos.js';
import fixture from './fixtures/editor-sintetico.json' with { type: 'json' };

/** Fixture sintética, no formato do editor do Builder — nada de fluxo de cliente. */
const exportado = fixture as unknown as ExportDoEditor;
const copia = (): ExportDoEditor => JSON.parse(JSON.stringify(exportado)) as ExportDoEditor;

describe('importador do export do editor da Blip', () => {
  const flow = converterDoEditor(exportado, 'f1');
  const state = (id: string) => flow.states.find((s) => s.id === id)!;

  it('recognizes both the editor\'s export and the published flow', () => {
    expect(ehExportDoEditor(exportado)).toBe(true);
    expect(ehExportDoEditor({ settings: { flow: flow } })).toBe(false);
  });

  it('converts to the published format, and the result passes the engine\'s validation', () => {
    expect(flow.states).toHaveLength(7);
    expect(() => validateFlow(flow)).not.toThrow();
  });

  it('the entry action comes before the content, and input becomes `input`', () => {
    expect(state('boas-vindas').inputActions!.map((a) => a.type)).toEqual([
      'TrackEvent',
      'SendMessage',
      'SendMessage',
    ]);
    expect(state('boas-vindas').input).toEqual({ bypass: false, variable: 'nome' });
  });

  it('outputs with a condition in order, and the default output last, without a condition', () => {
    expect(state('menu').outputs).toEqual([
      {
        order: 0,
        stateId: 'financeiro',
        conditions: [{ source: 'input', comparison: 'equals', values: ['1', 'Financeiro'] }],
      },
      {
        order: 1,
        stateId: 'desk:suporte',
        conditions: [{ source: 'input', comparison: 'equals', values: ['2', 'Suporte'] }],
      },
      { order: 2, stateId: 'nao-entendi' },
    ]);
  });

  it('an output with no destination (a freshly created attendance block) does not become a transition', () => {
    const e = copia();
    const desk = e.flow['desk:suporte']!;
    desk.$conditionOutputs = [
      { $isDeskOutput: true, conditions: [{ source: 'context', variable: 'x', values: ['1'] }] },
      { stateId: '', conditions: [] },
      ...desk.$conditionOutputs!,
    ];
    const convertido = converterDoEditor(e, 'f1');
    const saidas = convertido.states.find((s) => s.id === 'desk:suporte')!.outputs!;
    expect(saidas.map((s) => s.stateId)).toEqual(['pos-atendimento', 'nao-entendi', 'onboarding']);
    expect(saidas.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(() => validateFlow(convertido)).not.toThrow();
  });

  it('as chaves do editor ($invalid, $cardContent, $connId…) não passam, e $title vira name', () => {
    const texto = JSON.stringify(flow);
    for (const key of [
      '$invalid',
      '$cardContent',
      '$connId',
      '$typeOfContent',
      'typeOfStateId',
    ]) {
      expect(texto).not.toContain(key);
    }
    expect(state('menu')['name']).toBe('Menu');
    expect(state('menu').outputActions![0]).toMatchObject({
      id: 's1',
      $title: 'Guarda a opção',
      type: 'SetVariable',
    });
  });

  it('the published version is read as-is (identity), only with the importer\'s id', () => {
    const publicado: FlowBlip = { id: 'outro', states: flow.states };
    expect(blipReadFlow({ settings: { flow: publicado } }, 'meu').states).toBe(flow.states);
    expect(blipReadFlow(publicado, 'meu').id).toBe('meu');
    expect(() => blipReadFlow({ nada: 1 }, 'x')).toThrow('não é um fluxo da Blip');
  });

  it('report: the synthetic flow has nothing outside of support', () => {
    const r = importReport(flow);
    expect(r.estados).toBe(7);
    expect(r.saidas).toBe(11);
    expect(r.naoSuportado).toEqual({});
    expect(r.semEfeito).toEqual({
      'conteudo:application/vnd.lime.chatstate+json': 1,
      'acao:LeavingFromDesk': 1,
    });
    expect(r.actions['SendMessage']).toBe(6);
  });

  it('report: lists by type what Pipe does not execute, without discarding anything', () => {
    const e = copia();
    const menu = e.flow['menu']!;
    menu.$enteringCustomActions = [
      { type: 'ExecuteScript', settings: { source: 'function run(){}', outputVariable: 'x' } },
      { type: 'ProcessHttp', settings: { uri: 'https://exemplo.invalido', method: 'GET' } },
      { type: 'ProcessHttp', settings: { uri: 'https://exemplo.invalido', method: 'POST' } },
    ];
    menu.$contentActions![1]!.input!['expiration'] = '00:10:00';
    menu.$contentActions!.unshift({
      action: {
        type: 'SendMessage',
        settings: { type: 'text/plain', content: 'Hoje é {{calendar.date}}' },
      },
    });
    menu.$contentActions!.unshift({
      action: { type: 'SendRawMessage', settings: { type: 'application/json', rawContent: '{}' } },
    });
    const convertido = converterDoEditor(e, 'f1');
    expect(importReport(convertido).naoSuportado).toEqual({
      'acao:ExecuteScript': 1,
      'conteudo:application/json': 1,
      'entrada:expiracao': 1,
      'variavel:calendar': 1,
    });
    // O que não é suportado continua no fluxo: nada some na conversão.
    expect(
      convertido.states.find((s) => s.id === 'menu')!.inputActions!.map((a) => a.type),
    ).toEqual([
      'ExecuteScript',
      'ProcessHttp',
      'ProcessHttp',
      'SendRawMessage',
      'SendMessage',
      'SendMessage',
    ]);
  });
});

describe('the imported flow running in the engine', () => {
  const flow = converterDoEditor(exportado, 'f1');
  const variables: Record<string, string> = {};
  const enviadas: OutputMessage[] = [];
  const attendances: unknown[] = [];

  const login = async (conteudo: unknown, tipo = 'text/plain') => {
    enviadas.length = 0;
    const context: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id: String(Math.random()), tipo, conteudo }),
      variables,
      inboundContext: new Map(),
      services: {
        send: async (m) => void enviadas.push(m),
        encaminharForAttendance: async (p) => (attendances.push(p), { id: 'conversa-1' }),
        registerEvent: async () => {},
      },
    };
    await processarInbound(context);
    return enviadas
      .filter((m) => m.tipo !== 'application/vnd.lime.chatstate+json')
      .map((m) => m.conteudo);
  };

  it('hi -> asks for the name; name -> menu with the variable; 2 -> attendance with the context kept', async () => {
    expect(await login('oi')).toEqual(['Olá! Qual é o seu nome?']);
    const menu = await login('Ana');
    expect(menu).toHaveLength(1);
    expect((menu[0] as { text: string }).text).toBe('Prazer, Ana. Como posso ajudar?');
    expect(await login('2')).toEqual([]);
    expect(attendances).toHaveLength(1);
    expect(variables).toMatchObject({
      nome: 'Ana',
      opcao: '2',
      desk_forwardToDeskState_status: 'Success',
      'stateId@f1': 'desk:suporte',
    });
  });

  it('the end of attendance unblocks the block and moves to the configured block', async () => {
    expect(
      await login(
        { id: 'conversa-1', status: 'ClosedAttendant' },
        'application/vnd.iris.ticket+json',
      ),
    ).toEqual(['Seu atendimento foi encerrado. Posso ajudar em algo mais?']);
    expect(variables['stateId@f1']).toBe('pos-atendimento');
  });

  it('resposta fora do menu cai no "não entendi" e volta ao menu', async () => {
    const saida = await login('qualquer coisa');
    // pos-atendimento → menu (saída padrão) manda o menu e espera.
    expect((saida[0] as { text: string }).text).toContain('Como posso ajudar?');
    const errado = await login('3');
    expect(errado[0]).toBe('Não entendi. Responda 1 ou 2.');
    expect(variables['stateId@f1']).toBe('menu');
  });
});
