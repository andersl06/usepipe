import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAS_DA_SEMANA,
  dataHora,
  dataIso,
  dataOuNada,
  denominador,
  duration,
  durationLonga,
  numero,
  percentual,
  relogio,
  uuidOuNada,
} from '../src/lib/format.ts';

/**
 * The formatting for every number the manager reads.
 *
 * Nothing here touches the database: it's the layer that turns seconds into text, and it's the last thing that runs before the number shows up on the supervisor's screen. A bug here doesn't crash the app — it prints a plausible, wrong number, which is exactly the kind of failure nobody notices until someone makes a decision about people based on it.
 */

test('duration only shows the hour once there is an hour', () => {
  /*
   * If the 3,600 boundary slips, the open-conversations list shows "59:59" for an hour-plus conversation, and the critical case disappears.
   */
  assert.equal(duration(3599), '59:59');
  assert.equal(duration(3600), '1:00:00');
  assert.equal(duration(0), '00:00');
  assert.equal(duration(59), '00:59');
});

test('duration never becomes negative or "NaN"', () => {
  /*
   * `segundosEntre` returns negative when the database clock and the server clock disagree. Without the floor at zero, the screen would show "-1:-5" live.
   */
  assert.equal(duration(-5), '00:00');
  assert.equal(duration(NaN), '—');
  assert.equal(duration(null), '—');
  assert.equal(duration(undefined), '—');
});

test('a long duration never produces "1h 60min"', () => {
  /*
   * Rounding the hour's remainder separately added 60 minutes without adding the hour. 7,190s is 1h59min48s: the effort report printed "1h 60min".
   */
  assert.equal(durationLonga(7190), '2h 00min');
  assert.equal(durationLonga(3599), '1h 00min');
  assert.equal(durationLonga(15120), '4h 12min');
  assert.equal(durationLonga(90), '2min');
  assert.equal(durationLonga(0), '0min');
});

test('a long duration returns a dash for absence, not "NaNmin"', () => {
  /*
   * Averaging over a zero population returns `NaN` from core. Without this guard, the report prints "NaNmin" instead of admitting there's no data.
   */
  assert.equal(durationLonga(NaN), '—');
  assert.equal(durationLonga(null), '—');
  assert.equal(durationLonga(undefined), '—');
});

test('numbers use Brazilian separators', () => {
  /*
   * Thousands dot and decimal comma. With English formatting, "1.234" would be read as a thousand times smaller by whoever reads the screen.
   */
  assert.equal(numero(1234), '1.234');
  assert.equal(numero(1234.56, 2), '1.234,56');
  assert.equal(numero(0), '0');
  assert.equal(numero(null), '—');
  assert.equal(numero(NaN), '—');
});

test('a percentage rounds to an integer and rejects anything that is not a number', () => {
  assert.equal(percentual(0.8756), '88%');
  assert.equal(percentual(0), '0%');
  assert.equal(percentual(1), '100%');
  assert.equal(percentual(NaN), '—');
  assert.equal(percentual(null), '—');
});

test('the denominator shows the population and what was left out', () => {
  /*
   * Metrics ruler (§2): an average that hides the denominator improves precisely when service quality worsens, because the bad conversations drop out of the count. If this text disappears, the number goes back to lying without warning.
   */
  assert.equal(
    denominador({ population: 289, excluidas: 23, value: null, soma: 0 }),
    '289 de 312 · 23 sem resposta',
  );
  // No exclusion means no suffix: zero isn't announced.
  assert.equal(denominador({ population: 10, excluidas: 0, value: null, soma: 0 }), '10 de 10');
  assert.equal(denominador({ population: 0, excluidas: 0, value: null, soma: 0 }), '0 de 0');
  // The label for what was excluded changes per metric.
  assert.equal(
    denominador({ population: 5, excluidas: 2, value: null, soma: 0 }, 'sem nota'),
    '5 de 7 · 2 sem nota',
  );
});

test('data e hora saem no fuso do tenant, não no do servidor', () => {
  /*
   * 02:00 UTC is still the previous day in São Paulo. If the timezone is ignored, the History period filter picks the wrong day and the manager sees yesterday's numbers thinking they're today's.
   */
  const instante = new Date('2026-09-07T02:00:00Z');
  assert.equal(dataIso(instante, 'America/Sao_Paulo'), '2026-09-06');
  assert.equal(dataIso(instante, 'UTC'), '2026-09-07');
  assert.equal(dataHora(instante, 'America/Sao_Paulo'), '06/09, 23:00');
  assert.equal(dataHora(null, 'America/Sao_Paulo'), '—');
});

test('o relógio corta os segundos que o Postgres devolve', () => {
  /*
   * The `time` type returns `HH:MM:SS`; `<input type="time">` and the screen want `HH:MM`. With the seconds included, the schedule form field comes back empty.
   */
  assert.equal(relogio('09:30:00'), '09:30');
  assert.equal(relogio('23:59:59'), '23:59');
});

test('the week starts on Sunday, the way Postgres counts it', () => {
  /*
   * Postgres's `extract(dow)` and core's `getUTCDay` both use 0 = Sunday. If this list is rotated, Monday's business hours start applying on Sunday.
   */
  assert.equal(DIAS_DA_SEMANA[0], 'Domingo');
  assert.equal(DIAS_DA_SEMANA[6], 'Sábado');
  assert.equal(DIAS_DA_SEMANA.length, 7);
});

test('a URL filter that is not a UUID becomes "no filter", never a query', () => {
  /*
   * `?fila=abc` reached Postgres as `abc::uuid` and brought the screen down with a 500. A malformed filter is, at most, an ignored filter — not a server error.
   */
  assert.equal(
    uuidOuNada('bed9a832-13d2-456e-a623-5f8de4a91e73'),
    'bed9a832-13d2-456e-a623-5f8de4a91e73',
  );
  assert.equal(uuidOuNada('abc'), undefined);
  assert.equal(uuidOuNada(''), undefined);
  assert.equal(uuidOuNada(undefined), undefined);
  // Near-UUID: one extra digit is still not a UUID.
  assert.equal(uuidOuNada('bed9a832-13d2-456e-a623-5f8de4a91e733'), undefined);
});

test('a URL date only passes in the format Postgres accepts, and only if it exists on the calendar', () => {
  assert.equal(dataOuNada('2026-09-07'), '2026-09-07');
  assert.equal(dataOuNada('abc'), undefined);
  assert.equal(dataOuNada('07/09/2026'), undefined);
  // February 31st passes the format check and doesn't exist: `::date` would reject it with a 500.
  assert.equal(dataOuNada('2026-02-31'), undefined);
  assert.equal(dataOuNada('2026-13-01'), undefined);
  assert.equal(dataOuNada(undefined), undefined);
});
