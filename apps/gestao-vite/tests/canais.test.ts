import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emailsParaTexto,
  rotuloDoMotivo,
  sitesParaTexto,
  textoParaEmails,
  textoParaSites,
} from '../src/lib/canais.ts';

/**
 * O campo "Insira os e-mails separados por vírgula" (Configurações de alerta,
 * ficha §4) — ida e volta entre o texto do campo e a lista que a API espera.
 */

test('textoParaEmails separa por vírgula, tira espaço e minúscula', () => {
  assert.deepEqual(textoParaEmails('Ana@ex.com, bia@ex.com ,  ana@ex.com'), [
    'ana@ex.com',
    'bia@ex.com',
  ]);
});

test('textoParaEmails aceita quebra de linha e ignora vazio', () => {
  assert.deepEqual(textoParaEmails('a@ex.com\n\nb@ex.com\n'), ['a@ex.com', 'b@ex.com']);
});

test('textoParaEmails de texto vazio é lista vazia', () => {
  assert.deepEqual(textoParaEmails(''), []);
  assert.deepEqual(textoParaEmails('   '), []);
});

test('emailsParaTexto junta com vírgula e espaço', () => {
  assert.equal(emailsParaTexto(['a@ex.com', 'b@ex.com']), 'a@ex.com, b@ex.com');
  assert.equal(emailsParaTexto([]), '');
});

test('sites: ida e volta preserva a ordem e tira repetido/vazio', () => {
  const texto = 'https://a.com\n\nhttps://b.com\nhttps://a.com';
  assert.deepEqual(textoParaSites(texto), ['https://a.com', 'https://b.com']);
  assert.equal(sitesParaTexto(['https://a.com', 'https://b.com']), 'https://a.com\nhttps://b.com');
});

test('rotuloDoMotivo traduz os códigos conhecidos e devolve o cru quando não conhece', () => {
  assert.equal(rotuloDoMotivo('sem_token'), 'Canal sem token de acesso: reconecte.');
  assert.equal(rotuloDoMotivo('algo_novo'), 'algo_novo');
  assert.equal(rotuloDoMotivo(null), 'Canal indisponível.');
});
