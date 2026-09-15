import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  comparacao,
  diasDoIntervalo,
  escalaDoEixo,
  formatar,
  intervaloAnterior,
  intervaloDoPeriodo,
  lerPeriodo,
  rotuloDoIntervalo,
  variacao,
} from '../src/lib/analise.ts';

/**
 * As regras da Análise do contato que a origem esconde no navegador
 * (`analytics-main.js`): o intervalo de cada chip (`xT`/`St`), o período de
 * comparação (`ft`), o texto do período (`IS`) e da dica (`XS`), e o `WS` que
 * formata todo número. Voltam erradas em silêncio — a tela carrega, só mostra
 * outro dia ou "0%" onde era "-".
 */

/* 13/09/2026 é um domingo. */
const HOJE = '2026-09-13';

test('"Últimos 7 dias" é D-7 a D-1, sem hoje', () => {
  assert.deepEqual(intervaloDoPeriodo('7days', HOJE), { inicio: '2026-09-06', fim: '2026-09-12' });
});

test('"Hoje" e "Ontem" são um dia só', () => {
  assert.deepEqual(intervaloDoPeriodo('today', HOJE), { inicio: HOJE, fim: HOJE });
  assert.deepEqual(intervaloDoPeriodo('yesterday', HOJE), {
    inicio: '2026-09-12',
    fim: '2026-09-12',
  });
});

test('semana anterior é domingo a sábado; a atual começa no domingo', () => {
  assert.deepEqual(intervaloDoPeriodo('lastWeek', '2026-09-16'), {
    inicio: '2026-09-06',
    fim: '2026-09-12',
  });
  assert.deepEqual(intervaloDoPeriodo('currentWeek', '2026-09-16'), {
    inicio: '2026-09-13',
    fim: '2026-09-16',
  });
  /* No domingo a "semana atual" é só hoje. */
  assert.deepEqual(intervaloDoPeriodo('currentWeek', HOJE), { inicio: HOJE, fim: HOJE });
});

test('mês anterior vai do dia 1 ao último dia, atravessando o ano', () => {
  assert.deepEqual(intervaloDoPeriodo('lastMonth', '2026-03-10'), {
    inicio: '2026-02-01',
    fim: '2026-02-28',
  });
  assert.deepEqual(intervaloDoPeriodo('lastMonth', '2027-01-05'), {
    inicio: '2026-12-01',
    fim: '2026-12-31',
  });
  assert.deepEqual(intervaloDoPeriodo('currentMonth', HOJE), { inicio: '2026-09-01', fim: HOJE });
});

test('personalizado respeita o limite para trás, não passa de hoje e não inverte', () => {
  const ok = intervaloDoPeriodo('custom', HOJE, {
    de: '2026-09-01',
    ate: '2026-09-10',
    limiteDias: 90,
  });
  assert.deepEqual(ok, { inicio: '2026-09-01', fim: '2026-09-10' });
  assert.equal(
    intervaloDoPeriodo('custom', HOJE, { de: '2026-05-01', ate: '2026-05-02', limiteDias: 90 }),
    null,
  );
  assert.ok(
    intervaloDoPeriodo('custom', HOJE, { de: '2026-05-01', ate: '2026-05-02', limiteDias: 186 }),
  );
  assert.equal(
    intervaloDoPeriodo('custom', HOJE, { de: '2026-09-10', ate: '2026-09-01', limiteDias: 90 }),
    null,
  );
  assert.equal(
    intervaloDoPeriodo('custom', HOJE, { de: '2026-09-10', ate: '2026-09-14', limiteDias: 90 }),
    null,
  );
  assert.equal(intervaloDoPeriodo('custom', HOJE, { limiteDias: 90 }), null);
});

test('período desconhecido na URL cai em "Hoje"', () => {
  assert.equal(lerPeriodo('ontem'), 'today');
  assert.equal(lerPeriodo(undefined), 'today');
  assert.equal(lerPeriodo('15days'), '15days');
});

test('o anterior tem o mesmo tanto de dias, logo antes', () => {
  assert.deepEqual(intervaloAnterior({ inicio: '2026-09-06', fim: '2026-09-12' }), {
    inicio: '2026-08-30',
    fim: '2026-09-05',
  });
  assert.equal(diasDoIntervalo({ inicio: '2026-08-30', fim: '2026-09-05' }).length, 7);
});

test('rótulo do período e a dica da comparação', () => {
  assert.equal(
    rotuloDoIntervalo({ inicio: HOJE, fim: HOJE }),
    '13 de setembro de 2026 - 00h às 23h59',
  );
  assert.equal(
    comparacao({ inicio: HOJE, fim: HOJE }, HOJE).dica,
    'Em comparação com a data 12 de setembro de 2026 - 00h às 23h59.',
  );
  assert.equal(
    comparacao({ inicio: '2026-09-06', fim: '2026-09-12' }, HOJE).dica,
    'Em comparação com o período de 30 de agosto de 2026 a 05 de setembro de 2026.',
  );
  /* O anterior de 60 dias começa antes de 90 dias atrás: some o número. */
  const longe = comparacao({ inicio: '2026-07-01', fim: '2026-08-29' }, HOJE);
  assert.equal(longe.foraDoAlcance, true);
});

test('WS: absoluto, percentual, padrão e sinal', () => {
  assert.equal(formatar(1234.5678), '1.235');
  assert.equal(formatar(12.346), '12,35');
  assert.equal(formatar(undefined), '-');
  assert.equal(formatar(0), '0');
  assert.equal(formatar(0, { percentual: true, padrao: '0%' }), '0%');
  assert.equal(formatar(0.12345, { percentual: true }), '12,35%');
  assert.equal(formatar(0.5, { percentual: true, casas: 0, sinal: true }), '+50%');
  assert.equal(formatar(-0.25, { percentual: true, casas: 0, sinal: true }), '-25%');
  /* Arredondou para zero: vira o padrão, não "0%". */
  assert.equal(formatar(0.001, { percentual: true, casas: 0, sinal: true }), '-');
  assert.equal(formatar(Infinity, { percentual: true }), '-');
});

test('eixo do chart.js 3.9.1: zero é 0 a 1, e o passo é o niceNum sem arredondar', () => {
  assert.deepEqual(escalaDoEixo(0), {
    topo: 1,
    tiques: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  });
  assert.deepEqual(escalaDoEixo(37).tiques, [0, 5, 10, 15, 20, 25, 30, 35, 40]);
  assert.equal(escalaDoEixo(650).topo, 700);
  /* 12/10 = 1,2 → passo 2 (a regra antiga, que arredonda antes, dava 1 e 13 tiques). */
  assert.deepEqual(escalaDoEixo(12).tiques, [0, 2, 4, 6, 8, 10, 12]);
});

test('variação: igual é zero, anterior zero é infinito, ausente é indefinida', () => {
  assert.equal(variacao(5, 5), 0);
  assert.equal(variacao(0, 0), 0);
  assert.equal(variacao(3, 0), Infinity);
  assert.equal(variacao(15, 10), 0.5);
  assert.equal(variacao(undefined, 3), undefined);
});
