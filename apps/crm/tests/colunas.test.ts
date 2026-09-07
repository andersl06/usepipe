import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arranjar, moverVisivel, type Config } from '../src/componentes/colunas.tsx';

/**
 * A régua do arranjo de colunas.
 *
 * O que ela protege é o encontro entre duas listas que divergem sozinhas: a que
 * está guardada no navegador e a que a tela tem hoje. Coluna nova de um deploy,
 * coluna que o agrupamento tirou, coluna que sumiu de vez — as três já
 * quebraram tabela em produto que faz isso, e as três aparecem aqui.
 *
 * Nenhum teste toca React nem `localStorage`: `arranjar` e `moverVisivel` são
 * funções de lista, e é assim que se testa lista.
 */

const CHAVES = ['lead', 'origem', 'score', 'faixa', 'proprietario'];
const LIMPA: Config = { ordem: [], ocultas: [] };

test('sem nada guardado, a ordem é a da tela e a fixa fica de fora das móveis', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(a.todas, ['origem', 'score', 'faixa', 'proprietario']);
  assert.deepEqual(a.visiveis, ['origem', 'score', 'faixa', 'proprietario']);
  assert.deepEqual(a.ocultas, []);
});

test('a coluna fixa nunca é ocultada, nem que alguém edite o armazenamento', () => {
  const a = arranjar(CHAVES, { ordem: ['lead'], ocultas: ['lead', 'score'] }, 'lead');
  assert.equal(a.todas.includes('lead'), false);
  assert.equal(a.visiveis.includes('lead'), false);
  assert.equal(a.ocultas.includes('lead'), false);
  assert.deepEqual(a.ocultas, ['score']);
});

test('a coluna nova de um deploy entra no fim, sem empurrar o que já estava', () => {
  // `faixa` e `proprietario` não existiam quando a pessoa arrumou a tabela.
  const guardada: Config = { ordem: ['score', 'origem'], ocultas: [] };
  const a = arranjar(CHAVES, guardada, 'lead');
  assert.deepEqual(a.visiveis, ['score', 'origem', 'faixa', 'proprietario']);
});

test('coluna que sumiu da tela some do arranjo, e não deixa buraco', () => {
  // É o que acontece ao agrupar por origem: a coluna redundante sai da lista.
  const guardada: Config = { ordem: ['score', 'origem', 'faixa'], ocultas: ['faixa'] };
  const a = arranjar(['lead', 'score', 'proprietario'], guardada, 'lead');
  assert.deepEqual(a.todas, ['score', 'proprietario']);
  assert.deepEqual(a.visiveis, ['score', 'proprietario']);
  assert.deepEqual(a.ocultas, []);
});

test('a oculta guarda o lugar: mostrar de volta não a joga no fim', () => {
  const guardada: Config = { ordem: ['origem', 'score', 'faixa'], ocultas: ['score'] };
  const escondida = arranjar(CHAVES, guardada, 'lead');
  assert.deepEqual(escondida.visiveis, ['origem', 'faixa', 'proprietario']);

  const mostrada = arranjar(CHAVES, { ordem: escondida.todas, ocultas: [] }, 'lead');
  assert.deepEqual(mostrada.visiveis, ['origem', 'score', 'faixa', 'proprietario']);
});

test('mover para baixo põe a coluna depois da que ocupava o destino', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 0, 2), ['score', 'faixa', 'origem', 'proprietario']);
});

test('mover para cima põe a coluna antes da que ocupava o destino', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 3, 1), ['origem', 'proprietario', 'score', 'faixa']);
});

test('mover devolve a ordem COMPLETA, com as ocultas ancoradas na vizinha', () => {
  // `score` está oculta entre `origem` e `faixa`. Mover `faixa` para o começo
  // não pode fazer `score` desaparecer da ordem gravada.
  const a = arranjar(CHAVES, { ordem: [], ocultas: ['score'] }, 'lead');
  assert.deepEqual(a.visiveis, ['origem', 'faixa', 'proprietario']);
  const nova = moverVisivel(a, 1, 0);
  assert.deepEqual(nova, ['faixa', 'origem', 'score', 'proprietario']);
  assert.equal(nova.length, a.todas.length, 'nenhuma coluna pode sumir ao mover');
});

test('mover para o próprio lugar, ou para índice que não existe, não muda nada', () => {
  const a = arranjar(CHAVES, LIMPA, 'lead');
  assert.deepEqual(moverVisivel(a, 1, 1), a.todas);
  assert.deepEqual(moverVisivel(a, 1, 9), a.todas);
  assert.deepEqual(moverVisivel(a, -1, 0), a.todas);
});
