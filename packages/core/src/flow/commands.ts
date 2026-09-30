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
  // Desk writes in Blip's vocabulary. `change-status` precedes `/tickets/{customerIdentity}`; an
  // empty ticket id (`/tickets//close`, an unset `{{ticketId}}`) means the bot's own ticket.
  { name: 'desk.tickets.changeStatus', recipient: 'desk', method: 'set', path: /^\/tickets\/change-status(?:-without-redirect)?$/ },
  { name: 'desk.tickets.close', recipient: 'desk', method: 'set', path: /^\/tickets\/(?<id>[^/]*)\/close$/ },
  { name: 'desk.tickets.transfer', recipient: 'desk', method: 'set', path: /^\/tickets\/(?<id>[^/]*)\/transfer$/ },
  { name: 'desk.tickets.create', recipient: 'desk', method: 'set', path: /^\/tickets(?:\/(?<customer>[^/]+))?$/ },
  { name: 'desk.attendanceSurveyAnswer', recipient: 'desk', method: 'set', path: /^\/attendance-survey-answer$/ },
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
  // P7: scheduled messages, broadcast lists, analytics events, tunnels and the click tracker.
  { name: 'scheduler.schedules.set', recipient: 'scheduler', method: 'set', path: /^\/schedules$/ },
  { name: 'scheduler.schedules.item', recipient: 'scheduler', method: 'get|delete', path: /^\/schedules\/(?<id>[^/]+)$/ },
  { name: 'broadcast.lists', recipient: 'broadcast', method: 'get|set', path: /^\/lists$/ },
  { name: 'broadcast.lists.item', recipient: 'broadcast', method: 'get|delete', path: /^\/lists\/(?<list>[^/]+)$/ },
  { name: 'broadcast.recipients', recipient: 'broadcast', method: 'get|set', path: /^\/lists\/(?<list>[^/]+)\/recipients$/ },
  {
    name: 'broadcast.recipients.item',
    recipient: 'broadcast',
    method: 'get|delete',
    path: /^\/lists\/(?<list>[^/]+)\/recipients\/(?<id>[^/]+)$/,
  },
  { name: 'analytics.eventTrack', recipient: 'analytics', method: 'get|set', path: /^\/event-track$/ },
  { name: 'analytics.eventTrack.category', recipient: 'analytics', method: 'get', path: /^\/event-track\/(?<category>[^/]+)$/ },
  { name: 'tunnel.item', recipient: 'tunnel', method: 'get', path: /^\/tunnels\/(?<id>[^/]+)$/ },
  { name: 'clicktracker.encode', recipient: 'clicktracker', method: 'set', path: /^\/entrypoint\/encode$/ },
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
    for (const [key, value] of Object.entries(found.groups ?? {})) if (value !== undefined) params[key] = safeDecode(value);
    return { route: route.name, recipient, method, params, query: new URLSearchParams(search) };
  }
  return null;
}

/** `/contexts/{contact}/stateid@{flowId}` — Blip's context route for a flow's saved state (D-55). */
export const CONTEXT_STATE_URI = /^\/contexts\/[^/]*\/stateid@([^/?#]+)$/i;

/**
 * Whether the engine runs this command: a routed command, or the `set` of another flow's saved block
 * (handled before routing, for any recipient). The Builder uses it to flag what the engine would refuse.
 */
export function isPipeCommand(command: { to?: string | null; method?: string | null; uri: string }): boolean {
  const method = (command.method ?? '').trim().toLowerCase();
  const path = command.uri.trim().split('?')[0] ?? '';
  if (method === 'set' && CONTEXT_STATE_URI.test(path)) return true;
  return matchCommand(command) !== null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
