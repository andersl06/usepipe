import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NIVEIS_PRIORIDADE, pesoPrioridade } from '@pipe/core/conversa';
import { ordenarFilaDeEspera } from '../src/lib/monitoramento';

/**
 * A régua de prioridade e a ordem da fila de espera.
 *
 * O teste que importa é o terceiro: **`baixa` fura a frente de
 * `sem_prioridade`**. É a regra que motivou o quinto degrau, e é a que quebra
 * silenciosamente se alguém reordenar `NIVEIS_PRIORIDADE` ou reintroduzir um
 * mapa paralelo de pesos.
 */

/** Linha mínima para a ordenação: é só o que ela lê. */
function linha(nome: string, prioridade: string, minuto: number) {
  return {
    nome,
    prioridade,
    marcos: { criadaEm: new Date(Date.UTC(2026, 8, 7, 10, minuto)) },
  };
}

const nomes = (lista: readonly { nome: string }[]) => lista.map((l) => l.nome);

test('a régua tem cinco degraus, e o índice é o peso', () => {
  assert.deepEqual(
    [...NIVEIS_PRIORIDADE],
    ['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'],
  );
  assert.equal(pesoPrioridade('maxima'), 0);
  assert.equal(pesoPrioridade('sem_prioridade'), 4);
});

test('nível desconhecido cai no FIM, não no meio', () => {
  // O defeito antigo mandava o desconhecido para o peso de "média", o que dava
  // prioridade de graça a lixo de dado.
  assert.ok(pesoPrioridade('urgentissima') > pesoPrioridade('sem_prioridade'));
});

test('baixa fura a frente de sem prioridade', () => {
  const fila = ordenarFilaDeEspera([
    linha('sem-prioridade-antiga', 'sem_prioridade', 0),
    linha('baixa-recente', 'baixa', 59),
  ]);
  assert.deepEqual(nomes(fila), ['baixa-recente', 'sem-prioridade-antiga']);
});

test('máxima vem antes de alta, e o empate desempata pela mais antiga', () => {
  const fila = ordenarFilaDeEspera([
    linha('alta-velha', 'alta', 5),
    linha('maxima', 'maxima', 40),
    linha('alta-nova', 'alta', 30),
    linha('media', 'media', 1),
  ]);
  assert.deepEqual(nomes(fila), ['maxima', 'alta-velha', 'alta-nova', 'media']);
});

test('conversa sem marco de criação vai para o fim do seu degrau', () => {
  const fila = ordenarFilaDeEspera([
    { nome: 'sem-marco', prioridade: 'alta', marcos: { criadaEm: null } },
    linha('com-marco', 'alta', 59),
  ]);
  assert.deepEqual(nomes(fila), ['com-marco', 'sem-marco']);
});

test('a data chegada como texto do JSON ordena igual à Date', () => {
  const fila = ordenarFilaDeEspera([
    { nome: 'nova', prioridade: 'alta', marcos: { criadaEm: '2026-09-07T10:30:00.000Z' } },
    { nome: 'velha', prioridade: 'alta', marcos: { criadaEm: '2026-09-07T10:05:00.000Z' } },
  ]);
  assert.deepEqual(nomes(fila), ['velha', 'nova']);
});
