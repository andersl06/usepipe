import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginUrl, buildTenantOrigin, deriveBaseDomain, isLoginHost,
  isValidTenantSlug, parseReturnTo, parseTenantHost,
} from '../src/tenant-host.ts';

const config = { baseDomain: 'pipe.test', publicPort: '', secure: true };

test('tenant hosts match only exact tenant labels and allowed ports', () => {
  for (const [host, expected] of [
    ['acme.pipe.test', { slug: 'acme', app: 'application' }],
    ['acme.desk.pipe.test', { slug: 'acme', app: 'desk' }],
    ['ACME.Pipe.Test.', { slug: 'acme', app: 'application' }],
    ['acme.pipe.test:443', { slug: 'acme', app: 'application' }],
    ['acme.pipe.test:8443', null],
    ['api.pipe.test', null], ['desk.pipe.test', null],
    ['www.pipe.test', null], ['login.pipe.test', null],
    ['portal.pipe.test', null], ['pipe.test', null],
    ['a.b.pipe.test', null], ['x.desk.desk.pipe.test', null],
    ['api.desk.pipe.test', null], ['evilpipe.test', null],
    ['acme.pipe.test.evil.com', null], ['-acme.pipe.test', null],
    ['acme-.pipe.test', null], ['xn--acme.pipe.test', null],
    [`${'a'.repeat(64)}.pipe.test`, null],
  ] as const) {
    assert.deepEqual(parseTenantHost(host, config), expected, host);
  }
  assert.equal(parseTenantHost('acme.pipe.test', { ...config, baseDomain: '' }), null);
  assert.deepEqual(parseTenantHost('acme.lvh.me:3110', { baseDomain: 'lvh.me', publicPort: '3110', secure: false }), { slug: 'acme', app: 'application' });
  assert.equal(parseTenantHost('acme.lvh.me', { baseDomain: 'lvh.me', publicPort: '3110', secure: false }), null);
});

test('origins, reserved labels, and central login', () => {
  assert.equal(buildTenantOrigin('acme', 'desk', config), 'https://acme.desk.pipe.test');
  assert.throws(() => buildTenantOrigin('api', 'application', config));
  assert.equal(isValidTenantSlug('acme-1'), true);
  assert.equal(isValidTenantSlug('API'), false);
  assert.equal(isLoginHost('login.pipe.test', config), true);
  for (const [host, expected] of [
    ['acme.pipe.test', 'pipe.test'],
    ['acme.desk.pipe.test', 'pipe.test'],
    ['login.pipe.test', 'pipe.test'],
    ['acme.lvh.me', 'lvh.me'],
    ['localhost', null], ['127.0.0.1', null],
  ] as const) assert.equal(deriveBaseDomain(host), expected);
  assert.equal(buildLoginUrl(config, 'https://acme.pipe.test/application'), 'https://login.pipe.test/?returnTo=https%3A%2F%2Facme.pipe.test%2Fapplication');
});

test('returnTo accepts only tenant URLs in the configured domain', () => {
  assert.deepEqual(parseReturnTo('https://acme.pipe.test/application/x?y=1#z', config), {
    slug: 'acme', app: 'application', url: 'https://acme.pipe.test/application/x?y=1#z',
  });
  assert.deepEqual(parseReturnTo('https://acme.desk.pipe.test/', config), {
    slug: 'acme', app: 'desk', url: 'https://acme.desk.pipe.test/',
  });
  for (const value of [
    'https://login.pipe.test/', 'https://api.pipe.test/v1',
    'https://portal.pipe.test/', 'https://acme.pipe.test.evil.example/',
    'https://user@acme.pipe.test/', 'http://acme.pipe.test/',
    '//acme.pipe.test/', '/application', 'javascript:alert(1)', '',
  ]) assert.equal(parseReturnTo(value, config), null, value);
});

test('local Desk uses its own Vite port and localhost uses host-only sessions', () => {
  const local = { baseDomain: 'lvh.me', publicPort: '3110', secure: false };
  assert.deepEqual(parseTenantHost('alfa.desk.lvh.me:3210', local), { slug: 'alfa', app: 'desk' });
  assert.equal(buildTenantOrigin('alfa', 'desk', local), 'http://alfa.desk.lvh.me:3210');
  assert.equal(parseReturnTo('http://alfa.desk.lvh.me:3210/', local)?.slug, 'alfa');
  assert.equal(parseTenantHost('alfa.desk.lvh.me:3310', local), null);
  const localhost = { ...local, baseDomain: 'localhost' };
  assert.equal(deriveBaseDomain('alfa.localhost'), 'localhost');
  assert.deepEqual(parseTenantHost('alfa.localhost:3110', localhost), { slug: 'alfa', app: 'application' });
  assert.deepEqual(parseTenantHost('alfa.desk.localhost:3210', localhost), { slug: 'alfa', app: 'desk' });
});

test('a configured base domain with an extra label keeps the apex out of the tenant space', () => {
  const base = 'pipe.144-217-164-204.sslip.io';
  // without the configured base the apex is misread as the tenant `pipe` of `144-217-164-204.sslip.io`
  assert.equal(deriveBaseDomain(base), '144-217-164-204.sslip.io');
  assert.equal(deriveBaseDomain(base, base), null);
  assert.equal(deriveBaseDomain(`login.${base}`, base), base);
  assert.equal(deriveBaseDomain(`alfa.${base}`, base), base);
  assert.equal(deriveBaseDomain(`alfa.desk.${base}`, base), base);
  assert.equal(deriveBaseDomain(`ALFA.${base}.`, ` .${base.toUpperCase()}. `), base);
  // an unrelated host still falls back to the default guess
  assert.equal(deriveBaseDomain('alfa.exemplo.com.br', base), 'exemplo.com.br');
  const config = { baseDomain: base, publicPort: '', secure: true };
  assert.equal(buildLoginUrl(config, `https://${base}/`), `https://login.${base}/?returnTo=${encodeURIComponent(`https://${base}/`)}`);
});
