import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMAGE, conferir, nomeCurto, imageTypeReal } from '../src/pages/create/regras-de-nome';
import { RECADOS as RECADOS_ROTEADOR } from '../src/pages/create/router/regras';
import { RECADOS as RECADOS_FLUXO } from '../src/pages/create/flow/regras';

/**
 * The image picker for the name step.
 *
 * What this file locks down is the screen's only security decision: the photo's type comes from its BYTES, never from the extension or the browser-reported `type`. Getting this wrong doesn't break the screen — the file still gets saved, the page still loads, and the `data:` URI the portal grid renders starts loading whatever anyone has renamed to `.png`.
 */

/** The first bytes of each of the three types the source accepts. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

test('reconhece os três tipos que a origem aceita', () => {
  assert.equal(imageTypeReal(PNG), 'image/png');
  assert.equal(imageTypeReal(JPEG), 'image/jpeg');
  assert.equal(imageTypeReal(GIF), 'image/gif');
});

test('HTML renomeado para .png não passa', () => {
  // `<!DOCTYPE h` — the start of a file that turns into script execution if
  // served with the type the upload claimed.
  const html = new Uint8Array([...'<!DOCTYPE h'].map((c) => c.charCodeAt(0)));
  assert.equal(imageTypeReal(html), null);
});

test('SVG não entra: a origem não o aceita, e ele carrega script', () => {
  const svg = new Uint8Array([...'<svg xmlns='].map((c) => c.charCodeAt(0)));
  assert.equal(imageTypeReal(svg), null);
});

test('a file too short to have a signature does not throw', () => {
  assert.equal(imageTypeReal(new Uint8Array([0x89, 0x50])), null);
  assert.equal(imageTypeReal(new Uint8Array()), null);
});

test('o teto cobre um avatar e não cobre uma foto de câmera', () => {
  assert.equal(IMAGE.maxBytes, 262_144);
  assert.deepEqual([...IMAGE.aceitos], ['.gif', '.png', '.jpeg', '.jpg']);
});

/**
 * The short identifier, which migration 0020 started persisting.
 *
 * `shortName = name.toLowerCase()` in the source, and it explains the rule requiring a starting letter: an identifier starting with a digit doesn't become a valid address.
 */
test('o identificador curto sai do nome, sem espaço', () => {
  assert.equal(nomeCurto('Meu Roteador'), 'meu-roteador');
  assert.equal(nomeCurto('  Atendimento  Geral '), 'atendimento-geral');
  // Sanitization strips what the source strips, and accents remain (documented divergence).
  assert.equal(nomeCurto('Roteador #1!'), 'roteador-1');
});

test('a name that does not start with a letter is rejected, matching their service', () => {
  assert.equal(conferir('Roteador', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('1Roteador', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('a', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('a'.repeat(31), RECADOS_ROTEADOR), null);
});

/**
 * The same rule, each screen's wording.
 *
 * In the source the name step is a SINGLE template (module 96904), and what changes between router and flow are three `ng-if="$ctrl.template != 'master'"` swapping the label. This test locks exactly that: the rejection must be the same in both, and the wording must match the screen — whoever creates a flow must not read "router", which is the source's own defect that we don't copy.
 */
test('a recusa é a mesma nas duas telas, com a palavra de cada uma', () => {
  const nome = '1Fluxo';
  assert.equal(conferir(nome, RECADOS_FLUXO)?.motivo, RECADOS_FLUXO.comecoInvalido);
  assert.equal(conferir(nome, RECADOS_ROTEADOR)?.motivo, RECADOS_ROTEADOR.comecoInvalido);
  assert.match(RECADOS_FLUXO.comecoInvalido, /fluxo/);
  assert.match(RECADOS_ROTEADOR.comecoInvalido, /roteador/);
  assert.equal(conferir('a', RECADOS_FLUXO)?.motivo, RECADOS_FLUXO.tamanho);
});
