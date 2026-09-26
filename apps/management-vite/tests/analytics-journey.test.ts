import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desenharSankey, sufixoDoRotulo } from '../src/pages/flow/analytics/journey/sankey.ts';

/**
 * O rótulo dos nós da Jornada dos Contatos — `SankeyService.getLabelSufix` da
 * origem. Tem dois ramos (quem chegou / quem saiu) e um terceiro que devolve a
 * contagem crua; o do nó de partida é o que some numa refatoração, porque
 * ninguém chega nele.
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
  /* Ninguém chega no nó de partida, então `r` vira a soma da etapa `i + 1` —
     a 0, que não tem aresta. É o que a origem mostra, e não uma porcentagem. */
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
