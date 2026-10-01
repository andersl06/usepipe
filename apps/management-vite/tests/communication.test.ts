import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CABECALHOS_TEMPLATE,
  headerHasMedia,
  headerOffset,
} from '../src/lib/communication.ts';
import { templatePayload } from '../src/lib/template-payload.ts';

/**
 * The WhatsApp template variable offset.
 *
 * A media header takes up slot 1 of the send and pushes ALL body variables one slot forward. Getting this wrong doesn't break the screen: the campaign goes out, Meta accepts it, and the customer gets someone else's name where the order number should be — in production, for the whole base, with no error in the log.
 *
 * The same logic lives in `apps/workers/src/whatsapp/template.ts`, which is what actually sends it. This test is what pins the screen side to the same rule.
 */

test('only a media header consumes position 1', () => {
  assert.equal(headerHasMedia('imagem'), true);
  assert.equal(headerHasMedia('video'), true);
  assert.equal(headerHasMedia('documento'), true);
  // Text and absence of a header don't consume a slot.
  assert.equal(headerHasMedia('texto'), false);
  assert.equal(headerHasMedia('nenhum'), false);
});

test('an unknown header is treated as no media', () => {
  /*
   * The value comes from a text column in the database. Mistakenly assuming media would shift variables for templates that have no header at all.
   */
  assert.equal(headerHasMedia(''), false);
  assert.equal(headerHasMedia('IMAGEM'), false);
  assert.equal(headerHasMedia('carrossel'), false);
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

const base = { nome: 'promo', categoria: 'marketing' };
const traducao = { idioma: 'pt_BR', texto: 'Olá', exemplos: [], rodape: '', buttons: [], acoes: [] };

test('templatePayload sends footer, quick replies and action buttons, and drops empty ones', () => {
  assert.equal(templatePayload(base, traducao).rodape, undefined);
  assert.equal(templatePayload(base, { ...traducao, rodape: '  ' }).rodape, undefined);
  assert.equal(templatePayload(base, { ...traducao, rodape: 'Obrigado' }).rodape, 'Obrigado');
  assert.equal(templatePayload(base, traducao).botoes, undefined);
  assert.deepEqual(templatePayload(base, { ...traducao, buttons: ['Sim', '', ' Não '] }).botoes, [
    { tipo: 'resposta', texto: 'Sim' },
    { tipo: 'resposta', texto: 'Não' },
  ]);
  assert.deepEqual(
    templatePayload(base, {
      ...traducao,
      acoes: [
        { tipo: 'url', texto: 'Site', valor: 'https://pipe.exemplo' },
        { tipo: 'telefone', texto: 'Ligar', valor: '+5531999999999' },
        { tipo: 'url', texto: '', valor: '' },
      ],
    }).botoes,
    [
      { tipo: 'url', texto: 'Site', url: 'https://pipe.exemplo' },
      { tipo: 'telefone', texto: 'Ligar', telefone: '+5531999999999' },
    ],
  );
});

test('templatePayload uses the field names the API reads', () => {
  const p = templatePayload(base, { ...traducao, exemplos: ['Ana'] });
  assert.deepEqual(p, {
    name: 'promo',
    idioma: 'pt_BR',
    category: 'marketing',
    body: 'Olá',
    exemplos: ['Ana'],
  });
});
