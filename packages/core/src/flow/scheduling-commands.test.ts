import { describe, expect, it } from 'vitest';
import { isPipeCommand, matchCommand } from './commands.js';
import { createInbound, type CommandRequest, type Context } from './context.js';
import { processInbound } from './manager.js';
import type { Acao } from './modelos.js';
import fixture from './fixtures/active-notification-schedule.json' with { type: 'json' };

/**
 * P7 (`postmaster@scheduler`, `@broadcast`, `@analytics`, `@tunnel`, `@clicktracker`): the rows
 * route by recipient, the Builder recognises them through `isPipeCommand`, and `get /tunnels/{id}`
 * runs in the engine. The others need tenant data and go to the `api` (`processCommand`).
 */

const SCHEDULER = 'postmaster@scheduler.msging.net';
const BROADCAST = 'postmaster@broadcast.msging.net';
const ANALYTICS = 'postmaster@analytics.msging.net';
const TUNNEL = 'postmaster@tunnel.msging.net';
const CLICKTRACKER = 'postmaster@clicktracker.msging.net';

function context(actions: Acao[], processCommand?: (request: CommandRequest) => Promise<unknown>): Context {
  return {
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: actions, outputs: [] }] },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {},
    inboundContext: new Map(),
    contact: { identity: 'contato-1', name: 'Ana', phoneNumber: '+5511988887777', extras: {} },
    application: { identifier: 'atendimento', routerIdentifier: 'roteador' },
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
      ...(processCommand ? { processCommand } : {}),
    },
  };
}

const command = (settings: Record<string, unknown>): Acao => ({ type: 'ProcessCommand', settings });
const response = (c: Context, name: string): Record<string, unknown> => JSON.parse(c.variables[name]!) as Record<string, unknown>;

describe('matchCommand — P7 rows', () => {
  it('routes the scheduler, broadcast, analytics, tunnel and click tracker commands', () => {
    expect(matchCommand({ to: SCHEDULER, method: 'set', uri: '/schedules' })?.route).toBe('scheduler.schedules.set');
    expect(matchCommand({ to: SCHEDULER, method: 'get', uri: '/schedules/msg-1' })).toMatchObject({
      route: 'scheduler.schedules.item',
      params: { id: 'msg-1' },
    });
    expect(matchCommand({ to: SCHEDULER, method: 'delete', uri: '/schedules/msg-1' })?.route).toBe('scheduler.schedules.item');
    expect(matchCommand({ to: BROADCAST, method: 'set', uri: '/lists' })?.route).toBe('broadcast.lists');
    expect(matchCommand({ to: BROADCAST, method: 'get', uri: '/lists' })?.route).toBe('broadcast.lists');
    expect(matchCommand({ to: BROADCAST, method: 'delete', uri: '/lists/clientes@broadcast.msging.net' })).toMatchObject({
      route: 'broadcast.lists.item',
      params: { list: 'clientes@broadcast.msging.net' },
    });
    expect(matchCommand({ to: BROADCAST, method: 'set', uri: '/lists/clientes@broadcast.msging.net/recipients' })?.route).toBe(
      'broadcast.recipients',
    );
    expect(
      matchCommand({ to: BROADCAST, method: 'delete', uri: '/lists/clientes@broadcast.msging.net/recipients/5511900000000%40wa.gw.msging.net' }),
    ).toMatchObject({
      route: 'broadcast.recipients.item',
      params: { list: 'clientes@broadcast.msging.net', id: '5511900000000@wa.gw.msging.net' },
    });
    expect(matchCommand({ to: ANALYTICS, method: 'set', uri: '/event-track' })?.route).toBe('analytics.eventTrack');
    expect(matchCommand({ to: ANALYTICS, method: 'get', uri: '/event-track/compras?startDate=2026-09-01' })).toMatchObject({
      route: 'analytics.eventTrack.category',
      params: { category: 'compras' },
    });
    expect(matchCommand({ to: TUNNEL, method: 'get', uri: '/tunnels/abc' })?.route).toBe('tunnel.item');
    expect(matchCommand({ to: CLICKTRACKER, method: 'set', uri: '/entrypoint/encode' })?.route).toBe('clicktracker.encode');
  });

  it('keeps each row to its extension and methods', () => {
    expect(matchCommand({ to: 'postmaster@msging.net', method: 'set', uri: '/schedules' })).toBeNull();
    expect(matchCommand({ to: SCHEDULER, method: 'get', uri: '/schedules' })).toBeNull();
    expect(matchCommand({ to: SCHEDULER, method: 'set', uri: '/schedules/msg-1' })).toBeNull();
    expect(matchCommand({ to: BROADCAST, method: 'set', uri: '/lists/x/recipients/y' })).toBeNull();
    expect(matchCommand({ to: ANALYTICS, method: 'set', uri: '/event-track/compras' })).toBeNull();
    expect(matchCommand({ to: TUNNEL, method: 'set', uri: '/tunnels/abc' })).toBeNull();
    expect(matchCommand({ to: CLICKTRACKER, method: 'get', uri: '/entrypoint/encode' })).toBeNull();
  });

  it('is recognised by the Builder through isPipeCommand', () => {
    expect(isPipeCommand({ to: SCHEDULER, method: 'set', uri: '/schedules' })).toBe(true);
    expect(isPipeCommand({ to: BROADCAST, method: 'get', uri: '/lists/x@broadcast.msging.net/recipients' })).toBe(true);
    expect(isPipeCommand({ to: ANALYTICS, method: 'set', uri: '/event-track' })).toBe(true);
    expect(isPipeCommand({ to: TUNNEL, method: 'get', uri: '/tunnels/{{tunnel.identity}}' })).toBe(true);
    expect(isPipeCommand({ to: CLICKTRACKER, method: 'set', uri: '/entrypoint/encode' })).toBe(true);
  });
});

describe('get /tunnels/{id}', () => {
  it("resolves the contact's own tunnel to its channel identity, in the engine", async () => {
    const c = context([
      command({ to: TUNNEL, method: 'get', uri: '/tunnels/{{tunnel.identity}}', variable: 'r1' }),
      command({ to: TUNNEL, method: 'get', uri: '/tunnels/contato-1@tunnel.msging.net', variable: 'r2' }),
      command({ to: TUNNEL, method: 'get', uri: '/tunnels/outro', variable: 'r3' }),
    ]);
    await processInbound(c);
    const tunnel = {
      method: 'get',
      status: 'success',
      type: 'application/vnd.iris.tunnel+json',
      resource: {
        owner: 'roteador@msging.net',
        originator: '5511988887777@wa.gw.msging.net',
        destination: 'atendimento@msging.net',
      },
    };
    expect(response(c, 'r1')).toEqual(tunnel);
    expect(response(c, 'r2')).toEqual(tunnel);
    expect(response(c, 'r3')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });

  it('owns the tunnel itself when the flow is not behind a router', async () => {
    const c = context([command({ to: TUNNEL, method: 'get', uri: '/tunnels/contato-1', variable: 'r' })]);
    c.application = { identifier: 'atendimento' };
    c.contact = { identity: 'contato-1', extras: {} };
    await processInbound(c);
    expect(response(c, 'r')).toMatchObject({
      resource: { owner: 'atendimento@msging.net', originator: 'contato-1@wa.gw.msging.net', destination: 'atendimento@msging.net' }, // D-13: formato do ensaio 5
    });
  });
});

describe('api commands', () => {
  it('sends the scheduler, broadcast, analytics and click tracker commands to the api with resolved resources', async () => {
    const requests: CommandRequest[] = [];
    const c = context(
      [
        command({ to: BROADCAST, method: 'set', uri: '/lists/{{listName}}@broadcast.msging.net/recipients', resource: '{{contact.identity}}', variable: 'r1' }),
        command({ to: ANALYTICS, method: 'set', uri: '/event-track', resource: { category: 'lead', action: '{{contact.name}}' }, variable: 'r2' }),
        command({ to: CLICKTRACKER, method: 'set', uri: '/entrypoint/encode', resource: { url: 'https://exemplo.com.br/oferta' }, variable: 'r3' }),
      ],
      async (request) => {
        requests.push(request);
        return { method: request.method.toLowerCase(), status: 'success' };
      },
    );
    c.variables['listName'] = 'clientes';
    await processInbound(c);
    expect(requests.map((r) => r.command.route)).toEqual(['broadcast.recipients', 'analytics.eventTrack', 'clicktracker.encode']);
    expect(requests[0]!.command.params['list']).toBe('clientes@broadcast.msging.net');
    expect(requests[0]!.resource).toBe('contato-1');
    expect(requests[1]!.resource).toEqual({ category: 'lead', action: 'Ana' });
    expect(requests.every((r) => r.flowId === 'fluxo-1')).toBe(true);
    expect(response(c, 'r1')).toEqual({ method: 'set', status: 'success' });
  });
});

describe('active notification blocks (fixture)', () => {
  /**
   * Replacement of Blip's hosted active notification (`sendnotificationblipemployee`) with native
   * commands: schedule a WhatsApp template to the contact, record the opt-in event and read the
   * schedule back. Invented data, in the shape the export's notification blocks use.
   */
  it('routes every command of the notification blocks and resolves their resources', async () => {
    const requests: CommandRequest[] = [];
    const actions = (fixture.states as { outputActions: Acao[] }[]).flatMap((state) => state.outputActions);
    const c = context(actions, async (request) => {
      requests.push(request);
      return { method: request.method.toLowerCase(), status: 'success' };
    });
    c.variables['notificationDate'] = '2026-10-01T12:00:00.000Z';
    await processInbound(c);

    expect(actions.every((action) => isPipeCommand(action.settings as { to: string; method: string; uri: string }))).toBe(true);
    expect(requests.map((r) => r.command.route)).toEqual([
      'broadcast.recipients',
      'scheduler.schedules.set',
      'analytics.eventTrack',
      'scheduler.schedules.item',
    ]);
    const schedule = requests[1]!.resource as { when: string; message: { id: string; to: string; content: { template: { name: string } } } };
    expect(schedule.when).toBe('2026-10-01T12:00:00.000Z');
    expect(schedule.message.to).toBe('contato-1');
    expect(schedule.message.id).toBe('notificacao-contato-1');
    expect(schedule.message.content.template.name).toBe('lembrete_de_aula');
    expect(requests[3]!.command.params['id']).toBe('notificacao-contato-1');
  });
});
