import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Marcos } from '@pipe/core';
import { conversationAvaliarSla, type RegraSlaCarregada } from '../src/lib/sla.ts';

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
  firstRespostaIn: null,
  encerradaEm: null,
  encerradaBy: null,
  assignments: 1,
  ...parcial,
});

test('with no active rule the pill disappears, and never becomes "WITHIN"', () => {
  /*
   * "DENTRO" without a configured rule would be a lie: it claims the deadline is being met when no deadline exists. The em dash is what makes the manager notice a rule still needs to be registered.
   */
  const pill = conversationAvaliarSla([], marcos(), 'fila-1', depois(10));
  assert.equal(pill.state, 'without_rule');
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
  assert.equal(conversationAvaliarSla(regras, marcos(), 'fila-1', depois(120)).state, 'exceeded');
  // Another queue isn't reached by the specific rule and falls back to the tenant default.
  assert.equal(conversationAvaliarSla(regras, marcos(), 'fila-2', depois(120)).state, 'inside');
});

test('a conversation with no queue falls back to the tenant rule, not to "no rule"', () => {
  /*
   * A conversation still at the root has a null `filaId` — it's precisely the one at risk of being forgotten, and the one that most needs the clock.
   */
  const pill = conversationAvaliarSla([regra({ alertaSeg: null })], marcos(), null, depois(400));
  assert.equal(pill.state, 'exceeded');
});

test('alerta, dentro e estourado seguem os limiares configurados', () => {
  const regras = [regra({ prazoSeg: 300, alertaSeg: 240 })];
  const em = (s: number) => conversationAvaliarSla(regras, marcos(), null, depois(s)).state;
  assert.equal(em(10), 'inside');
  assert.equal(em(239), 'inside');
  // The threshold is inclusive: exactly at the alert point, it already alerts.
  assert.equal(em(240), 'alert');
  assert.equal(em(299), 'alert');
  assert.equal(em(300), 'exceeded');
});

test('estouro anuncia quantos segundos passaram do prazo', () => {
  /*
   * It's the number that orders the queue of what needs attention first. Without it, "ESTOUROU" 10 seconds ago and two hours ago look the same.
   */
  const pill = conversationAvaliarSla([regra({ prazoSeg: 300 })], marcos(), null, depois(500));
  assert.equal(pill.state, 'exceeded');
  assert.equal(pill.excedidoSeg, 200);
});

test('sem estouro não há excedido para mostrar', () => {
  const pill = conversationAvaliarSla([regra()], marcos(), null, depois(10));
  assert.equal(pill.excedidoSeg, null);
});

test('responder depois do prazo continua sendo estouro', () => {
  /*
   * The SLA report exists to count what failed. If answering late erased the breach, answering late would be enough to keep the indicator clean — and the breach would disappear exactly in the cases that matter.
   */
  const pill = conversationAvaliarSla(
    [regra({ prazoSeg: 300 })],
    marcos({ firstRespostaIn: depois(500) }),
    null,
    depois(600),
  );
  assert.equal(pill.state, 'exceeded');
});

test('responder dentro do prazo fecha a pastilha em "CUMPRIDO"', () => {
  /*
   * Fulfilled is a final state: the clock stops. Without this, an old conversation would blow its deadline later just because time kept passing.
   */
  const pill = conversationAvaliarSla(
    [regra({ prazoSeg: 300 })],
    marcos({ firstRespostaIn: depois(60) }),
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
  const pill = conversationAvaliarSla(
    [regra({ alvo: 'tempo_resposta' })],
    marcos(),
    null,
    depois(9999),
  );
  assert.equal(pill.state, 'without_rule');
});
