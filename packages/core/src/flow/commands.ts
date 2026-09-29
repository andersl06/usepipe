/**
 * Routes a LIME command (`to` + `method` + `uri`) from `ProcessCommand`/`SendCommand` to a named Pipe
 * handler. The table is the whole contract: a command Pipe runs has a row here and a handler under the
 * same name in the api; anything else fails before it leaves the engine.
 */

/** Blip extension addresses reduced to their service: `postmaster@desk.msging.net` → `desk`. */
export type CommandRecipient = 'desk' | 'builder' | 'crm' | 'core' | (string & {});

export function commandRecipient(to: string | null | undefined): CommandRecipient {
  const address = (to ?? '').trim().toLowerCase();
  if (!address) return 'core';
  const domain = address.includes('@') ? address.slice(address.lastIndexOf('@') + 1) : address;
  if (domain === 'msging.net') return 'core';
  const match = domain.match(/^([a-z0-9-]+)\.msging\.net$/);
  return match ? match[1]! : domain;
}

export interface CommandRoute {
  name: string;
  /** `*` accepts any recipient: the Pipe-vocabulary routes predate `to` routing. `a|b` accepts either. */
  recipient: CommandRecipient | '*';
  /** Lowercase LIME method, `a|b` for several, or `*`. */
  method: string;
  /** Tested against the path without its query string; named groups become `params`. */
  path: RegExp;
}

/** First match wins, so specific recipients come before the `*` routes that share a path. */
export const COMMAND_ROUTES: readonly CommandRoute[] = Object.freeze([
  { name: 'desk.tickets.list', recipient: 'desk', method: 'get', path: /^\/tickets$/ },
  { name: 'desk.tickets.get', recipient: 'desk', method: 'get', path: /^\/tickets?\/(?<id>[^/]+)$/ },
  { name: 'desk.teams.list', recipient: 'desk', method: 'get', path: /^\/teams$/ },
  { name: 'desk.teams.agentsOnline', recipient: 'desk', method: 'get', path: /^\/teams\/agents-online$/ },
  { name: 'desk.attendants.list', recipient: 'desk', method: 'get', path: /^\/attendants$/ },
  { name: 'pipe.tickets.get', recipient: '*', method: 'get', path: /^\/tickets\/(?<id>[^/]+)$/ },
  { name: 'pipe.tickets.changeTags', recipient: '*', method: '*', path: /^\/tickets\/(?<id>[^/]+)\/change-tags$/ },
  { name: 'pipe.tickets.transfer', recipient: '*', method: '*', path: /^\/tickets\/(?<id>[^/]+)\/transfer$/ },
  { name: 'pipe.tickets.status', recipient: '*', method: '*', path: /^\/tickets\/(?<id>[^/]+)\/status$/ },
  { name: 'pipe.tickets.priority', recipient: '*', method: '*', path: /^\/tickets\/(?<id>[^/]+)\/priority$/ },
  // Builder and core bot commands. Blip documents `/contexts` under both `builder` and `core` (Master-State).
  { name: 'builder.flowId', recipient: 'builder', method: 'get', path: /^\/flow-id$/ },
  { name: 'builder.contexts.list', recipient: 'builder|core', method: 'get', path: /^\/contexts\/(?<identity>[^/]+)$/ },
  {
    name: 'builder.contexts.variable',
    recipient: 'builder|core',
    method: 'get|set|delete',
    path: /^\/contexts\/(?<identity>[^/]+)\/(?<variable>[^/]+)$/,
  },
  { name: 'core.configuration.caller', recipient: 'core', method: 'get', path: /^\/configuration\/caller$/ },
  { name: 'core.buckets.item', recipient: 'core', method: 'get|set|delete', path: /^\/buckets\/(?<id>[^/]+)$/ },
  { name: 'core.resources.item', recipient: 'core', method: 'get', path: /^\/resources\/(?<id>[^/]+)$/ },
  { name: 'crm.contacts.merge', recipient: 'crm|core', method: 'set|merge', path: /^\/contacts$/ },
  { name: 'crm.contacts.get', recipient: 'crm|core', method: 'get', path: /^\/contacts\/(?<identity>[^/]+)$/ },
]);

export interface CommandMatch {
  route: string;
  recipient: CommandRecipient;
  method: string;
  params: Record<string, string>;
  /** Decoded query string (`$filter`, `$take`, `$closed`, ...). */
  query: URLSearchParams;
}

export function matchCommand(
  command: { to?: string | null; method?: string | null; uri: string },
  routes: readonly CommandRoute[] = COMMAND_ROUTES,
): CommandMatch | null {
  const recipient = commandRecipient(command.to);
  const method = (command.method ?? '').trim().toLowerCase();
  const [path = '', search = ''] = command.uri.trim().split(/\?(.*)/s, 2);
  for (const route of routes) {
    if (route.recipient !== '*' && !route.recipient.split('|').includes(recipient)) continue;
    if (route.method !== '*' && !route.method.split('|').includes(method)) continue;
    const found = path.match(route.path);
    if (!found) continue;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(found.groups ?? {})) params[key] = safeDecode(value);
    return { route: route.name, recipient, method, params, query: new URLSearchParams(search) };
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
