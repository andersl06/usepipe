import { describe, expect, it } from 'vitest';
import { matchCommand, type CommandRequest } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { engineServices, type EngineEffects, type TicketEffects } from '../src/domain/engine-services.js';
import { listName, memoryMessagingEffects, type MemorySchedule } from '../src/domain/scheduling-commands.js';
import { templateOfMessage } from '../src/domain/scheduled-messages.js';

/**
 * P7 handlers over the Builder test run's memory effects: parsing, Blip response shapes and LIME
 * failure codes, with no database (the DB suite `scheduling-commands.test.ts` covers the tables).
 */

const tx = {} as TransactionPipe;
const noTickets = new Proxy({}, {
  get: () => () => {
    throw new Error('ticket effect not expected');
  },
}) as TicketEffects;

function setup() {
  const store = {
    contactIdentity: 'contato-de-teste',
    lists: new Map<string, Set<string>>(),
    schedules: new Map<string, MemorySchedule>(),
    events: [] as { category: string; action: string; at: Date }[],
  };
  const effects: EngineEffects = {
    tickets: noTickets,
    send: async () => {},
    forwardForAttendance: async () => ({ id: 't' }),
    queueOfHandoff: async () => null,
    registerEvent: async () => {},
    saveContact: async () => {},
    messaging: memoryMessagingEffects(store),
  };
  const services = engineServices({ tenantId: 't1', flowFunctions: new Map(), isolate: (fn) => fn(tx), effects });
  const run = async (to: string, method: string, uri: string, resource: unknown = null): Promise<Record<string, unknown>> => {
    const command = matchCommand({ to, method, uri });
    if (!command) throw new Error(`sem rota: ${uri}`);
    const request: CommandRequest = { uri, method: method.toUpperCase(), resource, command, flowId: 'fluxo-1' };
    return (await services.processCommand!(request)) as Record<string, unknown>;
  };
  return { store, run };
}

const SCHEDULER = 'postmaster@scheduler.msging.net';
const BROADCAST = 'postmaster@broadcast.msging.net';
const ANALYTICS = 'postmaster@analytics.msging.net';
const CLICKTRACKER = 'postmaster@clicktracker.msging.net';

describe('scheduler', () => {
  it('schedules, reads and cancels a message; the default recipient is the contact', async () => {
    const { run, store } = setup();
    const resource = JSON.stringify({
      name: 'lembrete',
      when: '2026-10-01T12:00:00.000Z',
      message: { id: 'msg-1', type: 'text/plain', content: 'Sua aula começa amanhã.' },
    });
    expect(await run(SCHEDULER, 'set', '/schedules', resource)).toEqual({ method: 'set', status: 'success' });
    expect(store.schedules.get('msg-1')?.to).toBe('contato-de-teste');
    expect(await run(SCHEDULER, 'get', '/schedules/msg-1')).toEqual({
      method: 'get',
      status: 'success',
      type: 'application/vnd.iris.schedule+json',
      resource: {
        name: 'lembrete',
        when: '2026-10-01T12:00:00.000Z',
        message: { id: 'msg-1', to: 'contato-de-teste', type: 'text/plain', content: 'Sua aula começa amanhã.' },
        status: 'scheduled',
      },
    });
    expect(await run(SCHEDULER, 'delete', '/schedules/msg-1')).toEqual({ method: 'delete', status: 'success' });
    expect(await run(SCHEDULER, 'get', '/schedules/msg-1')).toMatchObject({ resource: { status: 'canceled' } });
    expect(await run(SCHEDULER, 'delete', '/schedules/nao-existe')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });

  it('refuses a schedule without a valid date, type or content (64)', async () => {
    const { run } = setup();
    const message = { type: 'text/plain', content: 'oi' };
    expect(await run(SCHEDULER, 'set', '/schedules', { message })).toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(await run(SCHEDULER, 'set', '/schedules', { when: 'amanhã', message })).toMatchObject({ reason: { code: 64 } });
    expect(await run(SCHEDULER, 'set', '/schedules', { when: '2026-10-01T12:00:00Z', message: { type: 'texto', content: 'oi' } })).toMatchObject({
      reason: { code: 64 },
    });
    expect(await run(SCHEDULER, 'set', '/schedules', { when: '2026-10-01T12:00:00Z', message: { type: 'text/plain' } })).toMatchObject({
      reason: { code: 64 },
    });
  });
});

describe('broadcast lists', () => {
  it('creates a list, adds, reads and removes recipients in Blip shape', async () => {
    const { run } = setup();
    expect(await run(BROADCAST, 'set', '/lists', { identity: 'clientes@broadcast.msging.net' })).toEqual({ method: 'set', status: 'success' });
    expect(await run(BROADCAST, 'get', '/lists')).toEqual({
      method: 'get',
      status: 'success',
      type: 'application/vnd.lime.collection+json',
      resource: { total: 1, itemType: 'application/vnd.lime.identity', items: ['clientes@broadcast.msging.net'] },
    });
    await run(BROADCAST, 'set', '/lists/clientes@broadcast.msging.net/recipients', '5511900000001@wa.gw.msging.net');
    await run(BROADCAST, 'set', '/lists/clientes@broadcast.msging.net/recipients', { identity: '5511900000002@wa.gw.msging.net' });
    expect(await run(BROADCAST, 'get', '/lists/clientes@broadcast.msging.net/recipients?$take=1&$skip=1')).toMatchObject({
      resource: { total: 2, items: ['5511900000002@wa.gw.msging.net'] },
    });
    expect(await run(BROADCAST, 'get', '/lists/clientes@broadcast.msging.net/recipients/5511900000001')).toMatchObject({
      status: 'success',
      resource: '5511900000001@wa.gw.msging.net',
    });
    expect(await run(BROADCAST, 'delete', '/lists/clientes@broadcast.msging.net/recipients/5511900000001@wa.gw.msging.net')).toEqual({
      method: 'delete',
      status: 'success',
    });
    expect(await run(BROADCAST, 'get', '/lists/clientes@broadcast.msging.net')).toMatchObject({
      type: 'application/vnd.iris.distribution-list+json',
      resource: { identity: 'clientes@broadcast.msging.net' },
    });
    expect(await run(BROADCAST, 'delete', '/lists/clientes@broadcast.msging.net')).toMatchObject({ status: 'success' });
    expect(await run(BROADCAST, 'get', '/lists/clientes@broadcast.msging.net/recipients')).toMatchObject({ reason: { code: 67 } });
    expect(await run(BROADCAST, 'set', '/lists', {})).toMatchObject({ reason: { code: 64 } });
  });

  it('stores a list by its bare name', () => {
    expect(listName('clientes@broadcast.msging.net')).toBe('clientes');
    expect(listName('clientes')).toBe('clientes');
    expect(listName('x@wa.gw.msging.net')).toBe('x@wa.gw.msging.net');
  });
});

describe('event-track', () => {
  it('records events and answers daily counts by action and the categories', async () => {
    const { run } = setup();
    await run(ANALYTICS, 'set', '/event-track', { category: 'compras', action: 'boleto' });
    await run(ANALYTICS, 'set', '/event-track', '{"category":"compras","action":"boleto"}');
    await run(ANALYTICS, 'set', '/event-track', { category: 'compras', action: 'pix', extras: { valor: '10' } });
    const today = new Date();
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString();
    const response = await run(ANALYTICS, 'get', '/event-track/compras');
    expect(response).toMatchObject({ status: 'success', type: 'application/vnd.lime.collection+json' });
    expect((response['resource'] as { items: unknown[] }).items).toEqual([
      { storageDate: day, category: 'compras', action: 'boleto', count: 2 },
      { storageDate: day, category: 'compras', action: 'pix', count: 1 },
    ]);
    expect(await run(ANALYTICS, 'get', '/event-track')).toMatchObject({ resource: { items: [{ category: 'compras' }] } });
    expect(await run(ANALYTICS, 'set', '/event-track', { category: 'compras' })).toMatchObject({ reason: { code: 64 } });
  });
});

describe('click tracker', () => {
  it('answers a short URL for a link and refuses an empty one', async () => {
    const { run } = setup();
    const response = await run(CLICKTRACKER, 'set', '/entrypoint/encode', { url: 'https://exemplo.com.br/oferta' });
    expect(response).toMatchObject({ method: 'set', status: 'success', type: 'text/plain' });
    expect(response['resource']).toMatch(/\/l\/teste$/);
    expect(await run(CLICKTRACKER, 'set', '/entrypoint/encode', {})).toMatchObject({ reason: { code: 64 } });
  });
});

describe('templateOfMessage', () => {
  it("reads Blip's WhatsApp template content and its body parameters", () => {
    const content = {
      type: 'template',
      template: {
        name: 'lembrete_de_aula',
        language: { code: 'pt_BR', policy: 'deterministic' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'amanhã' }] }],
      },
    };
    expect(templateOfMessage('application/json', content)).toEqual({ name: 'lembrete_de_aula', parameters: ['Ana', 'amanhã'] });
    expect(templateOfMessage('application/json', JSON.stringify(content))).toMatchObject({ name: 'lembrete_de_aula' });
    expect(templateOfMessage('text/plain', 'oi')).toBeNull();
  });
});
