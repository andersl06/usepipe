import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import {
  INPUT_EXPIRATION_STATE_ID,
  inputExpirationMessage,
  inputExpirationSeconds,
  inputExpirationStateId,
  inputExpirationToMinutes,
  minutesToInputExpiration,
  pendingInputExpiration,
} from './input-expiration.js';
import { processInbound } from './manager.js';
import { importReport } from './editor.js';
import { SURVEY_CONTENT_TYPE } from './satisfaction-survey.js';
import type { FlowBlip, State } from './modelos.js';

const FLOW_ID = 'f1';
const KEY_STATE = `stateId@${FLOW_ID}`;
const texto = (conteudo: string) => ({ type: 'SendMessage', settings: { type: 'text/plain', content: conteudo } });

/**
 * Shape of a Blip block with "inactivity time" (invented data): the block asks, waits one
 * minute (`"0:1"`), an "input exists" output goes on, and the default output takes the expired
 * user to an inactivity block.
 */
function fluxo(extra: Partial<State> = {}): FlowBlip {
  return {
    id: FLOW_ID,
    states: [
      { id: 'onboarding', root: true, input: {}, outputs: [{ stateId: 'pergunta' }] },
      {
        id: 'pergunta',
        inputActions: [texto('Qual é o seu CPF?')],
        input: { expiration: '0:1', variable: 'cpf' },
        outputs: [
          { stateId: 'obrigado', conditions: [{ source: 'input', comparison: 'exists', values: [] }] },
          { stateId: 'inatividade' },
        ],
        ...extra,
      },
      { id: 'obrigado', inputActions: [texto('Obrigado!')], input: {}, outputs: [] },
      { id: 'inatividade', inputActions: [texto('Você ainda está aí?')], input: { expiration: '8:0' }, outputs: [] },
    ],
  };
}

async function rodar(flow: FlowBlip, variables: Record<string, string>, message: ReturnType<typeof inputExpirationMessage> | string) {
  const enviadas: OutputMessage[] = [];
  const pesquisas: unknown[] = [];
  const context: Context = {
    user: 'user@domain',
    flow,
    inbound: createInbound(typeof message === 'string' ? { id: 'm1', tipo: 'text/plain', conteudo: message } : message),
    variables,
    inboundContext: new Map(),
    contact: null,
    services: {
      async send(m: OutputMessage) { enviadas.push(m); },
      async forwardForAttendance() { return { id: 'atd-1', status: 'Open' }; },
      async registerEvent() {},
      async recordSatisfactionAnswer(a: unknown) { pesquisas.push(a); },
    },
  };
  const rastro = await processInbound(context);
  return { rastro, textos: enviadas.map((m) => m.conteudo), pesquisas };
}

describe('input expiration (P8)', () => {
  it('reads Blip h:m text as seconds only for a block that waits for input', () => {
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: '0:1' } })).toBe(60);
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: '8:0' } })).toBe(8 * 3600);
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: '0:01' } })).toBe(60);
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: '0:1', bypass: true } })).toBeNull();
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: '' } })).toBeNull();
    expect(inputExpirationSeconds({ id: 'a', input: { expiration: 'abc' } })).toBeNull();
    expect(inputExpirationSeconds({ id: 'a' })).toBeNull();
    expect(pendingInputExpiration(fluxo(), 'pergunta')).toEqual({ stateId: 'pergunta', seconds: 60 });
    expect(pendingInputExpiration(fluxo(), 'obrigado')).toBeNull();
    expect(pendingInputExpiration(fluxo(), null)).toBeNull();
  });

  it('converts editor minutes to and from the stored text, within 1..1380', () => {
    expect(minutesToInputExpiration(1)).toBe('0:1');
    expect(minutesToInputExpiration(90)).toBe('1:30');
    expect(minutesToInputExpiration(1380)).toBe('23:0');
    expect(minutesToInputExpiration(0)).toBeNull();
    expect(minutesToInputExpiration(1381)).toBeNull();
    expect(minutesToInputExpiration(1.5)).toBeNull();
    expect(inputExpirationToMinutes('1:30')).toBe(90);
    expect(inputExpirationToMinutes('8:0')).toBe(480);
    expect(inputExpirationToMinutes(null)).toBeNull();
  });

  it('tags the expiration input with the expired block', () => {
    const m = inputExpirationMessage('pergunta', 'x-1', 'user@domain');
    expect(m).toMatchObject({ tipo: 'text/plain', conteudo: '', metadados: { [INPUT_EXPIRATION_STATE_ID]: 'pergunta' } });
    expect(inputExpirationStateId(m)).toBe('pergunta');
    expect(inputExpirationStateId({ id: 'm', tipo: 'text/plain', conteudo: 'oi' })).toBeNull();
  });

  it('follows the default output when the block expires, keeping the variable untouched', async () => {
    const variables: Record<string, string> = {};
    const primeira = await rodar(fluxo(), variables, 'oi');
    expect(primeira.rastro.stateFinalId).toBe('pergunta');
    expect(primeira.textos).toEqual(['Qual é o seu CPF?']);
    variables['cpf'] = 'antigo';

    const expirou = await rodar(fluxo(), variables, inputExpirationMessage('pergunta', 'exp-1'));
    expect(expirou.textos).toEqual(['Você ainda está aí?']);
    expect(expirou.rastro.stateFinalId).toBe('inatividade');
    expect(variables[KEY_STATE]).toBe('inatividade');
    expect(variables['cpf']).toBe('antigo');
    expect(pendingInputExpiration(fluxo(), expirou.rastro.stateFinalId)).toEqual({ stateId: 'inatividade', seconds: 28_800 });
  });

  it('an answer before the expiration follows the input output as usual', async () => {
    const variables: Record<string, string> = { [KEY_STATE]: 'pergunta' };
    const r = await rodar(fluxo(), variables, '123');
    expect(r.textos).toEqual(['Obrigado!']);
    expect(variables['cpf']).toBe('123');
  });

  it('ignores an expiration for a block the user already left (no double firing)', async () => {
    const variables: Record<string, string> = { [KEY_STATE]: 'obrigado' };
    const r = await rodar(fluxo(), variables, inputExpirationMessage('pergunta', 'exp-2'));
    expect(r.textos).toEqual([]);
    expect(r.rastro.estados).toEqual([]);
    expect(r.rastro.stateFinalId).toBe('obrigado');
    expect(variables[KEY_STATE]).toBe('obrigado');
  });

  it('ignores an expiration when no block is saved (the session already ended)', async () => {
    const variables: Record<string, string> = {};
    const r = await rodar(fluxo(), variables, inputExpirationMessage('pergunta', 'exp-3'));
    expect(r.textos).toEqual([]);
    expect(variables[KEY_STATE]).toBeUndefined();
  });

  it('skips input validation on expiration: the empty input never gets the validation error', async () => {
    const flow = fluxo({ input: { expiration: '0:1', validation: { rule: 'number', error: 'Digite só números.' } } });
    const r = await rodar(flow, { [KEY_STATE]: 'pergunta' }, inputExpirationMessage('pergunta', 'exp-4'));
    expect(r.textos).toEqual(['Você ainda está aí?']);
  });

  it('a satisfaction survey block that expires records sem_resposta', async () => {
    const flow = fluxo({
      inputActions: [{ type: 'SendMessage', settings: { type: SURVEY_CONTENT_TYPE, content: {} } }],
    });
    const r = await rodar(flow, { [KEY_STATE]: 'pergunta' }, inputExpirationMessage('pergunta', 'exp-5'));
    expect(r.pesquisas).toEqual([{ rating: null, comment: null, status: 'sem_resposta' }]);
  });

  it('the import report no longer flags input expiration as unsupported', () => {
    expect(importReport(fluxo()).naoSuportado).toEqual({});
  });
});
