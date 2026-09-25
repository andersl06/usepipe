import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  queueRules,
  regrasDoTenant,
  rotuloDoNivel,
  type PriorityRule,
} from '../src/lib/rules-priority.ts';

/**
 * O recorte da seção "Regras de Priorização" da página de edição de fila
 * (`FICHA-atendentes-filas-pausas.md` §a.3).
 *
 * `GET /v1/gestao/regras/prioridade` devolve o tenant inteiro; a seção da fila
 * mostra só `escopoTipo === 'fila'` com `escopoId` desta fila. Sem este
 * recorte, editar a fila "Suporte" listaria as regras da "Financeiro" — e a
 * exclusão ali apagaria a regra da outra fila.
 */

function regra(
  id: string,
  nome: string,
  scopeTipo: string,
  scopeId: string | null,
  nivel = 'alta',
): PriorityRule {
  return { id, nome, nivel, scopeTipo, scopeId, condition: {}, active: true };
}

const TODAS = [
  regra('1', 'VIP', 'fila', 'fila-suporte', 'maxima'),
  regra('2', 'Reclamação', 'fila', 'fila-financeiro'),
  regra('3', 'Cliente antigo', 'tenant', null, 'media'),
  regra('4', 'Fila de segunda', 'fila', 'fila-suporte', 'baixa'),
];

test('the queue\'s section only sees that queue\'s rules', () => {
  assert.deepEqual(
    queueRules(TODAS, 'fila-suporte').map((r) => r.nome),
    ['VIP', 'Fila de segunda'],
  );
  assert.deepEqual(queueRules(TODAS, 'fila-sem-regra'), []);
});

test('a tenant-scoped rule does not appear in the queue\'s section', () => {
  assert.equal(
    queueRules(TODAS, 'fila-suporte').some((r) => r.scopeType === 'tenant'),
    false,
  );
  assert.deepEqual(
    regrasDoTenant(TODAS).map((r) => r.nome),
    ['Cliente antigo'],
  );
});

test('o degrau sai em português, pelo rótulo do core', () => {
  assert.equal(rotuloDoNivel('maxima'), 'Máxima');
  assert.equal(rotuloDoNivel('baixa'), 'Baixa');
  /* Nível que o banco tenha e o core não conheça sai cru, em vez de sumir. */
  assert.equal(rotuloDoNivel('inventada'), 'inventada');
});
