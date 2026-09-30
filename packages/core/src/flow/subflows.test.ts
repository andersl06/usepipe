/**
 * P12: Blip subflows in the engine. The fixture `export-with-subflows.json` is modelled on the Blip
 * editor export (a `subflow:` block with `shortNameOfSubflow`, a subflow with an `end` block) with
 * invented content; no Blip value is copied.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import { EngineError, processInbound } from './manager.js';
import type { InboundTrace } from './manager.js';
import type { Acao, FlowBlip, State } from './modelos.js';
import { flowErrors, runtimeSubflow, subflowRuntimeId, validateFlow } from './modelos.js';
import { blipReadFlow, importReport } from './editor.js';
import { activeFlowSession } from './subflows.js';

const FLOW_ID = 'f1';
const SUB_ID = subflowRuntimeId(FLOW_ID, 'coletadados');
const CALLER = 'subflow:7c0e4a52-1b8d-4f7e-9a61-2d3c4b5a6e70';

const exportJson: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/export-with-subflows.json', import.meta.url), 'utf8'),
);

function harness(flow: FlowBlip, variables: Record<string, string> = {}) {
  const sent: OutputMessage[] = [];
  const events: Record<string, unknown>[] = [];
  const flowStates: { flowId: string; stateId: string }[] = [];
  const run = async (text: string): Promise<InboundTrace> => {
    const context: Context = {
      user: 'user@domain',
      flow,
      inbound: createInbound({ id: `m-${text}`, tipo: 'text/plain', conteudo: text }),
      variables,
      inboundContext: new Map(),
      contact: null,
      services: {
        async send(m) {
          sent.push(m);
        },
        async forwardForAttendance() {
          return { id: 'atd', status: 'Open' };
        },
        async registerEvent(e) {
          events.push(e);
        },
        async setFlowState(request) {
          flowStates.push(request);
          return true;
        },
      },
    };
    const trace = await processInbound(context);
    // The caller's context names the bot's flow again after every input.
    expect(context.flow).toBe(flow);
    expect(context.rootFlow).toBeUndefined();
    return trace;
  };
  return { run, sent, events, variables, flowStates, texts: () => sent.map((m) => m.conteudo) };
}

const send = (content: string): Acao => ({ type: 'SendMessage', settings: { type: 'text/plain', content } });
const state = (id: string, next: string | null, extra: Partial<State> = {}): State => ({
  id,
  input: { bypass: true },
  outputs: next ? [{ stateId: next }] : [],
  ...extra,
});

describe('Blip subflows (P12)', () => {
  it('reads the export with its subflow and runs it end to end, returning through the end block', async () => {
    const flow = blipReadFlow(exportJson, FLOW_ID);
    expect(Object.keys(flow.subflows ?? {})).toEqual(['coletadados']);
    expect(flow.subflows!['coletadados']!.type).toBe('subflow');
    expect(flow.states.find((s) => s.id === CALLER)?.['shortNameOfSubflow']).toBe('coletadados');
    expect(flow.subflows!['coletadados']!.states.find((s) => s.id === 'end')?.end).toBe(true);
    expect(() => validateFlow(flow)).not.toThrow();

    const h = harness(flow);
    const first = await h.run('oi');
    expect(h.texts()).toEqual(['Olá! Antes de continuar, preciso de alguns dados.', 'Qual é o seu nome?']);
    // Blip's context keys: the caller keeps its `subflow:` block, the session names the subflow.
    expect(h.variables[`stateId@${FLOW_ID}`]).toBe(CALLER);
    expect(h.variables[`currentFlowSession@${FLOW_ID}`]).toBe('coletadados');
    expect(h.variables[`stateId@${SUB_ID}`]).toBe('pergunta-nome');
    expect(first.stateFinalId).toBe('pergunta-nome');
    expect(first.subflow).toBe('coletadados');
    expect(first.estados.map((e) => [e.stateId, e.subflow ?? null])).toEqual([
      ['onboarding', null],
      ['boas-vindas', null],
      [CALLER, null],
      ['onboarding', 'coletadados'],
      ['pergunta-nome', 'coletadados'],
    ]);
    // The `subflow:` block's entering action ran in the caller.
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ category: CALLER });

    const second = await h.run('Ana');
    expect(h.texts().slice(2)).toEqual(['Obrigado, Ana! Seus dados foram salvos.']);
    expect(h.variables['nomeCliente']).toBe('Ana');
    expect(h.variables[`stateId@${FLOW_ID}`]).toBe('confirmado');
    expect(h.variables[`previous-stateId@${FLOW_ID}`]).toBe(CALLER);
    expect(h.variables).not.toHaveProperty(`currentFlowSession@${FLOW_ID}`);
    expect(h.variables).not.toHaveProperty(`stateId@${SUB_ID}`);
    expect(second.subflow).toBeUndefined();
    expect(second.estados.map((e) => [e.stateId, e.subflow ?? null, e.nextStateId ?? null])).toEqual([
      ['pergunta-nome', 'coletadados', 'valida'],
      ['valida', 'coletadados', 'end'],
      ['end', 'coletadados', CALLER],
      [CALLER, null, 'confirmado'],
      ['confirmado', null, null],
    ]);
  });

  it('takes the caller block default exit when the subflow did not set what its conditions test', async () => {
    const flow = blipReadFlow(exportJson, FLOW_ID);
    const sub = flow.subflows!['coletadados']!;
    sub.states.find((s) => s.id === 'valida')!.inputActions = [];
    const h = harness(flow);
    await h.run('oi');
    await h.run('Bia');
    expect(h.texts().at(-1)).toBe('Não consegui confirmar seus dados.');
    expect(h.variables[`stateId@${FLOW_ID}`]).toBe('sem-dados');
  });

  it('nests subflows and unwinds each level through its own end block', async () => {
    const flow: FlowBlip = {
      id: FLOW_ID,
      states: [
        { id: 'root', root: true, input: {}, outputs: [{ stateId: 'subflow:a' }] },
        { id: 'subflow:a', shortNameOfSubflow: 'a', input: {}, outputs: [{ stateId: 'fim' }] },
        { id: 'fim', inputActions: [send('De volta ao fluxo principal')], input: {}, outputs: [] },
      ],
      subflows: {
        a: {
          id: 'x',
          states: [
            { id: 'onboarding', root: true, input: { bypass: true }, outputs: [{ stateId: 'subflow:b' }] },
            { id: 'subflow:b', shortNameOfSubflow: 'b', input: {}, outputs: [{ stateId: 'end' }] },
            state('end', null, { end: true, inputActions: [send('Saindo de A')] }),
          ],
        },
        b: {
          id: 'y',
          states: [
            { id: 'onboarding', root: true, input: { bypass: true }, outputs: [{ stateId: 'pergunta' }] },
            { id: 'pergunta', inputActions: [send('Pergunta de B')], input: {}, outputs: [{ stateId: 'end' }] },
            state('end', null, { end: true }),
          ],
        },
      },
    };
    const h = harness(flow);
    const first = await h.run('oi');
    expect(h.texts()).toEqual(['Pergunta de B']);
    expect(h.variables[`currentFlowSession@${FLOW_ID}`]).toBe('a');
    expect(h.variables[`currentFlowSession@${subflowRuntimeId(FLOW_ID, 'a')}`]).toBe('b');
    expect(first.subflow).toBe('b');
    expect(activeFlowSession(h.variables, flow)).toMatchObject({ stateId: 'pergunta', subflow: 'b' });

    await h.run('resposta');
    expect(h.texts()).toEqual(['Pergunta de B', 'Saindo de A', 'De volta ao fluxo principal']);
    expect(h.variables[`stateId@${FLOW_ID}`]).toBe('fim');
    expect(Object.keys(h.variables).filter((k) => k.includes('subflow-'))).toEqual([]);
    expect(activeFlowSession(h.variables, flow)).toMatchObject({ stateId: 'fim', subflow: null });
  });

  it('answers get/set/delete of currentFlowSession as context commands, in Blip spelling', async () => {
    const command = (method: string, variable?: string, resource?: string): Acao => ({
      type: variable ? 'ProcessCommand' : 'SendCommand',
      settings: {
        to: 'postmaster@builder.msging.net',
        method,
        uri: `/contexts/user@domain/currentflowsession@${FLOW_ID}`,
        ...(resource ? { resource } : {}),
        ...(variable ? { variable } : {}),
      },
    });
    const flow: FlowBlip = {
      id: FLOW_ID,
      states: [
        { id: 'root', root: true, input: {}, outputs: [{ stateId: 'subflow:s' }] },
        { id: 'subflow:s', shortNameOfSubflow: 's', input: {}, outputs: [{ stateId: 'depois' }] },
        { id: 'depois', inputActions: [send('No fluxo principal')], input: {}, outputs: [] },
      ],
      subflows: {
        s: {
          id: 's',
          states: [
            {
              id: 'onboarding',
              root: true,
              input: { bypass: true },
              inputActions: [command('get', 'sessao')],
              outputs: [{ stateId: 'espera' }],
            },
            // "Sair do subfluxo" by command: takes effect on the next input, as in Blip.
            { id: 'espera', inputActions: [command('delete')], input: {}, outputs: [{ stateId: 'nunca' }] },
            { id: 'nunca', inputActions: [send('Ainda no subfluxo')], input: {}, outputs: [] },
          ],
        },
      },
    };
    const h = harness(flow);
    await h.run('oi');
    expect(JSON.parse(h.variables['sessao']!)).toMatchObject({ status: 'success', resource: 's' });
    expect(h.variables).not.toHaveProperty(`currentFlowSession@${FLOW_ID}`);
    // Back in the caller at its `subflow:` block: the next input leaves by the caller's exits.
    await h.run('continua');
    expect(h.texts()).toEqual(['No fluxo principal']);
    expect(h.variables[`stateId@${FLOW_ID}`]).toBe('depois');
  });

  it('keeps `set stateid@` of its own subflow in the same context instead of another flow', async () => {
    const flow: FlowBlip = {
      id: FLOW_ID,
      states: [
        {
          id: 'root',
          root: true,
          input: {},
          inputActions: [],
          outputActions: [
            {
              type: 'SendCommand',
              settings: {
                to: 'postmaster@builder.msging.net',
                method: 'set',
                uri: `/contexts/user@domain/stateid@${subflowRuntimeId(FLOW_ID, 's')}`,
                type: 'text/plain',
                resource: 'onboarding',
              },
            },
          ],
          outputs: [],
        },
      ],
      subflows: { s: { id: 's', states: [{ id: 'onboarding', root: true, input: {}, outputs: [] }] } },
    };
    const h = harness(flow);
    await h.run('oi');
    expect(h.variables[`stateId@${subflowRuntimeId(FLOW_ID, 's')}`]).toBe('onboarding');
    expect(h.flowStates).toEqual([]);
  });

  it('drops a session whose subflow no longer exists and runs the caller block', async () => {
    const flow: FlowBlip = {
      id: FLOW_ID,
      states: [
        { id: 'root', root: true, input: {}, outputs: [] },
        { id: 'antigo', input: {}, inputActions: [], outputs: [{ stateId: 'root' }], outputActions: [send('Voltei')] },
      ],
    };
    const h = harness(flow, {
      [`stateId@${FLOW_ID}`]: 'antigo',
      [`currentFlowSession@${FLOW_ID}`]: 'removido',
      [`stateId@${subflowRuntimeId(FLOW_ID, 'removido')}`]: 'x',
    });
    await h.run('oi');
    expect(h.texts()).toEqual(['Voltei']);
    expect(h.variables).not.toHaveProperty(`currentFlowSession@${FLOW_ID}`);
  });

  it('refuses a subflow that calls itself, and an end block outside a subflow', async () => {
    const recursive: FlowBlip = {
      id: FLOW_ID,
      states: [
        { id: 'root', root: true, input: {}, outputs: [{ stateId: 'subflow:r' }] },
        { id: 'subflow:r', shortNameOfSubflow: 'r', input: {}, outputs: [] },
      ],
      subflows: {
        r: {
          id: 'r',
          states: [
            { id: 'onboarding', root: true, input: { bypass: true }, outputs: [{ stateId: 'subflow:r' }] },
            { id: 'subflow:r', shortNameOfSubflow: 'r', input: {}, outputs: [] },
          ],
        },
      },
    };
    await expect(harness(recursive).run('oi')).rejects.toThrow(/não pode chamar a si mesmo/);

    const endInMain: FlowBlip = {
      id: FLOW_ID,
      states: [
        { id: 'root', root: true, input: {}, outputs: [{ stateId: 'fim' }] },
        state('fim', null, { end: true }),
      ],
    };
    const error = await harness(endInMain).run('oi').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect((error as Error).message).toMatch(/não foi chamado como subfluxo/);
  });

  it('validates references and the subflows themselves, attaching errors to the calling block', () => {
    const flow = blipReadFlow(exportJson, FLOW_ID);
    const missing: FlowBlip = { ...flow, subflows: {} };
    expect(() => validateFlow(missing)).toThrow(`O subfluxo 'coletadados' chamado pelo bloco '${CALLER}' não existe neste fluxo.`);
    expect(flowErrors(missing)).toContainEqual({
      stateId: CALLER,
      message: `O subfluxo 'coletadados' chamado pelo bloco '${CALLER}' não existe neste fluxo.`,
    });

    const broken = structuredClone(flow);
    broken.subflows!['coletadados']!.states.find((s) => s.id === 'onboarding')!.root = false;
    expect(() => validateFlow(broken)).toThrow("Subfluxo 'coletadados': O fluxo precisa de exatamente um estado raiz.");
    expect(flowErrors(broken)).toContainEqual({
      stateId: CALLER,
      message: "Subfluxo 'coletadados': O fluxo precisa de exatamente um estado raiz.",
    });

    const oldVersion = structuredClone(flow);
    oldVersion.subflows!['coletadados']!.version = 1;
    expect(() => validateFlow(oldVersion)).toThrow(/versão do subfluxo/);
  });

  it('gives the subflow its runtime id and the bot configuration under its own', () => {
    const flow: FlowBlip = {
      id: FLOW_ID,
      configuration: { saudacao: 'Oi', 'builder:stateExpiration': '00:30:00' },
      states: [{ id: 'root', root: true, input: {}, outputs: [] }],
      subflows: {
        Coleta: { id: 'blip-id', configuration: { saudacao: 'Olá' }, states: [{ id: 'onboarding', root: true, input: {}, outputs: [] }] },
      },
    };
    const sub = runtimeSubflow(flow, 'coleta')!;
    expect(sub.id).toBe(subflowRuntimeId(FLOW_ID, 'Coleta'));
    expect(sub.type).toBe('subflow');
    expect(sub.version).toBe(2);
    expect(sub.configuration).toEqual({ saudacao: 'Olá', 'builder:stateExpiration': '00:30:00' });
    expect(runtimeSubflow(flow, 'outro')).toBeNull();
  });

  it('reports a missing subflow as unsupported and counts the subflow actions', () => {
    const flow = blipReadFlow(exportJson, FLOW_ID);
    const report = importReport(flow);
    expect(report.naoSuportado).toEqual({});
    expect(report.actions['SetVariable']).toBe(1);
    expect(report.actions['TrackEvent']).toBe(1);

    const withoutSubflows = { ...(exportJson as Record<string, unknown>) };
    delete withoutSubflows['subflows'];
    const alone = blipReadFlow(withoutSubflows, FLOW_ID);
    expect(alone.subflows).toBeUndefined();
    expect(importReport(alone).naoSuportado).toEqual({ 'subfluxo:coletadados': 1 });
  });

  it('keeps the subflow editor drawing for the Builder, which the engine ignores', () => {
    const flow = blipReadFlow(exportJson, FLOW_ID);
    const sub = flow.subflows!['coletadados'] as FlowBlip & { editor?: { flow: Record<string, unknown> } };
    expect(Object.keys(sub.editor!.flow)).toEqual(['onboarding', 'pergunta-nome', 'valida', 'end', 'fallback']);
  });
});
