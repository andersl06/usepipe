import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expirationData,
  etiquetaDoStatus,
  hostValido,
  informationComplete,
  problemInFile,
} from '../src/lib/certificados.ts';

/**
 * The Authentication Certificates screen's rules, copied from their `Pt` and `yt` fragment. Getting any of them wrong doesn't break the screen: it lets someone through to the next step who shouldn't be, or shows the wrong date.
 *
 * The `status` is computed by the `api` from the `.pfx` (`valido`/`expirado`, and `sem_arquivo` for the old record); here we only pick the chip.
 */

test('expiration is shown as day/month/year, counted in UTC', () => {
  assert.equal(expirationData('2026-09-13T01:00:00Z'), '13/09/2026');
});

test('the status chip: valid -> success, expired -> disabled, no file -> default', () => {
  assert.deepEqual(etiquetaDoStatus('valido'), { texto: 'Válido', classe: 'sucesso' });
  assert.deepEqual(etiquetaDoStatus('expirado'), { texto: 'Expirado', classe: 'desabilitado' });
  assert.deepEqual(etiquetaDoStatus('sem_arquivo'), { texto: 'Sem arquivo', classe: 'padrao' });
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
  assert.equal(informationComplete('Banco', [boa]), true);
  assert.equal(informationComplete('', [boa]), false);
  assert.equal(informationComplete('Banco', [boa, { host: '', valido: true }]), false);
  assert.equal(informationComplete('Banco', [{ host: 'x', valido: false }]), false);
});

test('the file must be a .pfx up to 10MB', () => {
  assert.match(problemInFile(null) ?? '', /erro ao fazer o upload/);
  assert.equal(
    problemInFile({ type: 'text/plain', size: 1 }),
    'O arquivo deve ser do tipo .pfx',
  );
  assert.equal(
    problemInFile({ type: 'application/x-pkcs12', size: 11 * 1048576 }),
    'O arquivo deve ter no máximo 10MB',
  );
  assert.equal(problemInFile({ type: 'application/x-pkcs12', size: 1024 }), null);
  // Browser that doesn't declare the .pfx's type: fall back to the extension.
  assert.equal(problemInFile({ name: 'cliente.pfx', type: '', size: 1024 }), null);
  assert.equal(
    problemInFile({ name: 'cliente.txt', type: '', size: 1024 }),
    'O arquivo deve ser do tipo .pfx',
  );
});
