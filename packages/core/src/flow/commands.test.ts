import { describe, expect, it } from 'vitest';
import { commandRecipient, matchCommand } from './commands.js';
import { createInbound, type CommandRequest, type Context } from './context.js';
import { processInbound } from './manager.js';

describe('commandRecipient', () => {
  it('reduces Blip extension addresses to their service', () => {
    expect(commandRecipient('postmaster@desk.msging.net')).toBe('desk');
    expect(commandRecipient('postmaster@builder.msging.net')).toBe('builder');
    expect(commandRecipient('postmaster@msging.net')).toBe('core');
    expect(commandRecipient(undefined)).toBe('core');
    expect(commandRecipient('')).toBe('core');
  });
});

describe('matchCommand', () => {
  const desk = 'postmaster@desk.msging.net';

  it('routes Desk reads by recipient, method and path', () => {
    const list = matchCommand({ to: desk, method: 'get', uri: "/tickets?$filter=customerIdentity%20eq%20'c-1'&$closed=true" });
    expect(list?.route).toBe('desk.tickets.list');
    expect(list?.query.get('$filter')).toBe("customerIdentity eq 'c-1'");
    expect(list?.query.get('$closed')).toBe('true');
    expect(matchCommand({ to: desk, method: 'GET', uri: '/ticket/abc' })).toMatchObject({ route: 'desk.tickets.get', params: { id: 'abc' } });
    expect(matchCommand({ to: desk, method: 'get', uri: '/tickets/abc' })).toMatchObject({ route: 'desk.tickets.get', params: { id: 'abc' } });
    expect(matchCommand({ to: desk, method: 'get', uri: '/teams' })?.route).toBe('desk.teams.list');
    expect(matchCommand({ to: desk, method: 'get', uri: '/teams/agents-online' })?.route).toBe('desk.teams.agentsOnline');
    expect(matchCommand({ to: desk, method: 'get', uri: '/attendants' })?.route).toBe('desk.attendants.list');
  });

  it('keeps the Pipe-vocabulary ticket routes for any recipient', () => {
    expect(matchCommand({ method: 'set', uri: '/tickets/123/change-tags' })?.route).toBe('pipe.tickets.changeTags');
    expect(matchCommand({ method: 'set', uri: '/tickets/atual/transfer' })?.route).toBe('pipe.tickets.transfer');
    expect(matchCommand({ method: 'set', uri: '/tickets/atual/status' })?.route).toBe('pipe.tickets.status');
    expect(matchCommand({ method: 'set', uri: '/tickets/atual/priority' })?.route).toBe('pipe.tickets.priority');
    expect(matchCommand({ method: 'get', uri: '/tickets/atual' })?.route).toBe('pipe.tickets.get');
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/1/change-tags' })?.route).toBe('pipe.tickets.changeTags');
  });

  it('routes Desk writes; the Desk transfer wins over the Pipe one for the Desk recipient', () => {
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/change-status' })?.route).toBe('desk.tickets.changeStatus');
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/change-status-without-redirect' })?.route).toBe('desk.tickets.changeStatus');
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/abc/close' })).toMatchObject({ route: 'desk.tickets.close', params: { id: 'abc' } });
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets//close' })).toMatchObject({ route: 'desk.tickets.close', params: { id: '' } });
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/abc/transfer' })?.route).toBe('desk.tickets.transfer');
    expect(matchCommand({ method: 'set', uri: '/tickets/abc/transfer' })?.route).toBe('pipe.tickets.transfer');
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets' })).toMatchObject({ route: 'desk.tickets.create', params: {} });
    expect(matchCommand({ to: desk, method: 'set', uri: '/tickets/5511999%40wa.gw.msging.net' })).toMatchObject({
      route: 'desk.tickets.create',
      params: { customer: '5511999@wa.gw.msging.net' },
    });
    expect(matchCommand({ to: desk, method: 'set', uri: '/attendance-survey-answer' })?.route).toBe('desk.attendanceSurveyAnswer');
  });

  it('rejects what has no row', () => {
    expect(matchCommand({ method: 'get', uri: '/teams' })).toBeNull();
    expect(matchCommand({ to: desk, method: 'set', uri: '/teams' })).toBeNull();
    expect(matchCommand({ to: 'postmaster@builder.msging.net', method: 'get', uri: '/attendants' })).toBeNull();
    expect(matchCommand({ method: 'get', uri: '/tickets/a/b/status' })).toBeNull();
    // Desk writes need the Desk recipient and `set`.
    expect(matchCommand({ to: desk, method: 'delete', uri: '/tickets/change-status' })).toBeNull();
    expect(matchCommand({ method: 'set', uri: '/tickets/change-status' })).toBeNull();
    expect(matchCommand({ method: 'set', uri: '/attendance-survey-answer' })).toBeNull();
    expect(matchCommand({ method: 'get', uri: 'https://router.example/anything' })).toBeNull();
  });
});

/** The distinct Desk reads of the production export (`desk180326…json`), settings verbatim. */
const EXPORT_DESK_READS = [
  { to: 'postmaster@desk.msging.net', method: 'get', uri: '/teams', variable: 'getQueuesBody', from: '{{application.identity}}' },
  {
    to: 'postmaster@desk.msging.net',
    method: 'get',
    uri: "/tickets?$filter=customerIdentity%20eq%20'{{tunnel.identity}}'",
    from: '{{application.identity}}',
    variable: 'currentTicketResponse',
  },
  { to: 'postmaster@desk.msging.net', method: 'get', uri: '/teams/agents-online', from: '{{application.identity}}', variable: 'getAgentsOnline' },
] as const;

describe('ProcessCommand with the export Desk reads', () => {
  it('routes each command and stores the response for the scripts that parse it', async () => {
    const requests: CommandRequest[] = [];
    const c: Context = {
      user: 'contato-1',
      flow: {
        id: 'fluxo-1',
        states: [{
          id: 'raiz',
          root: true,
          input: {},
          outputActions: EXPORT_DESK_READS.map((settings) => ({ type: 'ProcessCommand', settings: { ...settings } })),
          outputs: [],
        }],
      },
      inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
      variables: {},
      inboundContext: new Map(),
      providers: { tunnel: () => 'contato-1', application: () => 'bot@msging.net' },
      services: {
        send: async () => {},
        forwardForAttendance: async () => ({ id: 'ticket-1' }),
        registerEvent: async () => {},
        processCommand: async (request) => {
          requests.push(request);
          return { status: 'success', type: 'application/vnd.lime.collection+json', resource: { total: 1, items: [{ name: 'Default', agentsOnline: 1 }] } };
        },
      },
    };
    await processInbound(c);
    expect(requests.map((r) => r.command.route)).toEqual(['desk.teams.list', 'desk.tickets.list', 'desk.teams.agentsOnline']);
    expect(requests[1]!.command.query.get('$filter')).toBe("customerIdentity eq 'contato-1'");
    expect(JSON.parse(c.variables['getAgentsOnline']!).resource.items[0].agentsOnline).toBe(1);
  });

  it('still fails an unknown URI with the same message', async () => {
    const c: Context = {
      user: 'contato-1',
      flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: [
        { type: 'ProcessCommand', settings: { to: 'postmaster@desk.msging.net', method: 'set', uri: '/attendance-queues', variable: 'x' } },
      ], outputs: [] }] },
      inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
      variables: {},
      inboundContext: new Map(),
      services: { send: async () => {}, forwardForAttendance: async () => ({ id: 't' }), registerEvent: async () => {}, processCommand: async () => null },
    };
    await expect(processInbound(c)).rejects.toThrow("A URI '/attendance-queues' não é executada no Pipe.");
  });
});

/** The export's "Logica - Atendimento finalizado pelo cliente" block, settings verbatim. */
const EXPORT_DESK_WRITES = [
  {
    to: 'postmaster@desk.msging.net',
    method: 'set',
    uri: '/tickets/change-status',
    resource: { id: '{{sequentialIdFromTicket}}', status: 'ClosedClient' },
    type: 'application/json',
    from: '{{application.identity}}',
    variable: 'getCloseResponse',
  },
  {
    to: 'postmaster@desk.msging.net',
    method: 'set',
    uri: '/tickets/{{ticketId}}/close',
    from: '{{application.identity}}',
    variable: 'finalizarResponse',
    resource: {
      id: '{{random.guid}}',
      customerIdentity: '{{tunnel.identity}}',
      ownerIdentity: '{{application.identifier}}@msging.net',
      status: 'ClosedClient',
      tags: ['Encerrado pelo Cliente'],
    },
  },
] as const;

describe('ProcessCommand with the export Desk writes', () => {
  it('routes change-status and the close of an unset ticket id, with the resources resolved', async () => {
    const requests: CommandRequest[] = [];
    const c: Context = {
      user: 'contato-1',
      flow: {
        id: 'fluxo-1',
        states: [{
          id: 'raiz',
          root: true,
          input: {},
          outputActions: [
            { type: 'SetVariable', settings: { variable: 'sequentialIdFromTicket', value: '42' } },
            ...EXPORT_DESK_WRITES.map((settings) => ({ type: 'ProcessCommand', settings: { ...settings } })),
          ],
          outputs: [],
        }],
      },
      inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'sair' }),
      variables: {},
      inboundContext: new Map(),
      providers: { tunnel: () => 'contato-1', application: () => 'bot' },
      services: {
        send: async () => {},
        forwardForAttendance: async () => ({ id: 'ticket-1' }),
        registerEvent: async () => {},
        processCommand: async (request) => {
          requests.push(request);
          return { method: 'set', status: 'success' };
        },
      },
    };
    await processInbound(c);
    expect(requests.map((r) => [r.command.route, r.command.params])).toEqual([
      ['desk.tickets.changeStatus', {}],
      ['desk.tickets.close', { id: '' }],
    ]);
    expect(requests[0]!.resource).toEqual({ id: '42', status: 'ClosedClient' });
    expect(requests[1]!.resource).toMatchObject({ customerIdentity: 'contato-1', tags: ['Encerrado pelo Cliente'] });
    expect(JSON.parse(c.variables['finalizarResponse']!)).toEqual({ method: 'set', status: 'success' });
  });
});
