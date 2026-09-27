import { describe, expect, it } from 'vitest';
import { createInbound, type Context } from '@pipe/core';
import { processInbound } from '@pipe/core';

function fixture(): Context {
  return {
    user: 'contato-a',
    flow: { id: 'fluxo-a', states: [{ id: 'root', root: true, input: {}, outputActions: [], outputs: [] }] },
    inbound: createInbound({ id: 'inbound-a', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {},
    inboundContext: new Map(),
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'ticket-a' }),
      registerEvent: async () => {},
    },
  };
}

describe('platform actions', () => {
  it('does not expose arbitrary command routing to the API service', async () => {
    const c = fixture();
    let called = false;
    c.services.sendCommand = async () => { called = true; };
    c.flow.states[0]!.outputActions = [{ type: 'ProcessCommand', settings: {
      uri: '/arbitrary-service/resource', variable: 'response',
    } }];
    await expect(processInbound(c)).rejects.toThrow('não é executada no Pipe');
    expect(called).toBe(false);
  });

  it('uses the contact scope by default and never accepts a 0..100 score', async () => {
    const c = fixture();
    const scopes: string[] = [];
    c.services.bucketSet = async ({ scope }) => { scopes.push(scope); };
    c.services.respondWithKnowledge = async () => ({ answer: 'ok', confidence: 1 });
    c.flow.states[0]!.outputActions = [{ type: 'SetBucket', settings: {
      id: 'k', type: 'text/plain', document: 'v',
    } }];
    await processInbound(c);
    expect(scopes).toEqual(['contact']);
    c.flow.states[0]!.outputActions = [{ type: 'ProcessContentAssistant', settings: {
      text: 'x', score: 70, outputVariable: 'answer',
    } }];
    await expect(processInbound(c)).rejects.toThrow('entre 0 e 1');
  });
});
