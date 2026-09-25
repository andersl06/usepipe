import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CABECALHOS_TEMPLATE,
  headerTemMedia,
  headerOffset,
} from '../src/lib/comunicacao.ts';

/**
 * O deslocamento das variáveis do template do WhatsApp.
 *
 * Cabeçalho de mídia ocupa a posição 1 do envio e empurra TODAS as variáveis do
 * corpo uma casa para frente. Errar isto não quebra a tela: o disparo sai, a
 * Meta aceita, e o cliente recebe o nome dele no lugar do número do pedido — em
 * produção, para a base inteira, sem nenhum erro no log.
 *
 * A mesma conta vive em `apps/workers/src/whatsapp/template.ts`, que é quem
 * dispara de fato. Este teste é o que trava o lado da tela na mesma regra.
 */

test('only a media header consumes position 1', () => {
  assert.equal(headerTemMedia('imagem'), true);
  assert.equal(headerTemMedia('video'), true);
  assert.equal(headerTemMedia('documento'), true);
  // Texto e ausência de cabeçalho não gastam posição.
  assert.equal(headerTemMedia('texto'), false);
  assert.equal(headerTemMedia('nenhum'), false);
});

test('an unknown header is treated as no media', () => {
  /* O valor vem de coluna de texto do banco. Assumir mídia por engano
     deslocaria variáveis de templates que não têm cabeçalho nenhum. */
  assert.equal(headerTemMedia(''), false);
  assert.equal(headerTemMedia('IMAGEM'), false);
  assert.equal(headerTemMedia('carrossel'), false);
});

test('the offset is 1 with media and 0 without', () => {
  assert.equal(headerOffset('imagem'), 1);
  assert.equal(headerOffset('texto'), 0);
  assert.equal(headerOffset('nenhum'), 0);
});

test('every header in the catalog has a decided offset', () => {
  /* Se alguém somar um tipo novo à lista sem decidir se ele gasta posição, o
     teste continua passando — mas pelo menos o valor fica escrito aqui. */
  const mapa = Object.fromEntries(CABECALHOS_TEMPLATE.map((c) => [c, headerOffset(c)]));
  assert.deepEqual(mapa, { nenhum: 0, texto: 0, imagem: 1, video: 1, documento: 1 });
});
