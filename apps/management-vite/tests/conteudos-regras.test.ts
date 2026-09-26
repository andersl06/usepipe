import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLAGS_DO_PIPE,
  blocosDoMenu,
  nameError,
  listState,
  idiomasRepetidos,
  templateValid,
  blockShowChoice,
  mostrarVoltar,
  tiposDisponiveis,
} from '../src/pages/flow/contents/regras.ts';

test('payment is only available for Utility templates', () => {
  assert.ok(tiposDisponiveis('utilidade').includes('pagamento'));
  assert.ok(!tiposDisponiveis('marketing').includes('pagamento'));
  assert.ok(!tiposDisponiveis('autenticacao').includes('pagamento'));
});

test('the block menu follows the flags: in Pipe they are text/image/document and video', () => {
  assert.deepEqual(blocosDoMenu('marketing'), [['texto', 'imagem', 'documento'], ['video']]);
  assert.deepEqual(blocosDoMenu('utilidade', FLAGS_DO_PIPE), [
    ['texto', 'imagem', 'documento'],
    ['video'],
  ]);
});

test('with no media only text remains; with everything on, payment and carousel enter the second row', () => {
  assert.deepEqual(
    blocosDoMenu('utilidade', { media: false, video: true, payment: true, carrossel: true }),
    [['texto'], ['pagamento', 'carrossel']],
  );
  assert.deepEqual(
    blocosDoMenu('marketing', { media: true, video: true, payment: true, carrossel: true }),
    [
      ['texto', 'imagem', 'documento'],
      ['video', 'carrossel'],
    ],
  );
});

test('block choice only shows before choosing, with a category and outside Authentication', () => {
  assert.equal(blockShowChoice('default', ''), false);
  assert.equal(blockShowChoice('default', 'marketing'), true);
  assert.equal(blockShowChoice('default', 'autenticacao'), false);
  assert.equal(blockShowChoice('texto', 'marketing'), false);
});

test('the "back" step only exists on the first translation, with a block chosen and no other translations', () => {
  assert.equal(mostrarVoltar('texto', 'marketing', 1), true);
  assert.equal(mostrarVoltar('default', 'marketing', 1), false);
  assert.equal(mostrarVoltar('texto', 'marketing', 2), false);
  assert.equal(mostrarVoltar('texto', 'autenticacao', 1), false);
});

test('the template\'s name follows /^[a-z]([a-z0-9_])*$/, up to 512, and never repeats', () => {
  assert.equal(nameError('promo_2026'), null);
  assert.equal(nameError('Promo'), 'invalido');
  assert.equal(nameError('1promo'), 'invalido');
  assert.equal(nameError('a'.repeat(513)), 'comprido');
  assert.equal(nameError('promo', ['promo']), 'usado');
});

test('repeated languages across translations are flagged', () => {
  assert.deepEqual(
    idiomasRepetidos([
      { idioma: 'pt_BR', texto: 'a' },
      { idioma: 'pt_BR', texto: 'b' },
      { idioma: '', texto: '' },
    ]),
    ['pt_BR'],
  );
});

test('sending only unlocks with name, category, block and complete translations', () => {
  const base = {
    nome: 'promo',
    categoria: 'marketing' as const,
    tipo: 'texto' as const,
    translations: [{ idioma: 'pt_BR', texto: 'Olá' }],
  };
  assert.equal(templateValid(base), true);
  assert.equal(templateValid({ ...base, tipo: 'default' }), false);
  assert.equal(templateValid({ ...base, categoria: '' }), false);
  assert.equal(templateValid({ ...base, translations: [{ idioma: 'pt_BR', texto: '' }] }), false);
  assert.equal(templateValid({ ...base, nome: 'Promo' }), false);
});

test('authentication skips the text (the message is fixed) but requires a language', () => {
  const base = { nome: 'otp', categoria: 'autenticacao' as const, tipo: 'default' as const };
  assert.equal(templateValid({ ...base, translations: [{ idioma: 'pt_BR', texto: '' }] }), true);
  assert.equal(templateValid({ ...base, translations: [{ idioma: '', texto: '' }] }), false);
});

test('the list shows unavailable without WhatsApp, empty without templates, and the list with templates', () => {
  assert.equal(listState(false, 3), 'indisponivel');
  assert.equal(listState(true, 0), 'vazio');
  assert.equal(listState(true, 2), 'lista');
});
