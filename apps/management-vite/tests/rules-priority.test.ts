import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  queueRules,
  regrasDoTenant,
  rotuloDoNivel,
  type PriorityRule,
} from '../src/lib/rules-priority.ts';

/**
 * The "Regras de Priorização" section slice from the queue-edit page (`FICHA-atendentes-filas-pausas.md` §a.3).
 *
 * `GET /v1/gestao/regras/prioridade` returns the whole tenant; the queue section shows only `escopoTipo === 'fila'` with this queue's `scopeId`. Without this slice, editing the "Suporte" queue would list "Financeiro"'s rules — and deleting one there would delete the other queue's rule.
 */

function regra(
  id: string,
  nome: string,
  scopeType: string,
  scopeId: string | null,
  nivel = 'alta',
): PriorityRule {
  return { id, name: nome, level: nivel, scopeType, scopeId, condition: {}, ativa: true };
}

const TODAS = [
  regra('1', 'VIP', 'fila', 'fila-suporte', 'maxima'),
  regra('2', 'Reclamação', 'fila', 'fila-financeiro'),
  regra('3', 'Cliente antigo', 'tenant', null, 'media'),
  regra('4', 'Fila de segunda', 'fila', 'fila-suporte', 'baixa'),
];

test('the queue\'s section only sees that queue\'s rules', () => {
  assert.deepEqual(
    queueRules(TODAS, 'fila-suporte').map((r) => r.name),
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
    regrasDoTenant(TODAS).map((r) => r.name),
    ['Cliente antigo'],
  );
});

test('o degrau sai em português, pelo rótulo do core', () => {
  assert.equal(rotuloDoNivel('maxima'), 'Máxima');
  assert.equal(rotuloDoNivel('baixa'), 'Baixa');
  /* A level the database has and core doesn't recognize passes through raw, instead of disappearing. */
  assert.equal(rotuloDoNivel('inventada'), 'inventada');
});
