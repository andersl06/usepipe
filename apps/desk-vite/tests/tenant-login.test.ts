import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tenantLoginUrl } from '../src/lib/tenant-login.ts';

function location(href: string) {
  const url = new URL(href);
  return { hostname: url.hostname, host: url.host, port: url.port, protocol: url.protocol, href };
}

test('Desk sends tenant sessions to the central login host', () => {
  assert.equal(
    tenantLoginUrl(location('https://acme.desk.pipe.test/chat')),
    'https://login.pipe.test/?returnTo=https%3A%2F%2Facme.desk.pipe.test%2Fchat',
  );
  assert.equal(
    tenantLoginUrl(location('http://acme.desk.lvh.me:3210/'), true),
    'http://login.lvh.me:3110/?returnTo=http%3A%2F%2Facme.desk.lvh.me%3A3210%2F',
  );
  assert.equal(tenantLoginUrl(location('http://localhost:3210/'), true), null);
  assert.equal(tenantLoginUrl(location('https://api.pipe.test/')), null);
});
