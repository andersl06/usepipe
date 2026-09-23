import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moverSaida } from '../src/paginas/builder/condicoes.ts';
import { estadoInicial, reduzir } from '../src/paginas/builder/estado.ts';
import {
  adicionarBloco,
  desligar,
  excluirBloco,
  ligar,
  montarDesenho,
  moverBloco,
  novoBloco,
  posicaoDe,
} from '../src/paginas/builder/modelo.ts';
import { houveArrasto } from '../src/paginas/builder/setas.ts';
import { errosDoBloco } from '../src/paginas/builder/validacao.ts';

test('montarDesenho exporta os blocos da tela e as ações globais sem alterar o mapa', () => {
  const primeiro = novoBloco({}, { top: 10, left: 20 }, 'primeiro');
  const mapa = { primeiro };

  const desenho = montarDesenho(mapa, { entrada: [{ type: 'SetVariable' }] });

  assert.deepEqual(Object.keys(desenho.fluxo), ['primeiro']);
  assert.equal((desenho.fluxo.primeiro as { id: string }).id, 'primeiro');
  assert.deepEqual(desenho.globais, { entrada: [{ type: 'SetVariable' }] });
  assert.notEqual(desenho.fluxo.primeiro, primeiro);
});

test('cria, move e exclui bloco, removendo destinos que apontavam para ele', () => {
  const origem = novoBloco({}, { top: 10, left: 20 }, 'origem');
  const destino = novoBloco({ origem }, { top: 50, left: 60 }, 'destino');
  const mapa = adicionarBloco({ origem }, destino);
  const resultado = ligar(mapa, 'origem', 'destino', 'saida');
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  const ligado = resultado.mapa;
  const movido = moverBloco(ligado, 'destino', { top: 99.6, left: -1 });

  assert.deepEqual(posicaoDe(movido.destino!), { top: 100, left: 0 });
  assert.equal(excluirBloco(movido, 'destino').destino, undefined);
  assert.deepEqual(excluirBloco(movido, 'destino').origem!.$conditionOutputs, []);
});

test('liga e desliga uma aresta sem duplicar a condição de saída', () => {
  const origem = novoBloco({}, { top: 0, left: 0 }, 'origem');
  const destino = novoBloco({ origem }, { top: 0, left: 200 }, 'destino');
  const mapa = { origem, destino };
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
  const mapa = { bloco: novoBloco({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(estadoInicial(), { tipo: 'carregar', mapa, globais: {} });
  const duranteArrasto = reduzir(carregado, { tipo: 'mover', mapa: moverBloco(mapa, 'bloco', { top: 30, left: 40 }) });
  const solto = reduzir(duranteArrasto, { tipo: 'soltar' });

  assert.equal(solto.passado.length, 1);
  assert.deepEqual(posicaoDe(reduzir(solto, { tipo: 'desfazer' }).mapa.bloco!), { top: 0, left: 0 });
  assert.deepEqual(posicaoDe(reduzir(reduzir(solto, { tipo: 'desfazer' }), { tipo: 'refazer' }).mapa.bloco!), { top: 30, left: 40 });
});

test('mantém a ordem das condições de saída porque a primeira condição compatível vence', () => {
  const bloco = novoBloco({}, { top: 0, left: 0 }, 'origem');
  bloco.$conditionOutputs = [
    { $id: 'primeira', stateId: 'um', conditions: [] },
    { $id: 'segunda', stateId: 'dois', conditions: [] },
  ];

  assert.deepEqual(moverSaida(bloco, 1, 0).$conditionOutputs?.map((saida) => saida.$id), ['segunda', 'primeira']);
});

test('Ctrl+Z some enquanto um bloco está sendo arrastado, para não perder o desfazer do arrasto', () => {
  const mapa = { bloco: novoBloco({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(estadoInicial(), { tipo: 'carregar', mapa, globais: {} });

  // Primeiro arrasto, completo — um passo de verdade no histórico.
  const primeiroMovimento = reduzir(carregado, {
    tipo: 'mover',
    mapa: moverBloco(mapa, 'bloco', { top: 10, left: 10 }),
  });
  const primeiroSolto = reduzir(primeiroMovimento, { tipo: 'soltar' });
  assert.equal(primeiroSolto.passado.length, 1);

  // Segundo arrasto em curso — Ctrl+Z no meio dele não faz nada.
  const duranteArrasto = reduzir(primeiroSolto, {
    tipo: 'mover',
    mapa: moverBloco(primeiroSolto.mapa, 'bloco', { top: 30, left: 40 }),
  });
  const desfeitoNoMeio = reduzir(duranteArrasto, { tipo: 'desfazer' });
  assert.equal(desfeitoNoMeio, duranteArrasto);

  // Soltar depois do Ctrl+Z ignorado empilha certo o passo do segundo arrasto —
  // sem a trava, aqui o mapa voltaria pra (0,0) com um passado corrompido.
  const segundoSolto = reduzir(desfeitoNoMeio, { tipo: 'soltar' });
  assert.equal(segundoSolto.passado.length, 2);
  assert.deepEqual(posicaoDe(segundoSolto.mapa.bloco!), { top: 30, left: 40 });

  // E os dois desfazeres, na ordem certa, voltam ao (10,10) e depois ao (0,0).
  const primeiroDesfazer = reduzir(segundoSolto, { tipo: 'desfazer' });
  assert.deepEqual(posicaoDe(primeiroDesfazer.mapa.bloco!), { top: 10, left: 10 });
  const segundoDesfazer = reduzir(primeiroDesfazer, { tipo: 'desfazer' });
  assert.deepEqual(posicaoDe(segundoDesfazer.mapa.bloco!), { top: 0, left: 0 });
});

test('aplicarGlobais marca sujo sem mexer na pilha de desfazer do desenho', () => {
  const mapa = { bloco: novoBloco({}, { top: 0, left: 0 }, 'bloco') };
  const carregado = reduzir(estadoInicial(), { tipo: 'carregar', mapa, globais: {} });
  assert.equal(carregado.sujo, false);

  const comAcaoGlobal = reduzir(carregado, {
    tipo: 'aplicarGlobais',
    globais: { $enteringCustomActions: [{ type: 'SetVariable' }] },
  });

  assert.equal(comAcaoGlobal.sujo, true);
  assert.deepEqual(comAcaoGlobal.globais, { $enteringCustomActions: [{ type: 'SetVariable' }] });
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

test('validação do painel aponta os campos obrigatórios da entrada antes de salvar', () => {
  const bloco = novoBloco({}, { top: 0, left: 0 }, 'bloco');
  const entrada = bloco.$contentActions?.[0]?.input;
  assert.ok(entrada);
  entrada.variable = 'nome inválido';
  entrada.validation = { rule: 'regex', regex: '', error: '' };

  assert.deepEqual(errosDoBloco(bloco, { bloco }), [
    'O nome da variável de entrada só pode ter letras, números e pontos.',
    'A expressão regular é obrigatória na regra de validação regex.',
    'A mensagem de erro da validação é obrigatória.',
  ]);
});
