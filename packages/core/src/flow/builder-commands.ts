/**
 * Builder and core bot commands whose data lives in the running execution: the contact's context
 * variables, Master-State, buckets, resources, the contact and the current flow id. They answer in
 * Blip's command shape (`{method, status, type, resource}`, or `status: 'failure'` with a LIME
 * reason) because imported flows read the response JSON (`{{flowIdMain@resource}}`). Commands that
 * need tenant data (`/flow-id?shortname=`, `/configuration/caller`) go to the `api`.
 */

import type { CommandRequest, Context } from './context.js';
import {
  EXPIRATIONS_KEY,
  contextGetVariable,
  deleteVariable,
  flowSessionKey,
  setVariable,
  stateKey,
} from './context.js';

export type CommandResponse = Record<string, unknown>;

const success = (method: string, type?: string, resource?: unknown): CommandResponse =>
  type === undefined ? { method, status: 'success' } : { method, status: 'success', type, resource };

/** LIME reasons: 67 = resource not found, 1 = general error (the command is valid, Pipe can't run it). */
const failure = (method: string, code: 1 | 67, description: string): CommandResponse => ({
  method,
  status: 'failure',
  reason: { code, description },
});

const BOT_DOMAIN = 'msging.net';
const MASTER_STATE = 'master-state';

const asText = (value: unknown): string =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

/** A stored text is returned as a JSON document when it parses to one, like Blip's typed resources. */
function typed(method: string, value: string): CommandResponse {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return success(method, 'application/json', parsed);
  } catch {
    /* plain text */
  }
  return success(method, 'text/plain', value);
}

const digits = (value: unknown): string => (typeof value === 'string' ? value.replace(/\D/g, '') : '');

/**
 * The execution's contact under any identity a Blip flow sends: Pipe's id (`contact.identity`,
 * `tunnel.identity`) or a channel identity (`5511…@wa.gw.msging.net`).
 * ponytail: other contacts are refused; add a DB lookup of their execution if a flow needs it.
 */
function isCurrentContact(context: Context, identity: string): boolean {
  const local = identity.includes('@') ? identity.slice(0, identity.indexOf('@')) : identity;
  if ([identity, local].includes(context.user)) return true;
  const contactId = context.contact?.['identity'];
  if (typeof contactId === 'string' && [identity, local].includes(contactId)) return true;
  const phone = digits(context.contact?.['phoneNumber']);
  return phone.length > 0 && digits(local) === phone;
}

/**
 * Blip keys the saved block as `stateid@{flow}`; Pipe as `stateId@{flow}`. The subflow session
 * (`currentFlowSession@{flow}`, P12) keeps Blip's spelling whatever the case the flow sends.
 */
function variableKey(name: string): string {
  const state = name.match(/^stateid@(.+)$/i);
  if (state) return stateKey(state[1]!);
  const session = name.match(/^currentflowsession@(.+)$/i);
  return session ? flowSessionKey(session[1]!) : name;
}

function visibleVariables(context: Context): string[] {
  return Object.keys(context.variables).filter(
    (name) => name !== EXPIRATIONS_KEY && !name.startsWith('#') && contextGetVariable(context, name) !== null,
  );
}

async function masterState(context: Context, method: string, resource: unknown): Promise<CommandResponse> {
  const app = context.application;
  if (method === 'get') {
    return app?.routerIdentifier
      ? success(method, 'text/plain', `${app.identifier}@${BOT_DOMAIN}`)
      : failure(method, 67, 'O contato não está num roteador.');
  }
  if (method === 'set') {
    // Blip names the subbot (`shortName@msging.net`); Pipe's redirect accepts it or the service name.
    const target = asText(resource).trim().replace(/@msging\.net$/i, '');
    if (!target) return failure(method, 1, 'Informe o serviço do roteador no resource.');
    if (!context.services.redirect) return failure(method, 1, 'O Master-State só funciona atrás de um roteador.');
    await context.services.redirect({ endereco: target, context: null });
    return success(method);
  }
  return failure(method, 1, 'O Pipe não apaga o Master-State; use set com o serviço principal.');
}

async function contextCommand(context: Context, request: CommandRequest): Promise<CommandResponse> {
  const { method, params, query } = request.command;
  if (!isCurrentContact(context, params['identity'] ?? '')) {
    return failure(method, 1, 'O Pipe só acessa o contexto do contato desta conversa.');
  }
  if (request.command.route === 'builder.contexts.list') {
    const names = visibleVariables(context);
    if ((query.get('withContextValues') ?? '').toLowerCase() === 'true') {
      const items = names.map((name) => ({ name, value: contextGetVariable(context, name) }));
      return success(method, 'application/vnd.lime.collection+json', { total: items.length, itemType: 'application/json', items });
    }
    return success(method, 'application/vnd.lime.collection+json', { total: names.length, itemType: 'text/plain', items: names });
  }
  const name = params['variable'] ?? '';
  if (name.toLowerCase() === MASTER_STATE) return masterState(context, method, request.resource);
  const key = variableKey(name);
  // `#expirations` and any other `#` key are engine bookkeeping, never a flow variable.
  if (key.startsWith('#')) return failure(method, 67, `A variável '${name}' não existe no contexto.`);
  if (method === 'get') {
    const value = contextGetVariable(context, key);
    return value === null ? failure(method, 67, `A variável '${name}' não existe no contexto.`) : success(method, 'text/plain', value);
  }
  if (method === 'set') setVariable(context, key, asText(request.resource));
  else deleteVariable(context, key);
  return success(method);
}

async function bucketCommand(context: Context, request: CommandRequest): Promise<CommandResponse> {
  const { method, params, query } = request.command;
  const key = params['id'] ?? '';
  const { bucketGet, bucketSet, bucketDelete } = context.services;
  // Blip buckets belong to the bot, not to a contact.
  if (method === 'get') {
    const value = bucketGet ? await bucketGet({ key, scope: 'global' }) : null;
    if (value === null || value === undefined) return failure(method, 67, `O bucket '${key}' não existe.`);
    return typeof value === 'string' ? success(method, 'text/plain', value) : success(method, 'application/json', value);
  }
  if (method === 'set') {
    if (!bucketSet) return failure(method, 1, 'O bucket não está disponível neste fluxo.');
    const expirationMs = Number(query.get('expiration'));
    const resource = request.resource;
    await bucketSet({
      key,
      type: typeof resource === 'string' ? 'text/plain' : 'application/json',
      value: resource ?? null,
      scope: 'global',
      ...(Number.isFinite(expirationMs) && expirationMs > 0 ? { expirationSeconds: Math.ceil(expirationMs / 1000) } : {}),
    });
    return success(method);
  }
  if (!bucketDelete) return failure(method, 1, 'O bucket não está disponível neste fluxo.');
  await bucketDelete({ key, scope: 'global' });
  return success(method);
}

async function contactCommand(context: Context, request: CommandRequest): Promise<CommandResponse> {
  const { method, params } = request.command;
  if (request.command.route === 'crm.contacts.get') {
    return isCurrentContact(context, params['identity'] ?? '') && context.contact
      ? success(method, 'application/vnd.lime.contact+json', context.contact)
      : failure(method, 67, `O contato '${params['identity'] ?? ''}' não existe.`);
  }
  let fields: unknown = request.resource;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      /* rejected below */
    }
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return failure(method, 1, 'O resource do contato deve ser um objeto.');
  }
  const identity = (fields as Record<string, unknown>)['identity'];
  if (typeof identity === 'string' && identity.trim() && !isCurrentContact(context, identity.trim())) {
    return failure(method, 1, 'O Pipe só altera o contato desta conversa.');
  }
  if (!context.services.mergeContact) return failure(method, 1, 'O contato não pode ser alterado neste fluxo.');
  await context.services.mergeContact(fields as Record<string, unknown>);
  return success(method);
}

/**
 * `get /tunnels/{id}` (`postmaster@tunnel.msging.net`): Blip resolves a router tunnel to the
 * customer's channel identity (`originator`). Pipe has no tunnel ids: the contact is unique in the
 * tenant, so the only tunnel a bot can resolve is its own contact's, whatever identity names it.
 */
function tunnelCommand(context: Context, request: CommandRequest): CommandResponse {
  const { method, params } = request.command;
  const id = params['id'] ?? '';
  if (!isCurrentContact(context, id)) return failure(method, 67, `O túnel '${id}' não existe.`);
  const app = context.application;
  const self = app?.identifier ? `${app.identifier}@${BOT_DOMAIN}` : null;
  const owner = app?.routerIdentifier ? `${app.routerIdentifier}@${BOT_DOMAIN}` : self;
  const phone = digits(context.contact?.['phoneNumber']);
  return success(method, 'application/vnd.iris.tunnel+json', {
    owner,
    originator: phone ? `${phone}@wa.gw.msging.net` : context.user,
    destination: self,
  });
}

/**
 * Runs the command here when its data is in the execution; `undefined` means the `api` runs it.
 */
export async function runLocalCommand(context: Context, request: CommandRequest): Promise<CommandResponse | undefined> {
  const { route, method, params, query } = request.command;
  switch (route) {
    case 'builder.flowId':
      // Without `shortname`, the flow that asks.
      return query.has('shortname') ? undefined : success(method, 'text/plain', context.flow.id);
    case 'builder.contexts.list':
    case 'builder.contexts.variable':
      return contextCommand(context, request);
    case 'core.buckets.item':
      return bucketCommand(context, request);
    case 'core.resources.item': {
      const value = context.resources?.[params['id'] ?? ''];
      return value === undefined ? failure(method, 67, `O recurso '${params['id'] ?? ''}' não existe.`) : typed(method, value);
    }
    case 'crm.contacts.merge':
    case 'crm.contacts.get':
      return contactCommand(context, request);
    case 'tunnel.item':
      return tunnelCommand(context, request);
  }
  return undefined;
}
