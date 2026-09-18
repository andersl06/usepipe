import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLAGS_DO_PIPE,
  blocosDoMenu,
  erroDoNome,
  estadoDaLista,
  idiomasRepetidos,
  modeloValido,
  mostrarEscolhaDeBloco,
  mostrarVoltar,
  tiposDisponiveis,
} from '../src/app/fluxo/[id]/conteudos/regras.ts';

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
    blocosDoMenu('utilidade', { midia: false, video: true, pagamento: true, carrossel: true }),
    [['texto'], ['pagamento', 'carrossel']],
  );
  assert.deepEqual(
    blocosDoMenu('marketing', { midia: true, video: true, pagamento: true, carrossel: true }),
    [
      ['texto', 'imagem', 'documento'],
      ['video', 'carrossel'],
    ],
  );
});

test('a escolha de bloco só aparece antes de escolher, com categoria e fora de Autenticação', () => {
  assert.equal(mostrarEscolhaDeBloco('default', ''), false);
  assert.equal(mostrarEscolhaDeBloco('default', 'marketing'), true);
  assert.equal(mostrarEscolhaDeBloco('default', 'autenticacao'), false);
  assert.equal(mostrarEscolhaDeBloco('texto', 'marketing'), false);
});

test('o "voltar" só existe na primeira tradução, com bloco escolhido e sem outras traduções', () => {
  assert.equal(mostrarVoltar('texto', 'marketing', 1), true);
  assert.equal(mostrarVoltar('default', 'marketing', 1), false);
  assert.equal(mostrarVoltar('texto', 'marketing', 2), false);
  assert.equal(mostrarVoltar('texto', 'autenticacao', 1), false);
});

test('o nome do modelo segue /^[a-z]([a-z0-9_])*$/, até 512, e não repete', () => {
  assert.equal(erroDoNome('promo_2026'), null);
  assert.equal(erroDoNome('Promo'), 'invalido');
  assert.equal(erroDoNome('1promo'), 'invalido');
  assert.equal(erroDoNome('a'.repeat(513)), 'comprido');
  assert.equal(erroDoNome('promo', ['promo']), 'usado');
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
  assert.equal(modeloValido(base), true);
  assert.equal(modeloValido({ ...base, tipo: 'default' }), false);
  assert.equal(modeloValido({ ...base, categoria: '' }), false);
  assert.equal(modeloValido({ ...base, traducoes: [{ idioma: 'pt_BR', texto: '' }] }), false);
  assert.equal(modeloValido({ ...base, nome: 'Promo' }), false);
});

test('autenticação dispensa o texto (a mensagem é fixa) mas exige idioma', () => {
  const base = { nome: 'otp', categoria: 'autenticacao' as const, tipo: 'default' as const };
  assert.equal(modeloValido({ ...base, traducoes: [{ idioma: 'pt_BR', texto: '' }] }), true);
  assert.equal(modeloValido({ ...base, traducoes: [{ idioma: '', texto: '' }] }), false);
});

test('a lista mostra indisponível sem WhatsApp, vazio sem modelos e a lista com modelos', () => {
  assert.equal(estadoDaLista(false, 3), 'indisponivel');
  assert.equal(estadoDaLista(true, 0), 'vazio');
  assert.equal(estadoDaLista(true, 2), 'lista');
});
