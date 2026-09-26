import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Marcos } from '@pipe/core';
import { conversationEvaluateSla, type RegraSlaCarregada } from '../src/lib/sla.ts';

/**
 * The SLA pill in detailed monitoring.
 *
 * The calculation belongs to `@pipe/core`; what lives here is choosing the applicable rule and translating it into the screen's label. Both decide whether the supervisor sees "ESTOUROU" and goes after the conversation, or sees "—" and moves on. Neither touches the database: they receive the rules already loaded.
 */

const T0 = new Date('2026-09-07T12:00:00Z');
const depois = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

const regra = (parcial: Partial<RegraSlaCarregada> = {}): RegraSlaCarregada => ({
  id: 'r',
  nome: 'Padrão',
  alvo: 'primeira_resposta',
  prazoSeg: 300,
  alertaSeg: 240,
  scopeType: 'tenant',
  scopeId: null,
  ...parcial,
});

const marcos = (parcial: Partial<Marcos> = {}): Marcos => ({
  conversationId: 'c',
  criadaEm: T0,
  atribuidaEm: T0,
  firstResponseIn: null,
  encerradaEm: null,
  closedBy: null,
  assignments: 1,
  ...parcial,
});

test('with no active rule the pill disappears, and never becomes "WITHIN"', () => {
  /*
   * "DENTRO" without a configured rule would be a lie: it claims the deadline is being met when no deadline exists. The em dash is what makes the manager notice a rule still needs to be registered.
   */
  const pill = conversationEvaluateSla([], marcos(), 'fila-1', depois(10));
  assert.equal(pill.state, 'sem_regra');
  assert.equal(pill.rotulo, '—');
});

test('the queue rule beats the tenant rule', () => {
  /*
   * The specific rule is the one the manager configured on purpose. If the tenant's won instead, the urgent queue would inherit the default's loose deadline.
   */
  const regras = [
    regra({ id: 'tenant', prazoSeg: 3600, alertaSeg: null }),
    regra({ id: 'fila', scopeType: 'fila', scopeId: 'fila-1', prazoSeg: 60, alertaSeg: null }),
  ];
  // 120s: dentro do prazo do tenant (3600) e fora do prazo da fila (60).
  assert.equal(conversationEvaluateSla(regras, marcos(), 'fila-1', depois(120)).state, 'estourado');
  // Another queue isn't reached by the specific rule and falls back to the tenant default.
  assert.equal(conversationEvaluateSla(regras, marcos(), 'fila-2', depois(120)).state, 'dentro');
});

test('a conversation with no queue falls back to the tenant rule, not to "no rule"', () => {
  /*
   * A conversation still at the root has a null `queueId` — it's precisely the one at risk of being forgotten, and the one that most needs the clock.
   */
  const pill = conversationEvaluateSla([regra({ alertaSeg: null })], marcos(), null, depois(400));
  assert.equal(pill.state, 'estourado');
});

test('alerta, dentro e estourado seguem os limiares configurados', () => {
  const regras = [regra({ prazoSeg: 300, alertaSeg: 240 })];
  const em = (s: number) => conversationEvaluateSla(regras, marcos(), null, depois(s)).state;
  assert.equal(em(10), 'dentro');
  assert.equal(em(239), 'dentro');
  // The threshold is inclusive: exactly at the alert point, it already alerts.
  assert.equal(em(240), 'alerta');
  assert.equal(em(299), 'alerta');
  assert.equal(em(300), 'estourado');
});

test('estouro anuncia quantos segundos passaram do prazo', () => {
  /*
   * It's the number that orders the queue of what needs attention first. Without it, "ESTOUROU" 10 seconds ago and two hours ago look the same.
   */
  const pill = conversationEvaluateSla([regra({ prazoSeg: 300 })], marcos(), null, depois(500));
  assert.equal(pill.state, 'estourado');
  assert.equal(pill.excedidoSeg, 200);
});

test('sem estouro não há excedido para mostrar', () => {
  const pill = conversationEvaluateSla([regra()], marcos(), null, depois(10));
  assert.equal(pill.excedidoSeg, null);
});

test('responder depois do prazo continua sendo estouro', () => {
  /*
   * The SLA report exists to count what failed. If answering late erased the breach, answering late would be enough to keep the indicator clean — and the breach would disappear exactly in the cases that matter.
   */
  const pill = conversationEvaluateSla(
    [regra({ prazoSeg: 300 })],
    marcos({ firstResponseIn: depois(500) }),
    null,
    depois(600),
  );
  assert.equal(pill.state, 'estourado');
});

test('responder dentro do prazo fecha a pastilha em "CUMPRIDO"', () => {
  /*
   * Fulfilled is a final state: the clock stops. Without this, an old conversation would blow its deadline later just because time kept passing.
   */
  const pill = conversationEvaluateSla(
    [regra({ prazoSeg: 300 })],
    marcos({ firstResponseIn: depois(60) }),
    null,
    depois(9999),
  );
  assert.equal(pill.state, 'cumprido');
  assert.equal(pill.rotulo, 'CUMPRIDO');
});

test('alvo sem marco de início não vira pastilha', () => {
  /*
   * `tempo_resposta` only starts once there's an unanswered client message. Without that marker, counting time since creation would fabricate a breach.
   */
  const pill = conversationEvaluateSla(
    [regra({ alvo: 'tempo_resposta' })],
    marcos(),
    null,
    depois(9999),
  );
  assert.equal(pill.state, 'sem_regra');
});
