import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diasDoPeriodo,
  erroDoRascunho,
  hojeNoFuso,
  pedidoDeHorario,
  rascunhoDe,
  resumoDaProgramacao,
  type RascunhoDeHorario,
} from '../src/lib/horarios.ts';

const base = (): RascunhoDeHorario => ({ name: 'Comercial', queueIds: [], faixas: {}, periods: [] });

test('hoje no fuso: a virada do dia é a meia-noite local, não a UTC', () => {
  assert.equal(hojeNoFuso(new Date('2026-10-02T02:59:00Z'), 'America/Sao_Paulo'), '2026-10-01');
  assert.equal(hojeNoFuso(new Date('2026-10-02T03:00:00Z'), 'America/Sao_Paulo'), '2026-10-02');
  assert.equal(hojeNoFuso(new Date('2026-10-02T02:59:00Z'), 'UTC'), '2026-10-02');
});

test('dias do período contam os dois extremos, inclusive na virada de ano', () => {
  assert.equal(diasDoPeriodo('2026-12-31', '2027-01-01'), 2);
  assert.equal(diasDoPeriodo('2026-10-01', '2026-10-01'), 1);
});

test('validação do rascunho', () => {
  assert.equal(erroDoRascunho(base()), null);
  assert.match(erroDoRascunho({ ...base(), name: ' ' }) ?? '', /nome/);
  assert.match(erroDoRascunho({ ...base(), faixas: { 1: [{ start: '18:00', end: '08:00' }] } }) ?? '', /Segunda/);
  assert.match(
    erroDoRascunho({
      ...base(),
      faixas: {
        2: [
          { start: '08:00', end: '12:00' },
          { start: '11:00', end: '18:00' },
        ],
      },
    }) ?? '',
    /sobrep/,
  );
  const periodo = (from: string, to: string, chave = 'a') => ({ chave, title: '', from, to });
  assert.match(erroDoRascunho({ ...base(), periods: [periodo('', '')] }) ?? '', /datas/);
  assert.match(erroDoRascunho({ ...base(), periods: [periodo('2026-03-02', '2026-03-01')] }) ?? '', /anterior/);
  assert.match(erroDoRascunho({ ...base(), periods: [periodo('2026-01-01', '2026-04-02')] }) ?? '', /90 dias/);
  assert.equal(erroDoRascunho({ ...base(), periods: [periodo('2026-01-01', '2026-03-31')] }), null);
  assert.match(
    erroDoRascunho({ ...base(), periods: [periodo('2026-01-01', '2026-01-10'), periodo('2026-01-10', '2026-01-12', 'b')] }) ?? '',
    /sobrep/,
  );
});

test('pedido ao servidor e resumo da programação', () => {
  const r = rascunhoDe({
    id: 'h',
    name: ' Comercial ',
    fuso: 'America/Sao_Paulo',
    faixas: [1, 2, 3, 4, 5].map((dayWeek) => ({ id: String(dayWeek), dayWeek, start: '08:00', end: '18:00' })),
    exceptions: [],
    queues: [],
    queueIds: ['f1'],
    periods: [{ title: 'Recesso', from: '2026-12-24', to: '2026-12-26' }],
    abertoAgora: false,
    proximaAberturaEm: null,
    seteDiasSeg: 0,
  });
  const pedido = pedidoDeHorario(r);
  assert.equal(pedido.name, 'Comercial');
  assert.equal(pedido.faixas.length, 5);
  assert.deepEqual(pedido.periods, [{ title: 'Recesso', from: '2026-12-24', to: '2026-12-26' }]);
  assert.equal(resumoDaProgramacao(pedido.faixas.map((f, i) => ({ id: String(i), ...f }))), 'Seg a Sex 08:00–18:00');
  assert.equal(resumoDaProgramacao([]), 'Sem programação');
});
