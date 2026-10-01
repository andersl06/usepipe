import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  avisoDeExclusao,
  diasDoPeriodo,
  erroDoRascunho,
  hojeNoFuso,
  pedidoDeHorario,
  rascunhoDe,
  resumoDaProgramacao,
  type RascunhoDeHorario,
} from '../src/lib/horarios.ts';

const base = (): RascunhoDeHorario => ({
  name: 'Comercial',
  description: '',
  regular: false,
  queueIds: [],
  faixas: {},
  periods: [],
});

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
  const periodo = (from: string, to: string, chave = 'a') => ({
    chave,
    title: '',
    fullDay: true,
    from,
    fromTime: '00:00',
    to,
    toTime: '23:59',
  });
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
    description: null,
    regular: false,
    fuso: 'America/Sao_Paulo',
    faixas: [1, 2, 3, 4, 5].map((dayWeek) => ({ id: String(dayWeek), dayWeek, start: '08:00', end: '18:00' })),
    exceptions: [],
    queues: [],
    queueIds: ['f1'],
    periods: [
      { title: 'Recesso', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-26', toTime: '23:59' },
    ],
    abertoAgora: false,
    proximaAberturaEm: null,
    seteDiasSeg: 0,
  });
  const pedido = pedidoDeHorario(r);
  assert.equal(pedido.name, 'Comercial');
  assert.equal(pedido.faixas.length, 5);
  assert.deepEqual(pedido.periods, [
    { title: 'Recesso', fullDay: true, from: '2026-12-24', fromTime: '00:00', to: '2026-12-26', toTime: '23:59' },
  ]);
  assert.equal(pedido.description, null);
  assert.equal(pedido.regular, false);
  assert.equal(resumoDaProgramacao(pedido.faixas.map((f, i) => ({ id: String(i), ...f }))), 'Seg a Sex 08:00–18:00');
  assert.equal(resumoDaProgramacao([]), 'Sem programação');
});

test('período com hora: fim depois do início e sobreposição por data e hora', () => {
  const comHora = (chave: string, from: string, fromTime: string, to: string, toTime: string) => ({
    chave,
    title: '',
    fullDay: false,
    from,
    fromTime,
    to,
    toTime,
  });
  const um = comHora('a', '2026-12-24', '14:00', '2026-12-24', '18:00');
  assert.equal(erroDoRascunho({ ...base(), periods: [um] }), null);
  assert.match(erroDoRascunho({ ...base(), periods: [{ ...um, toTime: '14:00' }] }) ?? '', /depois do início/);
  assert.equal(
    erroDoRascunho({ ...base(), periods: [um, comHora('b', '2026-12-24', '18:00', '2026-12-25', '09:00')] }),
    null,
  );
  assert.match(
    erroDoRascunho({ ...base(), periods: [um, comHora('b', '2026-12-24', '17:00', '2026-12-25', '09:00')] }) ?? '',
    /sobrep/,
  );
  // dia completo (24/12 inteiro) em cima do período com hora
  assert.match(
    erroDoRascunho({ ...base(), periods: [um, { ...um, chave: 'c', fullDay: true, fromTime: '00:00', toTime: '23:59' }] }) ?? '',
    /sobrep/,
  );
  assert.match(erroDoRascunho({ ...base(), description: 'x'.repeat(301) }) ?? '', /descrição/);
});

test('alerta de exclusão: horário regular ou 24 horas', () => {
  const todos = [
    { id: 'r', regular: true },
    { id: 'x', regular: false },
  ];
  assert.match(avisoDeExclusao(todos[1]!, todos), /passarão a operar no Horário regular/);
  assert.match(avisoDeExclusao(todos[0]!, todos), /24 horas/);
  assert.match(avisoDeExclusao(todos[1]!, [todos[1]!]), /24 horas/);
});
