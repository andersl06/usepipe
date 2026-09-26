import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CABECALHOS_TEMPLATE,
  headerTemMedia,
  headerOffset,
} from '../src/lib/communication.ts';

/**
 * The WhatsApp template variable offset.
 *
 * A media header takes up slot 1 of the send and pushes ALL body variables one slot forward. Getting this wrong doesn't break the screen: the campaign goes out, Meta accepts it, and the customer gets someone else's name where the order number should be — in production, for the whole base, with no error in the log.
 *
 * The same logic lives in `apps/workers/src/whatsapp/template.ts`, which is what actually sends it. This test is what pins the screen side to the same rule.
 */

test('only a media header consumes position 1', () => {
  assert.equal(headerTemMedia('imagem'), true);
  assert.equal(headerTemMedia('video'), true);
  assert.equal(headerTemMedia('documento'), true);
  // Text and absence of a header don't consume a slot.
  assert.equal(headerTemMedia('texto'), false);
  assert.equal(headerTemMedia('nenhum'), false);
});

test('an unknown header is treated as no media', () => {
  /*
   * The value comes from a text column in the database. Mistakenly assuming media would shift variables for templates that have no header at all.
   */
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
  /*
   * If someone adds a new type to the list without deciding whether it consumes a slot, the test still passes — but at least the value is written down here.
   */
  const mapa = Object.fromEntries(CABECALHOS_TEMPLATE.map((c) => [c, headerOffset(c)]));
  assert.deepEqual(mapa, { nenhum: 0, texto: 0, imagem: 1, video: 1, documento: 1 });
});
