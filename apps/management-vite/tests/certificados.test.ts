import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expirationData,
  etiquetaDoStatus,
  hostValido,
  informationCompletas,
  problemaInFile,
} from '../src/lib/certificados.ts';

/**
 * As regras da tela de Certificados de autenticação, copiadas do `Pt` e do
 * `yt` do fragmento deles. Errar qualquer uma não quebra a tela: ela deixa
 * passar para o passo seguinte quem não devia, ou mostra a data errada.
 *
 * O `status` é calculado pela `api` a partir do `.pfx` (`valido`/`expirado`,
 * e `sem_arquivo` para o cadastro antigo); aqui só se escolhe o chip.
 */

test('expiration is shown as day/month/year, counted in UTC', () => {
  assert.equal(expirationData('2026-09-13T01:00:00Z'), '13/09/2026');
});

test('the status chip: valid -> success, expired -> disabled, no file -> default', () => {
  assert.deepEqual(etiquetaDoStatus('valido'), { texto: 'Válido', classe: 'sucesso' });
  assert.deepEqual(etiquetaDoStatus('expirado'), { texto: 'Expirado', classe: 'desabilitado' });
  assert.deepEqual(etiquetaDoStatus('without_file'), { texto: 'Sem arquivo', classe: 'padrao' });
});

test('the URL must be HTTPS with a domain and cannot repeat', () => {
  const current = [{ host: 'https://a.exemplo.com', valido: true }];
  assert.equal(hostValido('https://b.exemplo.com:8443/x', current), true);
  assert.equal(hostValido('http://b.exemplo.com', current), false);
  assert.equal(hostValido('https://localhost', current), false);
  assert.equal(hostValido('https://a.exemplo.com', current), false);
});

test('only advances with a description and the whole URL filled in and valid', () => {
  const boa = { host: 'https://a.exemplo.com', valido: true };
  assert.equal(informationCompletas('Banco', [boa]), true);
  assert.equal(informationCompletas('', [boa]), false);
  assert.equal(informationCompletas('Banco', [boa, { host: '', valido: true }]), false);
  assert.equal(informationCompletas('Banco', [{ host: 'x', valido: false }]), false);
});

test('the file must be a .pfx up to 10MB', () => {
  assert.match(problemaInFile(null) ?? '', /erro ao fazer o upload/);
  assert.equal(
    problemaInFile({ type: 'text/plain', size: 1 }),
    'O arquivo deve ser do tipo .pfx',
  );
  assert.equal(
    problemaInFile({ type: 'application/x-pkcs12', size: 11 * 1048576 }),
    'O arquivo deve ter no máximo 10MB',
  );
  assert.equal(problemaInFile({ type: 'application/x-pkcs12', size: 1024 }), null);
  // Navegador que não declara o tipo do .pfx: vale a extensão.
  assert.equal(problemaInFile({ name: 'cliente.pfx', type: '', size: 1024 }), null);
  assert.equal(
    problemaInFile({ name: 'cliente.txt', type: '', size: 1024 }),
    'O arquivo deve ser do tipo .pfx',
  );
});
