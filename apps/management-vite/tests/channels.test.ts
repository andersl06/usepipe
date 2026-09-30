import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emailsParaTexto,
  shouldReconnectWhatsapp,
  rotuloDoMotivo,
  sitesParaTexto,
  textoParaEmails,
  textoParaSites,
} from '../src/lib/channels.ts';

/**
 * The "Insira os e-mails separados por vírgula" (Enter emails separated by commas) field (Configurações de alerta, ficha §4) — round-trip between the field's text and the list the API expects.
 */

test('textToEmails splits by comma, trims spaces and lowercases', () => {
  assert.deepEqual(textoParaEmails('Ana@ex.com, bia@ex.com ,  ana@ex.com'), [
    'ana@ex.com',
    'bia@ex.com',
  ]);
});

test('textToEmails accepts line breaks and ignores empty ones', () => {
  assert.deepEqual(textoParaEmails('a@ex.com\n\nb@ex.com\n'), ['a@ex.com', 'b@ex.com']);
});

test('textToEmails of empty text is an empty list', () => {
  assert.deepEqual(textoParaEmails(''), []);
  assert.deepEqual(textoParaEmails('   '), []);
});

test('emailsParaTexto junta com vírgula e espaço', () => {
  assert.equal(emailsParaTexto(['a@ex.com', 'b@ex.com']), 'a@ex.com, b@ex.com');
  assert.equal(emailsParaTexto([]), '');
});

test('sites: a round trip preserves order and removes duplicate/empty entries', () => {
  const texto = 'https://a.com\n\nhttps://b.com\nhttps://a.com';
  assert.deepEqual(textoParaSites(texto), ['https://a.com', 'https://b.com']);
  assert.equal(sitesParaTexto(['https://a.com', 'https://b.com']), 'https://a.com\nhttps://b.com');
});

test('rotuloDoMotivo traduz os códigos conhecidos e devolve o cru quando não conhece', () => {
  assert.equal(rotuloDoMotivo('sem_token'), 'Canal sem token de acesso: reconecte.');
  assert.equal(rotuloDoMotivo('algo_novo'), 'algo_novo');
  assert.equal(rotuloDoMotivo(null), 'Canal indisponível.');
});

test('WhatsApp reconnect only appears for credential failures', () => {
  assert.equal(shouldReconnectWhatsapp(null), false);
  assert.equal(shouldReconnectWhatsapp({ state: 'conectado', motivo: null }), false);
  assert.equal(shouldReconnectWhatsapp({ state: 'desligado', motivo: 'sem_token' }), false);
  assert.equal(shouldReconnectWhatsapp({ state: 'indisponivel', motivo: 'meta_inacessivel' }), false);
  assert.equal(shouldReconnectWhatsapp({ state: 'indisponivel', motivo: 'meta_refused' }), true);
  assert.equal(shouldReconnectWhatsapp({ state: 'indisponivel', motivo: 'sem_token' }), true);
});
