import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMAGEM, conferir, nomeCurto, tipoRealDaImagem } from '../src/paginas/criar/regras-de-nome';
import { RECADOS as RECADOS_ROTEADOR } from '../src/paginas/criar/roteador/regras';
import { RECADOS as RECADOS_FLUXO } from '../src/paginas/criar/fluxo/regras';

/**
 * O seletor de imagem do passo do nome.
 *
 * O que este arquivo trava é a única decisão de segurança da tela: o tipo da
 * foto sai dos BYTES, e não da extensão nem do `type` que o navegador mandou.
 * Errar isso não quebra a tela — o arquivo é gravado, a página carrega, e o
 * `data:` URI que a grade do portal desenha passa a carregar qualquer coisa que
 * alguém tenha renomeado para `.png`.
 */

/** Os primeiros bytes de cada um dos três tipos que a origem aceita. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

test('reconhece os três tipos que a origem aceita', () => {
  assert.equal(tipoRealDaImagem(PNG), 'image/png');
  assert.equal(tipoRealDaImagem(JPEG), 'image/jpeg');
  assert.equal(tipoRealDaImagem(GIF), 'image/gif');
});

test('HTML renomeado para .png não passa', () => {
  // `<!DOCTYPE h` — o começo do arquivo que vira execução de script se for
  // servido com o tipo que o upload prometeu.
  const html = new Uint8Array([...'<!DOCTYPE h'].map((c) => c.charCodeAt(0)));
  assert.equal(tipoRealDaImagem(html), null);
});

test('SVG não entra: a origem não o aceita, e ele carrega script', () => {
  const svg = new Uint8Array([...'<svg xmlns='].map((c) => c.charCodeAt(0)));
  assert.equal(tipoRealDaImagem(svg), null);
});

test('arquivo curto demais para ter assinatura não estoura', () => {
  assert.equal(tipoRealDaImagem(new Uint8Array([0x89, 0x50])), null);
  assert.equal(tipoRealDaImagem(new Uint8Array()), null);
});

test('o teto cobre um avatar e não cobre uma foto de câmera', () => {
  assert.equal(IMAGEM.maxBytes, 262_144);
  assert.deepEqual([...IMAGEM.aceitos], ['.gif', '.png', '.jpeg', '.jpg']);
});

/**
 * O identificador curto, que a migração 0020 passou a gravar.
 *
 * `shortName = name.toLowerCase()` na origem, e é ele que explica a regra de
 * começar com letra: identificador que começa com dígito não vira endereço.
 */
test('o identificador curto sai do nome, sem espaço', () => {
  assert.equal(nomeCurto('Meu Roteador'), 'meu-roteador');
  assert.equal(nomeCurto('  Atendimento  Geral '), 'atendimento-geral');
  // O saneamento tira o que a origem tira, e o acento fica (divergência anotada).
  assert.equal(nomeCurto('Roteador #1!'), 'roteador-1');
});

test('nome que não começa com letra é recusado, como no serviço deles', () => {
  assert.equal(conferir('Roteador', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('1Roteador', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('a', RECADOS_ROTEADOR), null);
  assert.notEqual(conferir('a'.repeat(31), RECADOS_ROTEADOR), null);
});

/**
 * A mesma regra, a palavra de cada tela.
 *
 * Na origem o passo do nome é UM template (módulo 96904) e o que muda entre
 * roteador e fluxo são três `ng-if="$ctrl.template != 'master'"` trocando
 * rótulo. Este teste trava justamente isso: a recusa tem de ser a mesma nos
 * dois, e a frase tem de ser a da tela — quem criar um fluxo não pode ler
 * "roteador", que é o defeito que a origem tem e não copiamos.
 */
test('a recusa é a mesma nas duas telas, com a palavra de cada uma', () => {
  const nome = '1Fluxo';
  assert.equal(conferir(nome, RECADOS_FLUXO)?.motivo, RECADOS_FLUXO.comecoInvalido);
  assert.equal(conferir(nome, RECADOS_ROTEADOR)?.motivo, RECADOS_ROTEADOR.comecoInvalido);
  assert.match(RECADOS_FLUXO.comecoInvalido, /fluxo/);
  assert.match(RECADOS_ROTEADOR.comecoInvalido, /roteador/);
  assert.equal(conferir('a', RECADOS_FLUXO)?.motivo, RECADOS_FLUXO.tamanho);
});
