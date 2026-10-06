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
