/**
 * The single path builder for Management (D-52): every screen lives under `/application`,
 * matching Blip's own address shape (`<tenant>.blip.ai/application/detail/<shortName>/<module>`,
 * `route-inventory.md` §1). `flowPath` builds the contact tree, `createPath`/`createNamePath`
 * build the creation wizard, `tenantPath` builds the tenant-level screens, and `legacyTarget`
 * maps every pre-D-52 address to its replacement for `LegacyRedirect`.
 *
 * Confirmed evidence for the three "confirmar" rows of the plan's table:
 *
 * 1. `auth.application.create.test` has no `url:` of its own in the Blip bundles: the 172-route
 *    extraction (`.planning/phases/01.1-subdominio-por-tenant/blip-routes-raw.txt`) lists
 *    `/application/create/marketplace`, `/application/create/pipeline` and
 *    `/application/create/router`, but no `/application/create/test` — only a
 *    `$stateChangeStart` guard referencing the state by name
 *    (`referencias-blip/atendimento/analytics-dashboard/supernova.blip.ai/portal.js:25285`).
 *    Kept as our own segment name `test` (plan fallback: "se ausente, manter test").
 * 2. `/welcome` and `/welcome?tenant-invitation` appear in the same extraction WITHOUT an
 *    `/application` prefix (`blip-routes-raw.txt:168-169`), unlike sibling tenant-nested routes
 *    in the same list (e.g. `/application/product-updates:28`,
 *    `/application/tenant/permission-groups:35`) — evidence the state is root-level. Kept at
 *    the root `/welcome`.
 * 3. `/account?activeTab` appears the same way, with no `/application` prefix
 *    (`blip-routes-raw.txt:5`). Kept at the root `/my-account`.
 *
 * Segment names for the 26 differing pairs come from `route-inventory.md` §2, itself derived
 * from the `url:` declarations of the captured Blip bundles. One exception: `growth/tracked-links`
 * keeps our name instead of the table's `clicktracker` — Blip's `clicktracker` already names our
 * own matching `growth/clicktracker` screen (Click-to-WhatsApp ad performance), and
 * `growth/navigation.tsx`'s own comment documents that tracked links have no Blip counterpart;
 * adopting the table's literal value would collide two different screens onto the same address.
 */

export const APPLICATION = '/application';

const SHORT_NAME_SAFE = /^[a-z0-9-]+$/;

function encodeShortNameSegment(shortName: string): string {
  return SHORT_NAME_SAFE.test(shortName) ? shortName : encodeURIComponent(shortName);
}

/** `/application/detail/<shortName>[/<rest>]` — the contact's whole tree, one path. */
export function flowPath(shortName: string, ...rest: string[]): string {
  const suffix = rest.filter(Boolean).join('/');
  const base = `${APPLICATION}/detail/${encodeShortNameSegment(shortName)}`;
  return suffix ? `${base}/${suffix}` : base;
}

export type CreateStep = 'marketplace' | 'test' | 'router';

/** `/application/create/marketplace|test|router`. */
export function createPath(step: CreateStep): string {
  return `${APPLICATION}/create/${step}`;
}

/** `/application/create/name/<template>` — `template` is `'builder'`, `'master'`, or a marketplace template id. */
export function createNamePath(template: string): string {
  return `${APPLICATION}/create/name/${template}`;
}

/** `/application/<segment>` — tenant-level screens (contract, updates, deployment, switch-account). */
export function tenantPath(segment: string): string {
  return segment ? `${APPLICATION}/${segment}` : APPLICATION;
}

/**
 * Segment renames applied to a contact sub-path (the part after `/detail/:shortName/`), longest
 * prefix first so a child (`attendance/agents/queues/:id/edit`) matches before its parent
 * (`attendance/agents/queues`). Pairs with no Blip name keep ours and are absent here.
 */
const CONTACT_SEGMENT_RENAMES: readonly [string, string][] = [
  ['attendance/agents/queues/', 'attendance/queue-management/'],
  ['attendance/agents/queues', 'attendance/queue-management'],
  ['attendance/agents/management/add', 'attendance/team/create'],
  ['attendance/agents/management/edit', 'attendance/team/edit'],
  ['attendance/agents/management/permissions', 'attendance/team/permission'],
  ['attendance/agents/management', 'attendance/team'],
  ['attendance/agents/breaks', 'attendance/personalizedbreaks'],
  ['attendance/rules/sla', 'attendance/sla-policy'],
  ['attendance/rules/attendance', 'attendance/rules'],
  ['attendance/rules/hours', 'attendance/attendance-hours'],
  ['attendance/communication/canned-responses', 'attendance/replies'],
  ['attendance/communication/templates', 'attendance/message-template'],
  ['attendance/reports/attendance', 'attendance/report'],
  ['attendance/reports/effort', 'attendance/effort'],
  ['attendance/reports/satisfaction', 'attendance/survey-dashboard'],
  ['attendance/quality-review', 'attendance/quality-assurance'],
  ['settings/', 'configurations/'],
  ['settings', 'configurations'],
  ['analytics/report-manager', 'analytics/data-extractor'],
  ['growth/ads', 'growth/adsbuying'],
  ['growth/payments', 'growth/paymentsReport'],
  ['contacts/', 'users/'],
  ['contacts', 'users'],
  ['services', 'templates/pipeline'],
  ['builder', 'templates/builder'],
];

/** Applies the D-54 segment renames to a contact sub-path (no leading slash). */
export function renameContactSubpath(rest: string): string {
  for (const [from, to] of CONTACT_SEGMENT_RENAMES) {
    if (rest === from || rest.startsWith(from)) {
      return to + rest.slice(from.length);
    }
  }
  return rest;
}

/** `/contract/<segment>` → `/application/tenant/<Blip segment>` (route-inventory.md §2, INDICE.md:18,20-21,35). */
const TENANT_CONTRACT_SEGMENTS: Readonly<Record<string, string>> = {
  '': 'tenant',
  certificates: 'tenant/mtls',
  members: 'tenant/members',
  'access-groups': 'tenant/permission-groups',
  calls: 'tenant/calls',
};

function withQueryAndHash(path: string, search: string, hash: string): string {
  return `${path}${search}${hash}`;
}

/**
 * Maps a pre-D-52 pathname (plus its query and hash) to its replacement, or `null` when the
 * path isn't a known legacy address or needs the API to resolve (`/flow/:id`, `/router/:id` —
 * see `LegacyContactRedirect`). `search` includes its leading `?` when present; `hash` includes
 * its leading `#` when present.
 */
export function legacyTarget(pathname: string, search = '', hash = ''): string | null {
  if (pathname === '/portal') return withQueryAndHash(APPLICATION, search, hash);
  if (pathname === '/updates') return withQueryAndHash(tenantPath('product-updates'), search, hash);
  if (pathname === '/deployment') return withQueryAndHash(tenantPath('deployment'), search, hash);
  if (pathname === '/switch-account/no-access') {
    return withQueryAndHash(tenantPath('switch-account/no-access'), search, hash);
  }
  if (pathname === '/contract' || pathname.startsWith('/contract/')) {
    const segment = pathname.slice('/contract'.length).replace(/^\//, '');
    const mapped = TENANT_CONTRACT_SEGMENTS[segment];
    if (mapped) return withQueryAndHash(tenantPath(mapped), search, hash);
    return null;
  }
  if (pathname === '/create/flow') return withQueryAndHash(createPath('marketplace'), search, hash);
  if (pathname === '/create/flow/template') return withQueryAndHash(createPath('test'), search, hash);
  if (pathname === '/create/flow/name') {
    const params = new URLSearchParams(search);
    const template = params.get('template');
    params.delete('template');
    const rest = params.toString();
    return withQueryAndHash(createNamePath(template || 'builder'), rest ? `?${rest}` : '', hash);
  }
  if (pathname === '/create/router') return withQueryAndHash(createPath('router'), search, hash);
  if (pathname === '/create/router/name') return withQueryAndHash(createNamePath('master'), search, hash);
  return null;
}
