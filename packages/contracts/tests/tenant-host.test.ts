import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginUrl, buildTenantOrigin, deriveBaseDomain, isLoginHost,
  isValidTenantSlug, parseReturnTo, parseTenantHost,
} from '../src/tenant-host.ts';

const config = { baseDomain: 'usepipe.app', publicPort: '', secure: true };

test('tenant hosts match only exact tenant labels and allowed ports', () => {
  for (const [host, expected] of [
    ['acme.usepipe.app', { slug: 'acme', app: 'application' }],
    ['acme.desk.usepipe.app', { slug: 'acme', app: 'desk' }],
    ['ACME.UsePipe.App.', { slug: 'acme', app: 'application' }],
    ['acme.usepipe.app:443', { slug: 'acme', app: 'application' }],
    ['acme.usepipe.app:8443', null],
    ['api.usepipe.app', null], ['desk.usepipe.app', null],
    ['www.usepipe.app', null], ['login.usepipe.app', null],
    ['portal.usepipe.app', null], ['usepipe.app', null],
    ['a.b.usepipe.app', null], ['x.desk.desk.usepipe.app', null],
    ['api.desk.usepipe.app', null], ['evilusepipe.app', null],
    ['acme.usepipe.app.evil.com', null], ['-acme.usepipe.app', null],
    ['acme-.usepipe.app', null], ['xn--acme.usepipe.app', null],
    [`${'a'.repeat(64)}.usepipe.app`, null],
  ] as const) {
    assert.deepEqual(parseTenantHost(host, config), expected, host);
  }
  assert.equal(parseTenantHost('acme.usepipe.app', { ...config, baseDomain: '' }), null);
  assert.deepEqual(parseTenantHost('acme.lvh.me:3110', { baseDomain: 'lvh.me', publicPort: '3110', secure: false }), { slug: 'acme', app: 'application' });
  assert.equal(parseTenantHost('acme.lvh.me', { baseDomain: 'lvh.me', publicPort: '3110', secure: false }), null);
});

test('origins, reserved labels, and central login', () => {
  assert.equal(buildTenantOrigin('acme', 'desk', config), 'https://acme.desk.usepipe.app');
  assert.throws(() => buildTenantOrigin('api', 'application', config));
  assert.equal(isValidTenantSlug('acme-1'), true);
  assert.equal(isValidTenantSlug('API'), false);
  assert.equal(isLoginHost('login.usepipe.app', config), true);
  for (const [host, expected] of [
    ['acme.usepipe.app', 'usepipe.app'],
    ['acme.desk.usepipe.app', 'usepipe.app'],
    ['login.usepipe.app', 'usepipe.app'],
    ['acme.lvh.me', 'lvh.me'],
    ['localhost', null], ['127.0.0.1', null],
  ] as const) assert.equal(deriveBaseDomain(host), expected);
  assert.equal(buildLoginUrl(config, 'https://acme.usepipe.app/application'), 'https://login.usepipe.app/?returnTo=https%3A%2F%2Facme.usepipe.app%2Fapplication');
});

test('returnTo accepts only tenant URLs in the configured domain', () => {
  assert.deepEqual(parseReturnTo('https://acme.usepipe.app/application/x?y=1#z', config), {
    slug: 'acme', app: 'application', url: 'https://acme.usepipe.app/application/x?y=1#z',
  });
  assert.deepEqual(parseReturnTo('https://acme.desk.usepipe.app/', config), {
    slug: 'acme', app: 'desk', url: 'https://acme.desk.usepipe.app/',
  });
  for (const value of [
    'https://login.usepipe.app/', 'https://api.usepipe.app/v1',
    'https://portal.usepipe.app/', 'https://acme.usepipe.app.evil.example/',
    'https://user@acme.usepipe.app/', 'http://acme.usepipe.app/',
    '//acme.usepipe.app/', '/application', 'javascript:alert(1)', '',
  ]) assert.equal(parseReturnTo(value, config), null, value);
});
