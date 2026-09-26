import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NIVEIS_PRIORITY, pesoPriority } from '@pipe/core/conversation';
import { esperaOrdenarQueue } from '../src/lib/monitoring';

/**
 * The priority ruler and the waiting-queue order.
 *
 * The test that matters is the third: **`baixa` cuts ahead of `sem_prioridade`**. It's the rule that motivated the fifth step, and it's the one that breaks silently if someone reorders `NIVEIS_PRIORIDADE` or reintroduces a parallel weight map.
 */

/** Minimal row for the ordering: it's all it reads. */
function linha(nome: string, priority: string, minuto: number) {
  return {
    nome,
    priority,
    marcos: { criadaEm: new Date(Date.UTC(2026, 8, 7, 10, minuto)) },
  };
}

const nomes = (lista: readonly { nome: string }[]) => lista.map((l) => l.nome);

test('a régua tem cinco degraus, e o índice é o peso', () => {
  assert.deepEqual(
    [...NIVEIS_PRIORITY],
    ['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'],
  );
  assert.equal(pesoPriority('maxima'), 0);
  assert.equal(pesoPriority('sem_prioridade'), 4);
});

test('nível desconhecido cai no FIM, não no meio', () => {
  // The old defect sent unknown values to the "média" weight, which handed
  // free priority to garbage data.
  assert.ok(pesoPriority('urgentissima') > pesoPriority('sem_prioridade'));
});

test('low cuts in front of no-priority', () => {
  const queue = esperaOrdenarQueue([
    linha('sem-prioridade-antiga', 'sem_prioridade', 0),
    linha('baixa-recente', 'baixa', 59),
  ]);
  assert.deepEqual(nomes(queue), ['baixa-recente', 'sem-prioridade-antiga']);
});

test('máxima vem antes de alta, e o empate desempata pela mais antiga', () => {
  const queue = esperaOrdenarQueue([
    linha('alta-velha', 'alta', 5),
    linha('maxima', 'maxima', 40),
    linha('alta-nova', 'alta', 30),
    linha('media', 'media', 1),
  ]);
  assert.deepEqual(nomes(queue), ['maxima', 'alta-velha', 'alta-nova', 'media']);
});

test('a conversation with no creation marker goes to the end of its tier', () => {
  const queue = esperaOrdenarQueue([
    { nome: 'sem-marco', priority: 'alta', marcos: { criadaEm: null } },
    linha('com-marco', 'alta', 59),
  ]);
  assert.deepEqual(nomes(queue), ['com-marco', 'sem-marco']);
});

test('a data chegada como texto do JSON ordena igual à Date', () => {
  const queue = esperaOrdenarQueue([
    { nome: 'nova', priority: 'alta', marcos: { criadaEm: '2026-09-07T10:30:00.000Z' } },
    { nome: 'velha', priority: 'alta', marcos: { criadaEm: '2026-09-07T10:05:00.000Z' } },
  ]);
  assert.deepEqual(nomes(queue), ['velha', 'nova']);
});
