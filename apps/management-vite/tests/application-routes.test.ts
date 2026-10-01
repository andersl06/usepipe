import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPLICATION,
  createNamePath,
  createPath,
  flowPath,
  legacyTarget,
  renameContactSubpath,
  tenantPath,
} from '../src/lib/application-paths';

/**
 * The path builder and the old→new table (D-52). Cases come from the plan's `<behavior>` block;
 * `legacyTarget` takes pathname/search/hash separately (the interface's signature), where the
 * plan's prose examples write them as one string.
 */

test('flowPath builds the contact tree with no rest', () => {
  assert.equal(flowPath('meu-bot'), '/application/detail/meu-bot');
});

test('flowPath appends the rest of the path', () => {
  assert.equal(
    flowPath('meu-bot', 'attendance/monitoring'),
    '/application/detail/meu-bot/attendance/monitoring',
  );
});

test('flowPath encodes a shortName outside [a-z0-9-]', () => {
  assert.equal(flowPath('bot ção'), `/application/detail/${encodeURIComponent('bot ção')}`);
  /* Already-safe short names (nomeCurto's own charset) pass through unencoded. */
  assert.equal(flowPath('meu-bot-2'), '/application/detail/meu-bot-2');
});

test('createPath and createNamePath', () => {
  assert.equal(createPath('marketplace'), '/application/create/marketplace');
  assert.equal(createPath('test'), '/application/create/test');
  assert.equal(createPath('router'), '/application/create/router');
  assert.equal(createNamePath('builder'), '/application/create/name/builder');
  assert.equal(createNamePath('master'), '/application/create/name/master');
});

test('tenantPath', () => {
  assert.equal(tenantPath('tenant'), '/application/tenant');
  assert.equal(tenantPath('product-updates'), '/application/product-updates');
  assert.equal(tenantPath(''), APPLICATION);
});

test('legacyTarget preserves query and hash', () => {
  assert.equal(legacyTarget('/portal', '?x=1', '#h'), '/application?x=1#h');
});

test('legacyTarget: /updates -> product-updates', () => {
  assert.equal(legacyTarget('/updates'), '/application/product-updates');
});

test('legacyTarget: /contract/* -> /application/tenant/*', () => {
  assert.equal(legacyTarget('/contract'), '/application/tenant');
  assert.equal(legacyTarget('/contract/members'), '/application/tenant/members');
  assert.equal(legacyTarget('/contract/certificates'), '/application/tenant/mtls');
  assert.equal(legacyTarget('/contract/access-groups'), '/application/tenant/permission-groups');
});

test('legacyTarget: /deployment and /switch-account/no-access', () => {
  assert.equal(legacyTarget('/deployment'), '/application/deployment');
  assert.equal(legacyTarget('/switch-account/no-access'), '/application/switch-account/no-access');
});

test('legacyTarget: /create/flow -> marketplace, /create/flow/template -> test', () => {
  assert.equal(legacyTarget('/create/flow'), '/application/create/marketplace');
  assert.equal(legacyTarget('/create/flow/template'), '/application/create/test');
});

test('legacyTarget: /create/flow/name?template=X -> name/X, template leaves the query', () => {
  assert.equal(
    legacyTarget('/create/flow/name', '?template=abc'),
    '/application/create/name/abc',
  );
  assert.equal(legacyTarget('/create/flow/name'), '/application/create/name/builder');
});

test('legacyTarget: /create/flow/name keeps the rest of the query alongside removing template', () => {
  assert.equal(
    legacyTarget('/create/flow/name', '?erro=x&template=abc'),
    '/application/create/name/abc?erro=x',
  );
});

test('legacyTarget: /create/router -> router, /create/router/name -> name/master', () => {
  assert.equal(legacyTarget('/create/router'), '/application/create/router');
  assert.equal(legacyTarget('/create/router/name'), '/application/create/name/master');
});

test('legacyTarget: /flow/:id and /router/:id resolve through the API, not this table', () => {
  assert.equal(legacyTarget('/flow/5b6843ae-b4f8-4bc0-bce2-e32318043297'), null);
  assert.equal(legacyTarget('/router/5b6843ae-b4f8-4bc0-bce2-e32318043297'), null);
});

test('legacyTarget: an unrecognized path is not a legacy address', () => {
  assert.equal(legacyTarget('/something-else'), null);
});

test('renameContactSubpath applies the D-54 segment renames', () => {
  assert.equal(renameContactSubpath('contacts'), 'users');
  assert.equal(renameContactSubpath('contacts/abc123'), 'users/abc123');
  assert.equal(renameContactSubpath('services'), 'templates/pipeline');
  assert.equal(renameContactSubpath('builder'), 'templates/builder');
  assert.equal(renameContactSubpath('settings/basic'), 'configurations/basic');
  assert.equal(renameContactSubpath('analytics/report-manager'), 'analytics/data-extractor');
  assert.equal(renameContactSubpath('growth/ads'), 'growth/adsbuying');
  assert.equal(renameContactSubpath('growth/payments'), 'growth/paymentsReport');
  assert.equal(renameContactSubpath('attendance/agents/queues'), 'attendance/queue-management');
  assert.equal(
    renameContactSubpath('attendance/agents/queues/f1/edit'),
    'attendance/queue-management/f1/edit',
  );
  assert.equal(renameContactSubpath('attendance/agents/management'), 'attendance/team');
  assert.equal(renameContactSubpath('attendance/agents/management/add'), 'attendance/team/create');
  assert.equal(renameContactSubpath('attendance/agents/breaks'), 'attendance/personalizedbreaks');
  assert.equal(renameContactSubpath('attendance/quality-review'), 'attendance/quality-assurance');
  assert.equal(
    renameContactSubpath('attendance/quality-review/eval1'),
    'attendance/quality-assurance/eval1',
  );
  assert.equal(renameContactSubpath('attendance/rules/sla'), 'attendance/sla-policy');
});

test('renameContactSubpath aplica as rotas da Blip decididas na 03.2 (D-04)', () => {
  // R-01: configurações gerais do atendimento
  assert.equal(
    renameContactSubpath('attendance/preferences/general'),
    'attendance/general-settings',
  );
});

test('renameContactSubpath keeps a screen with no Blip name unchanged', () => {
  /* growth/tracked-links stays ours: Blip's `clicktracker` already names growth/clicktracker. */
  assert.equal(renameContactSubpath('growth/tracked-links'), 'growth/tracked-links');
  assert.equal(renameContactSubpath('channels'), 'channels');
  assert.equal(renameContactSubpath('attendance/monitoring'), 'attendance/monitoring');
});
