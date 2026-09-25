import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldOfErrorOfLink } from '../src/paginas/fluxo/growth/links-rastreados/dados.ts';

/**
 * `campoDoErroDeLink` decide sob qual campo do formulário (nome/destino) a
 * tela mostra a recusa do `POST /v1/gestao/fluxos/:fluxoId/links-rastreados`
 * — o corpo do erro não manda `detalhe.campo` para este endpoint, só o
 * `codigo` (ver `dominio/rastreador-de-cliques.ts` e
 * `dominio/gestao/integracoes.ts::confirmarUrlSegura`).
 */

test('campoDoErroDeLink: nome_obrigatorio vai para o campo nome', () => {
  assert.equal(fieldOfErrorOfLink('nome_obrigatorio'), 'nome');
});

test('campoDoErroDeLink: os quatro códigos de URL vão para o campo destino', () => {
  for (const codigo of ['destino_obrigatorio', 'url_invalida', 'url_precisa_https', 'url_proibida']) {
    assert.equal(fieldOfErrorOfLink(codigo), 'destino');
  }
});

test('campoDoErroDeLink: código desconhecido não aponta campo nenhum', () => {
  assert.equal(fieldOfErrorOfLink('fluxo_nao_encontrado'), undefined);
  assert.equal(fieldOfErrorOfLink('algo_novo'), undefined);
});
