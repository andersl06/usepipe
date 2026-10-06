import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrigins, pipeChatSnippet } from '../src/pages/flow/channels/pipe-chat/regras.ts';

test('parseOrigins separates valid http(s) origins from invalid lines', () => {
  assert.deepEqual(parseOrigins('https://a.com/\n http://localhost:3199 \nftp://x\n'), {
    valid: ['https://a.com', 'http://localhost:3199'],
    invalid: ['ftp://x'],
  });
});

test('parseOrigins drops duplicates and blank lines and flags non-URLs', () => {
  assert.deepEqual(parseOrigins('https://a.com\n\nhttps://a.com/path\nnot a url'), {
    valid: ['https://a.com'],
    invalid: ['not a url'],
  });
  assert.deepEqual(parseOrigins(''), { valid: [], invalid: [] });
});

test('pipeChatSnippet builds the script tag', () => {
  assert.equal(
    pipeChatSnippet({ scriptOrigin: 'https://gestao.pipe.app', key: 'abc' }),
    '<script src="https://gestao.pipe.app/pipe-chat.js" data-key="abc" async></script>',
  );
});

test('pipeChatSnippet escapes quotes and angle brackets in the key', () => {
  const out = pipeChatSnippet({ scriptOrigin: 'https://x.app', key: '"><script>' });
  assert.ok(!out.includes('"><script>'));
  assert.ok(out.includes('data-key="&quot;&gt;&lt;script&gt;"'));
});

test('the embed bundle reads the `{ data: [...] }` envelope the widget API returns', async () => {
  // Regression: the bundle once accepted only a bare array, so no message (visitor or bot) was ever shown.
  const { readFileSync } = await import('node:fs');
  const bundle = readFileSync(new URL('../public/pipe-chat.js', import.meta.url), 'utf8');
  assert.match(bundle, /rows\.data/);
});

test('the specialist button is opt-in through data-specialist and keeps the safe rendering', async () => {
  const { readFileSync } = await import('node:fs');
  const bundle = readFileSync(new URL('../public/pipe-chat.js', import.meta.url), 'utf8');
  assert.match(bundle, /getAttribute\('data-specialist'\)/);
  // Only mounted when the label exists, and rate limited for 30 seconds.
  assert.match(bundle, /if \(specialistLabel\) \{/);
  assert.match(bundle, /SPECIALIST_COOLDOWN_MS = 30000/);
  // Still textContent-only and without credentials.
  assert.doesNotMatch(bundle, /innerHTML/);
  assert.match(bundle, /credentials: 'omit'/);
});
