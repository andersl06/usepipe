import { describe, expect, it } from 'vitest';
import { matchCommand } from './commands.js';
import { EXPIRATIONS_KEY, createInbound, setVariable, stateKey, type CommandRequest, type Context } from './context.js';
import { processInbound } from './manager.js';
import type { Acao } from './modelos.js';
import fixture from './fixtures/export-router-flow-ids.json' with { type: 'json' };

const BUILDER = 'postmaster@builder.msging.net';
const CORE = 'postmaster@msging.net';
const CRM = 'postmaster@crm.msging.net';

function context(actions: Acao[] = []): Context {
  return {
    user: 'contato-1',
    flow: { id: 'fluxo-1', states: [{ id: 'raiz', root: true, input: {}, outputActions: actions, outputs: [] }] },
    inbound: createInbound({ id: 'entrada-1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {},
    inboundContext: new Map(),
    contact: { identity: 'contato-1', name: 'Ana', phoneNumber: '+5511988887777', extras: {} },
    resources: { saudacao: 'Olá', config: '{"horario":"8h"}' },
    application: { identifier: 'atendimento', routerIdentifier: 'roteador' },
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'ticket-1' }),
      registerEvent: async () => {},
    },
  };
}

const command = (settings: Record<string, unknown>): Acao => ({ type: 'ProcessCommand', settings });

const response = (c: Context, name: string): Record<string, unknown> => JSON.parse(c.variables[name]!) as Record<string, unknown>;

describe('matchCommand — Builder and core rows', () => {
  it('routes each P5 command by recipient, method and path', () => {
    expect(matchCommand({ to: BUILDER, method: 'get', uri: '/flow-id' })?.route).toBe('builder.flowId');
    expect(matchCommand({ to: BUILDER, method: 'get', uri: '/flow-id?shortname=main' })?.query.get('shortname')).toBe('main');
    expect(matchCommand({ to: BUILDER, method: 'get', uri: '/contexts/c-1' })?.route).toBe('builder.contexts.list');
    expect(matchCommand({ to: CORE, method: 'delete', uri: '/contexts/c-1/nome' })).toMatchObject({
      route: 'builder.contexts.variable',
      params: { identity: 'c-1', variable: 'nome' },
    });
    expect(matchCommand({ to: CORE, method: 'get', uri: '/configuration/caller' })?.route).toBe('core.configuration.caller');
    expect(matchCommand({ method: 'set', uri: '/buckets/chave?expiration=1000' })?.route).toBe('core.buckets.item');
    expect(matchCommand({ method: 'get', uri: '/resources/saudacao' })?.route).toBe('core.resources.item');
    expect(matchCommand({ to: CRM, method: 'merge', uri: '/contacts' })?.route).toBe('crm.contacts.merge');
    expect(matchCommand({ to: CRM, method: 'get', uri: '/contacts/c-1%40wa.gw.msging.net' })).toMatchObject({
      route: 'crm.contacts.get',
      params: { identity: 'c-1@wa.gw.msging.net' },
    });
  });

  it('keeps the recipient and method restrictions', () => {
    expect(matchCommand({ to: CORE, method: 'get', uri: '/flow-id' })).toBeNull();
    expect(matchCommand({ to: BUILDER, method: 'set', uri: '/flow-id' })).toBeNull();
    expect(matchCommand({ to: BUILDER, method: 'get', uri: '/buckets/x' })).toBeNull();
    expect(matchCommand({ to: CORE, method: 'set', uri: '/resources/x' })).toBeNull();
  });
});

describe('context variables (`/contexts/{identity}/{variable}`)', () => {
  it('sets, gets and deletes a variable of the current contact in Blip shape', async () => {
    const c = context([
      command({ to: BUILDER, method: 'set', uri: '/contexts/{{contact.identity}}/plano', type: 'text/plain', resource: 'ouro', variable: 'r1' }),
      command({ to: BUILDER, method: 'get', uri: '/contexts/{{contact.identity}}/plano', variable: 'r2' }),
      command({ to: BUILDER, method: 'delete', uri: '/contexts/contato-1/plano', variable: 'r3' }),
      command({ to: BUILDER, method: 'get', uri: '/contexts/contato-1/plano', variable: 'r4' }),
    ]);
    await processInbound(c);
    expect(response(c, 'r1')).toEqual({ method: 'set', status: 'success' });
    expect(response(c, 'r2')).toEqual({ method: 'get', status: 'success', type: 'text/plain', resource: 'ouro' });
    expect(response(c, 'r3')).toEqual({ method: 'delete', status: 'success' });
    expect(response(c, 'r4')).toMatchObject({ method: 'get', status: 'failure', reason: { code: 67 } });
    expect(c.variables['plano']).toBeUndefined();
  });

  it('accepts the contact under its channel identity and refuses other contacts', async () => {
    const c = context([
      command({ to: CORE, method: 'set', uri: '/contexts/5511988887777@wa.gw.msging.net/canal', resource: 'wa', variable: 'r1' }),
      command({ to: CORE, method: 'get', uri: '/contexts/outro-contato/canal', variable: 'r2' }),
    ]);
    await processInbound(c);
    expect(response(c, 'r1')).toMatchObject({ status: 'success' });
    expect(c.variables['canal']).toBe('wa');
    expect(response(c, 'r2')).toMatchObject({ status: 'failure', reason: { code: 1 } });
  });

  it('maps `stateid@{flow}` to the saved block of that flow', async () => {
    const c = context([command({ to: BUILDER, method: 'get', uri: '/contexts/contato-1/stateid@fluxo-2', variable: 'r' })]);
    c.variables[stateKey('fluxo-2')] = 'bloco-9';
    await processInbound(c);
    expect(response(c, 'r')).toMatchObject({ status: 'success', resource: 'bloco-9' });
  });

  it('lists the variables without the internal `#expirations` key, with values on request', async () => {
    const c = context([
      command({ to: BUILDER, method: 'get', uri: '/contexts/contato-1', variable: 'names' }),
      command({ to: BUILDER, method: 'get', uri: '/contexts/contato-1?withContextValues=true', variable: 'values' }),
      command({ to: BUILDER, method: 'get', uri: `/contexts/contato-1/${encodeURIComponent(EXPIRATIONS_KEY)}`, variable: 'hidden' }),
    ]);
    setVariable(c, 'cidade', 'Recife', 3600);
    await processInbound(c);
    expect(c.variables[EXPIRATIONS_KEY]).toBeDefined();
    const names = response(c, 'names')['resource'] as { items: string[] };
    expect(names.items).toContain('cidade');
    expect(names.items.some((name) => name.startsWith('#'))).toBe(false);
    const values = response(c, 'values')['resource'] as { items: { name: string; value: string }[] };
    expect(values.items).toContainEqual({ name: 'cidade', value: 'Recife' });
    expect(values.items.some((item) => item.name.startsWith('#'))).toBe(false);
    expect(response(c, 'hidden')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });
});

describe('Master-State', () => {
  it('reads the current service and redirects by its short name', async () => {
    const redirects: unknown[] = [];
    const c = context([
      command({ to: CORE, method: 'get', uri: '/contexts/contato-1/Master-State', variable: 'atual' }),
      command({ to: CORE, method: 'set', uri: '/contexts/contato-1/Master-State', type: 'text/plain', resource: 'vendas@msging.net', variable: 'r' }),
    ]);
    c.services.redirect = async (pedido) => {
      redirects.push(pedido);
    };
    await processInbound(c);
    expect(response(c, 'atual')).toEqual({ method: 'get', status: 'success', type: 'text/plain', resource: 'atendimento@msging.net' });
    expect(redirects).toEqual([{ endereco: 'vendas', context: null }]);
    expect(response(c, 'r')).toEqual({ method: 'set', status: 'success' });
  });

  it('answers failure outside a router', async () => {
    const c = context([command({ to: CORE, method: 'set', uri: '/contexts/contato-1/master-state', resource: 'vendas', variable: 'r' })]);
    c.application = { identifier: 'atendimento', routerIdentifier: null };
    await processInbound(c);
    expect(response(c, 'r')).toMatchObject({ status: 'failure', reason: { code: 1 } });
  });
});

describe('buckets, resources and contacts', () => {
  it('stores, reads and deletes a bot bucket with expiration in milliseconds', async () => {
    const store = new Map<string, unknown>();
    const expirations: unknown[] = [];
    const c = context([
      command({ to: CORE, method: 'set', uri: '/buckets/checkout?expiration=90000', type: 'application/json', resource: { total: 10 }, variable: 'r1' }),
      command({ to: CORE, method: 'get', uri: '/buckets/checkout', variable: 'r2' }),
      command({ method: 'delete', uri: '/buckets/checkout', variable: 'r3' }),
      command({ method: 'get', uri: '/buckets/checkout', variable: 'r4' }),
    ]);
    c.services.bucketSet = async ({ key, value, scope, expirationSeconds }) => {
      store.set(`${scope}:${key}`, value);
      expirations.push(expirationSeconds);
    };
    c.services.bucketGet = async ({ key, scope }) => store.get(`${scope}:${key}`) ?? null;
    c.services.bucketDelete = async ({ key, scope }) => {
      store.delete(`${scope}:${key}`);
    };
    await processInbound(c);
    expect(response(c, 'r1')).toEqual({ method: 'set', status: 'success' });
    expect(expirations).toEqual([90]);
    expect(response(c, 'r2')).toEqual({ method: 'get', status: 'success', type: 'application/json', resource: { total: 10 } });
    expect(response(c, 'r3')).toEqual({ method: 'delete', status: 'success' });
    expect(response(c, 'r4')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });

  it('reads the flow resources, typed like Blip', async () => {
    const c = context([
      command({ method: 'get', uri: '/resources/saudacao', variable: 'texto' }),
      command({ method: 'get', uri: '/resources/config', variable: 'json' }),
      command({ method: 'get', uri: '/resources/nada', variable: 'ausente' }),
    ]);
    await processInbound(c);
    expect(response(c, 'texto')).toMatchObject({ type: 'text/plain', resource: 'Olá' });
    expect(response(c, 'json')).toMatchObject({ type: 'application/json', resource: { horario: '8h' } });
    expect(response(c, 'ausente')).toMatchObject({ status: 'failure', reason: { code: 67 } });
  });

  it('gets and merges the current contact', async () => {
    const merged: unknown[] = [];
    const c = context([
      command({ to: CRM, method: 'get', uri: '/contacts/contato-1', variable: 'contato' }),
      command({ to: CRM, method: 'merge', uri: '/contacts', type: 'application/vnd.lime.contact+json', resource: { identity: 'contato-1', email: 'ana@exemplo.test' }, variable: 'r' }),
      command({ to: CRM, method: 'merge', uri: '/contacts', resource: { identity: 'outro', email: 'x@exemplo.test' }, variable: 'outro' }),
    ]);
    c.services.mergeContact = async (fields) => {
      merged.push(fields);
    };
    await processInbound(c);
    expect(response(c, 'contato')).toMatchObject({ type: 'application/vnd.lime.contact+json', resource: { name: 'Ana' } });
    expect(response(c, 'r')).toEqual({ method: 'merge', status: 'success' });
    expect(merged).toEqual([{ identity: 'contato-1', email: 'ana@exemplo.test' }]);
    expect(response(c, 'outro')).toMatchObject({ status: 'failure', reason: { code: 1 } });
  });

  it('answers `get /flow-id` locally and sends `?shortname=` to the api', async () => {
    const requests: CommandRequest[] = [];
    const c = context([
      command({ to: BUILDER, method: 'get', uri: '/flow-id', variable: 'proprio' }),
      command({ to: BUILDER, method: 'get', uri: '/flow-id?shortname=vendas', variable: 'outro' }),
    ]);
    c.services.processCommand = async (request) => {
      requests.push(request);
      return { method: 'get', status: 'success', type: 'text/plain', resource: 'fluxo-vendas' };
    };
    await processInbound(c);
    expect(response(c, 'proprio')).toEqual({ method: 'get', status: 'success', type: 'text/plain', resource: 'fluxo-1' });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ flowId: 'fluxo-1', command: { route: 'builder.flowId' } });
    expect(response(c, 'outro')['resource']).toBe('fluxo-vendas');
  });
});

describe('export fixture: 10 `get /flow-id?shortname=` → `set stateid@{{flowIdX@resource}}` pairs', () => {
  /** Router services as `get /configuration/caller` returns them; the flow ids the api resolves. */
  const SERVICES = ['Main', 'NotaCerta', 'Tratativas', 'PreMain', 'PreDesk', 'PreSurvey', 'PostSurvey', 'PreEnd', 'PreFaq', 'PostHS'];
  const shortNameOf = (service: string): string => `sub-${service.toLowerCase()}`;
  const flowIdOf = (shortName: string): string => `id-${shortName}`;

  it('resolves every service to its flow and moves each flow to `onboarding`', async () => {
    const actions = [...fixture.enteringActions, ...fixture.leavingActions] as Acao[];
    const c = context(actions);
    const routes: string[] = [];
    const states: { flowId: string; stateId: string }[] = [];
    c.services.processCommand = async (request) => {
      routes.push(request.command.route);
      if (request.command.route === 'core.configuration.caller') {
        const children = SERVICES.map((service) => ({ service, shortName: shortNameOf(service), isDefault: service === 'Main' }));
        return {
          method: 'get',
          status: 'success',
          type: 'application/vnd.lime.collection+json',
          resource: { total: 1, items: [{ name: 'Application', value: JSON.stringify({ settings: { children } }) }] },
        };
      }
      return { method: 'get', status: 'success', type: 'text/plain', resource: flowIdOf(request.command.query.get('shortname') ?? '') };
    };
    // The export's own script, run as a plain function (the api runs it in the sandbox).
    c.services.runScript = async ({ source, functionName, args }) =>
      new Function(`${source}\nreturn ${functionName};`)()(...args);
    c.services.setFlowState = async (request) => {
      states.push(request);
      return true;
    };

    await processInbound(c);

    expect(routes).toEqual(['core.configuration.caller', ...SERVICES.map(() => 'builder.flowId')]);
    const leavingOrder = ['Main', 'NotaCerta', 'Tratativas', 'PreMain', 'PreFaq', 'PreDesk', 'PreSurvey', 'PostSurvey', 'PreEnd', 'PostHS'];
    expect(states).toEqual(leavingOrder.map((service) => ({ flowId: flowIdOf(shortNameOf(service)), stateId: 'onboarding' })));
    expect(c.variables['processedContext']).toBe('{"status":"success"}');
  });
});
