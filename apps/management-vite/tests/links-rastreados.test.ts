import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldOfErrorOfLink } from '../src/pages/flow/growth/tracked-links/data.ts';

/**
 * `campoDoErroDeLink` decide sob qual campo do formulário (nome/destino) a
 * tela mostra a recusa do `POST /v1/gestao/fluxos/:fluxoId/links-rastreados`
 * — o corpo do erro não manda `detalhe.campo` para este endpoint, só o
 * `codigo` (ver `dominio/rastreador-de-cliques.ts` e
 * `dominio/gestao/integracoes.ts::confirmarUrlSegura`).
 */

test('fieldForLinkError: nome_obrigatorio goes to the name field', () => {
  assert.equal(fieldOfErrorOfLink('nome_obrigatorio'), 'nome');
});

test('fieldForLinkError: the four URL codes go to the destination field', () => {
  for (const codigo of ['destino_obrigatorio', 'url_invalida', 'url_precisa_https', 'url_proibida']) {
    assert.equal(fieldOfErrorOfLink(codigo), 'destino');
  }
});

test('fieldForLinkError: an unknown code does not point to any field', () => {
  assert.equal(fieldOfErrorOfLink('fluxo_nao_encontrado'), undefined);
  assert.equal(fieldOfErrorOfLink('algo_novo'), undefined);
});
