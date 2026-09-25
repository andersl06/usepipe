import assert from 'node:assert/strict';
import { test } from 'node:test';
import { urlDaConversaNoDesk } from '../src/lib/desk-url.ts';

test('abre a conversa do monitoramento na rota do Desk', () => {
  assert.equal(
    urlDaConversaNoDesk('https://pipe.exemplo/desk/', 'a9d6625a-8163-4ce5-b316-482089b41426'),
    'https://pipe.exemplo/desk/chat/a9d6625a-8163-4ce5-b316-482089b41426',
  );
});
