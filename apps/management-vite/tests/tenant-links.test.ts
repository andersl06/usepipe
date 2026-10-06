import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDeskUrl, centralLoginRedirect, hostMode, isReservedHost,
  loggedInDestination, readDeniedTenantNotice,
} from '../src/lib/tenant-links.ts';
import type { BrowserLocation } from '../src/lib/tenant-links.ts';

function location(href: string): BrowserLocation {
  const url = new URL(href);
  return { protocol: url.protocol, hostname: url.hostname, port: url.port, href };
}

test('Desk link follows the authenticated tenant host', () => {
  assert.equal(buildDeskUrl(location('https://acme.pipe.test/'), 'acme'), 'https://acme.desk.pipe.test/');
  assert.equal(buildDeskUrl(location('https://acme.pipe.144-217-164-204.sslip.io/'), 'acme'), 'https://acme.desk.pipe.144-217-164-204.sslip.io/');
  assert.equal(buildDeskUrl(location('http://acme.lvh.me:3110/'), 'acme', true), 'http://acme.desk.lvh.me:3210/');
  assert.equal(buildDeskUrl(location('http://localhost:3110/'), 'acme', true), 'http://localhost:3210/');
  assert.equal(buildDeskUrl(location('https://beta.pipe.test/'), 'acme'), null);
  assert.equal(buildDeskUrl(location('https://localhost/'), 'acme'), null);
});

test('host mode and central login redirect', () => {
  assert.equal(hostMode(location('https://acme.pipe.test/')), 'tenant');
  assert.equal(hostMode(location('https://login.pipe.test/')), 'login');
  assert.equal(hostMode(location('https://portal.pipe.test/')), 'reserved');
  assert.equal(hostMode(location('https://desk.pipe.test/')), 'reserved');
  assert.equal(hostMode(location('http://localhost:3110/')), 'off');
  assert.equal(isReservedHost('admin.pipe.test'), true);
  assert.equal(centralLoginRedirect(location('https://acme.desk.pipe.test/?x=1')), 'https://login.pipe.test/?returnTo=https%3A%2F%2Facme.desk.pipe.test%2F%3Fx%3D1');
  assert.equal(centralLoginRedirect(location('http://acme.desk.lvh.me:3210/'), true), 'http://login.lvh.me:3110/?returnTo=http%3A%2F%2Facme.desk.lvh.me%3A3210%2F');
});

test('denied tenant notice accepts only a slug', () => {
  assert.equal(readDeniedTenantNotice('?deniedTenant=alfa'), 'alfa');
  assert.equal(readDeniedTenantNotice('?deniedTenant=%3Cscript%3E'), null);
  assert.equal(readDeniedTenantNotice(''), null);
});

test('switching org goes to the destination org host, and stays in place on plain localhost', () => {
  assert.equal(loggedInDestination(location('https://acme.pipe.test/application'), 'beta', null), 'https://beta.pipe.test/application');
  assert.equal(loggedInDestination(location('http://localhost:3110/application'), 'beta', null), null);
  assert.equal(loggedInDestination(location('https://acme.pipe.test/application'), 'not a slug!', null), null);
});

test('an existing session returns only to its own tenant', () => {
  const login = location('https://login.pipe.test/');
  assert.equal(loggedInDestination(login, 'acme', 'https://acme.desk.pipe.test/'), 'https://acme.desk.pipe.test/');
  assert.equal(loggedInDestination(login, 'acme', 'https://beta.pipe.test/'), 'https://acme.pipe.test/application?deniedTenant=beta');
  assert.equal(loggedInDestination(login, 'acme', 'https://evil.example/'), 'https://acme.pipe.test/application');
  assert.equal(loggedInDestination(location('http://login.lvh.me:3110/'), 'acme', 'http://acme.desk.lvh.me:3210/', true), 'http://acme.desk.lvh.me:3210/');
});
