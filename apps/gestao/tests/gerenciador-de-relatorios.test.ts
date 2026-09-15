import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cincoAnosAntes,
  diasDoPeriodo,
  inicioDoIntervalo,
  periodoValido,
} from '../src/app/fluxo/[id]/analise/gerenciador-de-relatorios/regras.ts';

test('o período do gerenciador repete o differenceInDays e o teto de 90 dias', () => {
  assert.equal(diasDoPeriodo('2026-06-15', '2026-09-13'), 90);
  assert.equal(periodoValido('2026-06-15', '2026-09-13'), true);
  assert.equal(periodoValido('2026-06-14', '2026-09-13'), false);
  assert.equal(periodoValido('2026-09-14', '2026-09-13'), false);
  assert.equal(inicioDoIntervalo('2026-09-13', 7), '2026-09-06');
  assert.equal(inicioDoIntervalo('2024-03-01', 2), '2024-02-28');
  assert.equal(cincoAnosAntes('2026-09-13'), '2021-09-13');
});
