import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desenharSankey, sufixoDoRotulo } from '../src/pages/flow/analytics/journey/sankey.ts';

/**
 * The Contact Journey nodes' label — the source's `SankeyService.getLabelSufix`. It has two branches (who arrived / who left) and a third that returns the raw count; the starting node's is the one that disappears in a refactor, because nobody arrives at it.
 */

const arestas = [
  { de: 'Início [0]', para: 'Menu [1]', passo: 1, quantity: 80, tipo: 'regular' as const },
  { de: 'Início [0]', para: 'Saída [1]', passo: 1, quantity: 20, tipo: 'saida' as const },
  { de: 'Menu [1]', para: 'Boleto [2]', passo: 2, quantity: 60, tipo: 'regular' as const },
  { de: 'Menu [1]', para: 'Saída [2]', passo: 2, quantity: 20, tipo: 'saida' as const },
];

test('nó que recebe: quem chegou sobre todos da etapa', () => {
  assert.equal(sufixoDoRotulo('Menu [1]', 1, arestas), '80.00%');
  assert.equal(sufixoDoRotulo('Boleto [2]', 2, arestas), '75.00%');
});

test('nó de partida: quem saiu sobre todos da etapa seguinte', () => {
  assert.equal(sufixoDoRotulo('Início [0]', 0, arestas), '100.00%');
});

test('a negative step returns the next step\'s raw count', () => {
  /*
   * Nobody reaches the starting node, so `r` becomes the sum of step `i + 1` — step 0, which has no edge. That's what the source shows, not a percentage.
   */
  assert.equal(sufixoDoRotulo('Início [0]', -1, arestas), '0');
});

test('the fullest column takes the height, with 30 between nodes', () => {
  const { nos, colunas } = desenharSankey(arestas, 1000, 500);
  assert.equal(colunas, 3);
  const coluna1 = nos.filter((n) => n.column === 1);
  const fundo = Math.max(...coluna1.map((n) => n.y + n.altura));
  assert.ok(Math.abs(fundo - 500) < 1e-6);
  assert.equal(nos.find((n) => n.rotulo.startsWith('Saída [1]'))?.tipo, 'saida');
});
