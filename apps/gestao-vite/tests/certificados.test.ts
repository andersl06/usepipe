import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dataDeExpiracao,
  hostValido,
  informacoesCompletas,
  problemaNoArquivo,
} from '../src/lib/certificados.ts';

/**
 * As regras da tela de Certificados de autenticação, copiadas do `Pt` e do
 * `yt` do fragmento deles. Errar qualquer uma não quebra a tela: ela deixa
 * passar para o passo seguinte quem não devia, ou mostra a data errada.
 *
 * O `status` (`valid`/`invalid`/`underValidation`) da origem saiu daqui — o
 * Pipe não lê o `.pfx` para calculá-lo (`EM_BREVE_UPLOAD` em `lib/certificados.ts`).
 */

test('a expiração sai em dia/mês/ano, contada em UTC', () => {
  assert.equal(dataDeExpiracao('2026-09-13T01:00:00Z'), '13/09/2026');
});

test('a URL precisa ser HTTPS com domínio e não pode repetir', () => {
  const atuais = [{ host: 'https://a.exemplo.com', valido: true }];
  assert.equal(hostValido('https://b.exemplo.com:8443/x', atuais), true);
  assert.equal(hostValido('http://b.exemplo.com', atuais), false);
  assert.equal(hostValido('https://localhost', atuais), false);
  assert.equal(hostValido('https://a.exemplo.com', atuais), false);
});

test('só avança com descrição, validade, impressão digital e toda URL preenchida e válida', () => {
  const boa = { host: 'https://a.exemplo.com', valido: true };
  assert.equal(informacoesCompletas('Banco', [boa], '2027-01-01', 'AB:CD'), true);
  assert.equal(informacoesCompletas('', [boa], '2027-01-01', 'AB:CD'), false);
  assert.equal(informacoesCompletas('Banco', [boa], '', 'AB:CD'), false);
  assert.equal(informacoesCompletas('Banco', [boa], '2027-01-01', '  '), false);
  assert.equal(
    informacoesCompletas('Banco', [boa, { host: '', valido: true }], '2027-01-01', 'AB:CD'),
    false,
  );
  assert.equal(
    informacoesCompletas('Banco', [{ host: 'x', valido: false }], '2027-01-01', 'AB:CD'),
    false,
  );
});

test('o arquivo precisa ser .pfx de até 10MB', () => {
  assert.match(problemaNoArquivo(null) ?? '', /erro ao fazer o upload/);
  assert.equal(
    problemaNoArquivo({ type: 'text/plain', size: 1 }),
    'O arquivo deve ser do tipo .pfx',
  );
  assert.equal(
    problemaNoArquivo({ type: 'application/x-pkcs12', size: 11 * 1048576 }),
    'O arquivo deve ter no máximo 10MB',
  );
  assert.equal(problemaNoArquivo({ type: 'application/x-pkcs12', size: 1024 }), null);
});
