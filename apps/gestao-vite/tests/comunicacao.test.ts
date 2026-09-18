import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CABECALHOS_TEMPLATE,
  cabecalhoTemMidia,
  deslocamentoDoCabecalho,
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

test('só cabeçalho de mídia consome a posição 1', () => {
  assert.equal(cabecalhoTemMidia('imagem'), true);
  assert.equal(cabecalhoTemMidia('video'), true);
  assert.equal(cabecalhoTemMidia('documento'), true);
  // Texto e ausência de cabeçalho não gastam posição.
  assert.equal(cabecalhoTemMidia('texto'), false);
  assert.equal(cabecalhoTemMidia('nenhum'), false);
});

test('cabeçalho desconhecido é tratado como sem mídia', () => {
  /* O valor vem de coluna de texto do banco. Assumir mídia por engano
     deslocaria variáveis de templates que não têm cabeçalho nenhum. */
  assert.equal(cabecalhoTemMidia(''), false);
  assert.equal(cabecalhoTemMidia('IMAGEM'), false);
  assert.equal(cabecalhoTemMidia('carrossel'), false);
});

test('o deslocamento é 1 com mídia e 0 sem', () => {
  assert.equal(deslocamentoDoCabecalho('imagem'), 1);
  assert.equal(deslocamentoDoCabecalho('texto'), 0);
  assert.equal(deslocamentoDoCabecalho('nenhum'), 0);
});

test('todo cabeçalho do catálogo tem deslocamento decidido', () => {
  /* Se alguém somar um tipo novo à lista sem decidir se ele gasta posição, o
     teste continua passando — mas pelo menos o valor fica escrito aqui. */
  const mapa = Object.fromEntries(CABECALHOS_TEMPLATE.map((c) => [c, deslocamentoDoCabecalho(c)]));
  assert.deepEqual(mapa, { nenhum: 0, texto: 0, imagem: 1, video: 1, documento: 1 });
});
