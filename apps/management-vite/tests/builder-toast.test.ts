import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dismissToast,
  expireToasts,
  pushToast,
  TOAST_DURATION_MS,
  TOAST_LIMIT,
} from '@pipe/ui/toast-queue';

test('pushToast puts the newest toast on top and defaults to 5s', () => {
  const comOPrimeiro = pushToast([], { tom: 'sucesso', texto: 'Fluxo publicado!' }, 1000);
  assert.equal(comOPrimeiro.length, 1);
  assert.equal(comOPrimeiro[0]!.texto, 'Fluxo publicado!');
  assert.equal(comOPrimeiro[0]!.duracaoMs, TOAST_DURATION_MS);
  assert.equal(comOPrimeiro[0]!.expiraEm, 1000 + TOAST_DURATION_MS);

  const comOSegundo = pushToast(comOPrimeiro, { tom: 'aviso', texto: 'segundo' }, 2000);
  assert.equal(comOSegundo.length, 2);
  assert.equal(comOSegundo[0]!.texto, 'segundo');
  assert.equal(comOSegundo[1]!.texto, 'Fluxo publicado!');
});

test('pushToast caps the stack at TOAST_LIMIT, dropping the oldest first', () => {
  let lista = pushToast([], { tom: 'aviso', texto: 'toast 0' }, 0);
  for (let i = 1; i <= TOAST_LIMIT; i++) {
    lista = pushToast(lista, { tom: 'aviso', texto: `toast ${i}` }, i);
  }
  assert.equal(lista.length, TOAST_LIMIT);
  assert.equal(lista[0]!.texto, `toast ${TOAST_LIMIT}`);
  assert.ok(!lista.some((t) => t.texto === 'toast 0'), 'the oldest toast was dropped');
});

test('pushToast accepts a custom duration and an optional bold titulo', () => {
  const lista = pushToast(
    [],
    { tom: 'perigo', titulo: 'Título', texto: 'Corpo', duracaoMs: 8000 },
    0,
  );
  assert.equal(lista[0]!.duracaoMs, 8000);
  assert.equal(lista[0]!.expiraEm, 8000);
  assert.equal(lista[0]!.titulo, 'Título');
});

test('dismissToast removes only the matching toast', () => {
  let lista = pushToast([], { tom: 'sucesso', texto: 'a' }, 0);
  lista = pushToast(lista, { tom: 'sucesso', texto: 'b' }, 1);
  const [maisNovo, maisAntigo] = lista;

  const restante = dismissToast(lista, maisAntigo!.id);
  assert.deepEqual(restante.map((t) => t.id), [maisNovo!.id]);
});

test('expireToasts removes only what is past its deadline', () => {
  const lista = pushToast([], { tom: 'aviso', texto: 'expira' }, 0);
  assert.equal(expireToasts(lista, TOAST_DURATION_MS - 1, new Set()).length, 1);
  assert.equal(expireToasts(lista, TOAST_DURATION_MS + 1, new Set()).length, 0);
});

test('expireToasts keeps a paused toast and refreshes its deadline so resuming restarts the countdown', () => {
  const lista = pushToast([], { tom: 'aviso', texto: 'pausado' }, 0);
  const pausados = new Set([lista[0]!.id]);

  // Well past the original deadline, but paused: stays, and its expiraEm moves forward.
  const aindaPausado = expireToasts(lista, TOAST_DURATION_MS + 5000, pausados);
  assert.equal(aindaPausado.length, 1);
  assert.equal(aindaPausado[0]!.expiraEm, TOAST_DURATION_MS + 5000 + TOAST_DURATION_MS);

  // Resumed right after: the refreshed deadline gives it a full new window, not an instant expiry.
  const retomado = expireToasts(aindaPausado, TOAST_DURATION_MS + 5001, new Set());
  assert.equal(retomado.length, 1);

  // Once that fresh window elapses, it goes.
  const expirado = expireToasts(retomado, TOAST_DURATION_MS + 5000 + TOAST_DURATION_MS + 1, new Set());
  assert.equal(expirado.length, 0);
});
