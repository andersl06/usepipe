import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cincoAnosAntes,
  periodDias,
  inicioDoIntervalo,
  periodValid,
} from '../src/pages/flow/analytics/report-manager/regras.ts';

test('the manager\'s period repeats differenceInDays and the 90-day ceiling', () => {
  assert.equal(periodDias('2026-06-15', '2026-09-13'), 90);
  assert.equal(periodValid('2026-06-15', '2026-09-13'), true);
  assert.equal(periodValid('2026-06-14', '2026-09-13'), false);
  assert.equal(periodValid('2026-09-14', '2026-09-13'), false);
  assert.equal(inicioDoIntervalo('2026-09-13', 7), '2026-09-06');
  assert.equal(inicioDoIntervalo('2024-03-01', 2), '2024-02-28');
  assert.equal(cincoAnosAntes('2026-09-13'), '2021-09-13');
});
