import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moverSaida } from '../src/paginas/builder/condicoes.ts';
import { stateInitial, reduzir } from '../src/paginas/builder/estado.ts';
import {
  addBlock,
  copiedTextBlock,
  colarBlock,
  desligar,
  excluirBlock,
  ligar,
  montarDesenho,
  moverBlock,
  newBlock,
  positionOf,
  copiedBlockText,
} from '../src/paginas/builder/modelo.ts';
import { caixaContemPonto, houveArrasto } from '../src/paginas/builder/setas.ts';
import { blockErrors } from '../src/paginas/builder/validacao.ts';

test('montarDesenho exporta os blocos da tela e as ações globais sem alterar o mapa', () => {
  const first = newBlock({}, { top: 10, left: 20 }, 'primeiro');
  const mapa = { first };

  const desenho = montarDesenho(mapa, { entrada: [{ type: 'SetVariable' }] });

  assert.deepEqual(Object.keys(desenho.flow), ['primeiro']);
  assert.equal((desenho.flow.primeiro as { id: string }).id, 'primeiro');
  assert.deepEqual(desenho.globals, { entrada: [{ type: 'SetVariable' }] });
  assert.notEqual(desenho.flow.primeiro, first);
});

test('cria, move e exclui bloco, removendo destinos que apontavam para ele', () => {
  const origem = newBlock({}, { top: 10, left: 20 }, 'origem');
  const destination = newBlock({ origem }, { top: 50, left: 60 }, 'destino');
  const mapa = addBlock({ origem }, destination);
  const resultado = ligar(mapa, 'origem', 'destino', 'saida');
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  const ligado = resultado.mapa;
  const movido = moverBlock(ligado, 'destino', { top: 99.6, left: -1 });

  assert.deepEqual(positionOf(movido.destino!), { top: 100, left: 0 });
  assert.equal(excluirBlock(movido, 'destino').destino, undefined);
  assert.deepEqual(excluirBlock(movido, 'destino').origem!.$conditionOutputs, []);
});

test('copia um bloco para a área de transferência e cola uma cópia na posição escolhida', () => {
  const origem = newBlock({}, { top: 10, left: 20 }, 'origem');
  const copiado = copiedTextBlock(copiedBlockText(origem));
  assert.ok(copiado);
  const mapa = colarBlock({ origem }, copiado, { top: 120, left: 340 }, 'destino');

  assert.equal(mapa.origem, origem);
  assert.equal(mapa.destino?.$title, 'Novo bloco [Cópia]');
  assert.deepEqual(positionOf(mapa.destino!), { top: 120, left: 340 });
  assert.equal(copiedTextBlock('texto comum'), null);
});

test('liga e desliga uma aresta sem duplicar a condição de saída', () => {
  const origem = newBlock({}, { top: 0, left: 0 }, 'origem');
  const destination = newBlock({ origem }, { top: 0, left: 200 }, 'destino');
  const mapa = { origem, destination };
  const ligado = ligar(mapa, 'origem', 'destino', 'saida');

  assert.equal(ligado.ok, true);
  if (!ligado.ok) return;
  assert.equal(ligado.mapa.origem!.$conditionOutputs?.length, 1);
  const repetido = ligar(ligado.mapa, 'origem', 'destino', 'outra');
  assert.equal(repetido.ok, true);
  if (!repetido.ok) return;
  assert.equal(repetido.mapa.origem!.$conditionOutputs?.length, 1);
  assert.deepEqual(desligar(ligado.mapa, 'origem', 'destino').origem!.$conditionOutputs, []);
});

test('desfazer e refazer tratam o arrasto como uma mudança única', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });
  const duranteArrasto = reduzir(carregado, { tipo: 'mover', mapa: moverBlock(mapa, 'bloco', { top: 30, left: 40 }) });
  const solto = reduzir(duranteArrasto, { tipo: 'soltar' });

  assert.equal(solto.passado.length, 1);
  assert.deepEqual(positionOf(reduzir(solto, { tipo: 'desfazer' }).mapa.bloco!), { top: 0, left: 0 });
  assert.deepEqual(positionOf(reduzir(reduzir(solto, { tipo: 'desfazer' }), { tipo: 'refazer' }).mapa.bloco!), { top: 30, left: 40 });
});

test('mantém a ordem das condições de saída porque a primeira condição compatível vence', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'origem');
  block.$conditionOutputs = [
    { $id: 'primeira', stateId: 'um', conditions: [] },
    { $id: 'segunda', stateId: 'dois', conditions: [] },
  ];

  assert.deepEqual(moverSaida(block, 1, 0).$conditionOutputs?.map((saida) => saida.$id), ['segunda', 'primeira']);
});

test('Ctrl+Z some enquanto um bloco está sendo arrastado, para não perder o desfazer do arrasto', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });

  // Primeiro arrasto, completo — um passo de verdade no histórico.
  const firstMovement = reduzir(carregado, {
    tipo: 'mover',
    mapa: moverBlock(mapa, 'bloco', { top: 10, left: 10 }),
  });
  const firstSolto = reduzir(firstMovement, { tipo: 'soltar' });
  assert.equal(firstSolto.passado.length, 1);

  // Segundo arrasto em curso — Ctrl+Z no meio dele não faz nada.
  const duranteArrasto = reduzir(firstSolto, {
    tipo: 'mover',
    mapa: moverBlock(firstSolto.mapa, 'bloco', { top: 30, left: 40 }),
  });
  const desfeitoNoMeio = reduzir(duranteArrasto, { tipo: 'desfazer' });
  assert.equal(desfeitoNoMeio, duranteArrasto);

  // Soltar depois do Ctrl+Z ignorado empilha certo o passo do segundo arrasto —
  // sem a trava, aqui o mapa voltaria pra (0,0) com um passado corrompido.
  const segundoSolto = reduzir(desfeitoNoMeio, { tipo: 'soltar' });
  assert.equal(segundoSolto.passado.length, 2);
  assert.deepEqual(positionOf(segundoSolto.mapa.bloco!), { top: 30, left: 40 });

  // E os dois desfazeres, na ordem certa, voltam ao (10,10) e depois ao (0,0).
  const firstDesfazer = reduzir(segundoSolto, { tipo: 'desfazer' });
  assert.deepEqual(positionOf(firstDesfazer.mapa.bloco!), { top: 10, left: 10 });
  const segundoDesfazer = reduzir(firstDesfazer, { tipo: 'desfazer' });
  assert.deepEqual(positionOf(segundoDesfazer.mapa.bloco!), { top: 0, left: 0 });
});

test('aplicarGlobais marca sujo sem mexer na pilha de desfazer do desenho', () => {
  const mapa = { bloco: newBlock({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(stateInitial(), { tipo: 'carregar', mapa, global: {} });
  assert.equal(carregado.sujo, false);

  const comAcaoGlobal = reduzir(carregado, {
    tipo: 'aplicarGlobais',
    global: { $enteringCustomActions: [{ type: 'SetVariable' }] },
  });

  assert.equal(comAcaoGlobal.sujo, true);
  assert.deepEqual(comAcaoGlobal.global, { $enteringCustomActions: [{ type: 'SetVariable' }] });
  assert.equal(comAcaoGlobal.passado.length, 0);
  assert.equal(comAcaoGlobal.mapa, mapa);
});

test('houveArrasto: só conta arrasto de verdade, não um clique que tremeu um pixel', () => {
  assert.equal(houveArrasto(0, 0), false);
  assert.equal(houveArrasto(1, 1), false);
  assert.equal(houveArrasto(2, 0), true);
  assert.equal(houveArrasto(0, -2), true);
  assert.equal(houveArrasto(-5, 5), true);
});

test('o alvo de uma ligação é resolvido pela caixa do bloco, sem depender do elemento do DOM sob o cursor', () => {
  const caixa = { left: 100, top: 80, largura: 175, altura: 76 };
  assert.equal(caixaContemPonto(caixa, { x: 100, y: 80 }), true);
  assert.equal(caixaContemPonto(caixa, { x: 275, y: 156 }), true);
  assert.equal(caixaContemPonto(caixa, { x: 276, y: 156 }), false);
  assert.equal(caixaContemPonto(caixa, { x: 140, y: 157 }), false);
});

test('validação do painel aponta os campos obrigatórios da entrada antes de salvar', () => {
  const block = newBlock({}, { top: 0, left: 0 }, 'bloco');
  const inbound = block.$contentActions?.[0]?.input;
  assert.ok(inbound);
  inbound.variable = 'nome inválido';
  inbound.validation = { rule: 'regex', regex: '', error: '' };

  assert.deepEqual(blockErrors(block, { block }), [
    'O nome da variável de entrada só pode ter letras, números e pontos.',
    'A expressão regular é obrigatória na regra de validação regex.',
    'A mensagem de erro da validação é obrigatória.',
  ]);
});
