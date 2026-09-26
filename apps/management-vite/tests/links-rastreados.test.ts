import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldOfErrorOfLink } from '../src/pages/flow/growth/tracked-links/data.ts';

/**
 * `campoDoErroDeLink` decides under which form field (name/destination) the screen shows the rejection from `POST /v1/gestao/fluxos/:fluxoId/links-rastreados` — this endpoint's error body doesn't send `detalhe.campo`, only `codigo` (see `dominio/rastreador-de-cliques.ts` and `dominio/gestao/integracoes.ts::confirmarUrlSegura`).
 */

test('fieldForLinkError: name_required goes to the name field', () => {
  assert.equal(fieldOfErrorOfLink('name_required'), 'nome');
});

test('fieldForLinkError: the four URL codes go to the destination field', () => {
  for (const codigo of ['destination_required', 'url_invalid', 'url_needs_https', 'url_forbidden']) {
    assert.equal(fieldOfErrorOfLink(codigo), 'destino');
  }
});

test('fieldForLinkError: an unknown code does not point to any field', () => {
  assert.equal(fieldOfErrorOfLink('fluxo_nao_encontrado'), undefined);
  assert.equal(fieldOfErrorOfLink('algo_novo'), undefined);
});
