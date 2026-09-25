import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLAGS_DO_PIPE,
  blocosDoMenu,
  nameError,
  listaState,
  idiomasRepetidos,
  templateValid,
  blockMostrarEscolha,
  mostrarVoltar,
  tiposDisponiveis,
} from '../src/paginas/fluxo/conteudos/regras.ts';

test('pagamento só fica disponível para templates de Utilidade', () => {
  assert.ok(tiposDisponiveis('utilidade').includes('pagamento'));
  assert.ok(!tiposDisponiveis('marketing').includes('pagamento'));
  assert.ok(!tiposDisponiveis('autenticacao').includes('pagamento'));
});

test('o menu de blocos segue as flags: no Pipe são texto/imagem/documento e vídeo', () => {
  assert.deepEqual(blocosDoMenu('marketing'), [['texto', 'imagem', 'documento'], ['video']]);
  assert.deepEqual(blocosDoMenu('utilidade', FLAGS_DO_PIPE), [
    ['texto', 'imagem', 'documento'],
    ['video'],
  ]);
});

test('sem mídia só sobra texto; com tudo ligado, pagamento e carrossel entram na segunda linha', () => {
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

test('a escolha de bloco só aparece antes de escolher, com categoria e fora de Autenticação', () => {
  assert.equal(blockMostrarEscolha('default', ''), false);
  assert.equal(blockMostrarEscolha('default', 'marketing'), true);
  assert.equal(blockMostrarEscolha('default', 'autenticacao'), false);
  assert.equal(blockMostrarEscolha('texto', 'marketing'), false);
});

test('o "voltar" só existe na primeira tradução, com bloco escolhido e sem outras traduções', () => {
  assert.equal(mostrarVoltar('texto', 'marketing', 1), true);
  assert.equal(mostrarVoltar('default', 'marketing', 1), false);
  assert.equal(mostrarVoltar('texto', 'marketing', 2), false);
  assert.equal(mostrarVoltar('texto', 'autenticacao', 1), false);
});

test('o nome do modelo segue /^[a-z]([a-z0-9_])*$/, até 512, e não repete', () => {
  assert.equal(nameError('promo_2026'), null);
  assert.equal(nameError('Promo'), 'invalido');
  assert.equal(nameError('1promo'), 'invalido');
  assert.equal(nameError('a'.repeat(513)), 'comprido');
  assert.equal(nameError('promo', ['promo']), 'usado');
});

test('idiomas repetidos entre traduções são apontados', () => {
  assert.deepEqual(
    idiomasRepetidos([
      { idioma: 'pt_BR', texto: 'a' },
      { idioma: 'pt_BR', texto: 'b' },
      { idioma: '', texto: '' },
    ]),
    ['pt_BR'],
  );
});

test('o envio só libera com nome, categoria, bloco e traduções completas', () => {
  const base = {
    nome: 'promo',
    categoria: 'marketing' as const,
    tipo: 'texto' as const,
    traducoes: [{ idioma: 'pt_BR', texto: 'Olá' }],
  };
  assert.equal(templateValid(base), true);
  assert.equal(templateValid({ ...base, tipo: 'default' }), false);
  assert.equal(templateValid({ ...base, categoria: '' }), false);
  assert.equal(templateValid({ ...base, translations: [{ idioma: 'pt_BR', texto: '' }] }), false);
  assert.equal(templateValid({ ...base, nome: 'Promo' }), false);
});

test('autenticação dispensa o texto (a mensagem é fixa) mas exige idioma', () => {
  const base = { nome: 'otp', categoria: 'autenticacao' as const, tipo: 'default' as const };
  assert.equal(templateValid({ ...base, translations: [{ idioma: 'pt_BR', texto: '' }] }), true);
  assert.equal(templateValid({ ...base, translations: [{ idioma: '', texto: '' }] }), false);
});

test('a lista mostra indisponível sem WhatsApp, vazio sem modelos e a lista com modelos', () => {
  assert.equal(listaState(false, 3), 'indisponivel');
  assert.equal(listaState(true, 0), 'vazio');
  assert.equal(listaState(true, 2), 'lista');
});
