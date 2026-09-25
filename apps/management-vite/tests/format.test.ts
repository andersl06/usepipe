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
 * A formatação de todo número que o gestor lê.
 *
 * Nada aqui toca banco: é a camada que transforma segundo em texto, e é a
 * última coisa que roda antes do número aparecer na tela do supervisor. Erro
 * aqui não derruba o aplicativo — ele imprime um número plausível e errado, que
 * é justamente o tipo de falha que ninguém percebe até alguém tomar decisão
 * sobre gente em cima dele.
 */

test('duration only shows the hour once there is an hour', () => {
  /* Se a fronteira dos 3.600 escorregar, a lista de conversas abertas mostra
     "59:59" para atendimento de mais de uma hora, e some com o caso crítico. */
  assert.equal(duration(3599), '59:59');
  assert.equal(duration(3600), '1:00:00');
  assert.equal(duration(0), '00:00');
  assert.equal(duration(59), '00:59');
});

test('duration never becomes negative or "NaN"', () => {
  /* `segundosEntre` devolve negativo quando o relógio do banco e o do servidor
     discordam. Sem o piso em zero, a tela mostraria "-1:-5" ao vivo. */
  assert.equal(duration(-5), '00:00');
  assert.equal(duration(NaN), '—');
  assert.equal(duration(null), '—');
  assert.equal(duration(undefined), '—');
});

test('a long duration never produces "1h 60min"', () => {
  /* Arredondar o resto da hora separado somava 60 minutos sem somar a hora.
     7.190s são 1h59min48s: o relatório de esforço imprimia "1h 60min". */
  assert.equal(durationLonga(7190), '2h 00min');
  assert.equal(durationLonga(3599), '1h 00min');
  assert.equal(durationLonga(15120), '4h 12min');
  assert.equal(durationLonga(90), '2min');
  assert.equal(durationLonga(0), '0min');
});

test('a long duration returns a dash for absence, not "NaNmin"', () => {
  /* Média sobre população zero volta `NaN` do core. Sem esta guarda, o
     relatório imprime "NaNmin" em vez de admitir que não há dado. */
  assert.equal(durationLonga(NaN), '—');
  assert.equal(durationLonga(null), '—');
  assert.equal(durationLonga(undefined), '—');
});

test('numbers use Brazilian separators', () => {
  /* Ponto de milhar e vírgula decimal. Com a formatação inglesa, "1.234"
     seria lido como mil vezes menor por quem lê a tela. */
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
  /* Régua de métricas (§2): média que esconde o denominador melhora justamente
     quando o atendimento piora, porque as conversas ruins caem da conta. Se
     este texto sumir, o número volta a mentir sem avisar. */
  assert.equal(
    denominador({ population: 289, excluidas: 23, value: null, soma: 0 }),
    '289 de 312 · 23 sem resposta',
  );
  // Sem exclusão não há sufixo: não se anuncia zero.
  assert.equal(denominador({ population: 10, excluidas: 0, value: null, soma: 0 }), '10 de 10');
  assert.equal(denominador({ population: 0, excluidas: 0, value: null, soma: 0 }), '0 de 0');
  // O rótulo do que foi excluído muda por métrica.
  assert.equal(
    denominador({ population: 5, excluidas: 2, value: null, soma: 0 }, 'sem nota'),
    '5 de 7 · 2 sem nota',
  );
});

test('data e hora saem no fuso do tenant, não no do servidor', () => {
  /* 02:00 UTC ainda é o dia anterior em São Paulo. Se o fuso for ignorado, o
     filtro de período do histórico pega o dia errado e o gestor vê números de
     ontem achando que são de hoje. */
  const instante = new Date('2026-09-07T02:00:00Z');
  assert.equal(dataIso(instante, 'America/Sao_Paulo'), '2026-09-06');
  assert.equal(dataIso(instante, 'UTC'), '2026-09-07');
  assert.equal(dataHora(instante, 'America/Sao_Paulo'), '06/09, 23:00');
  assert.equal(dataHora(null, 'America/Sao_Paulo'), '—');
});

test('o relógio corta os segundos que o Postgres devolve', () => {
  /* O tipo `time` volta `HH:MM:SS`; `<input type="time">` e a tela querem
     `HH:MM`. Com os segundos, o campo do formulário de horário vem vazio. */
  assert.equal(relogio('09:30:00'), '09:30');
  assert.equal(relogio('23:59:59'), '23:59');
});

test('the week starts on Sunday, the way Postgres counts it', () => {
  /* `extract(dow)` do Postgres e `getUTCDay` do core usam 0 = domingo. Se esta
     lista girar, o horário de atendimento de segunda passa a valer no domingo. */
  assert.equal(DIAS_DA_SEMANA[0], 'Domingo');
  assert.equal(DIAS_DA_SEMANA[6], 'Sábado');
  assert.equal(DIAS_DA_SEMANA.length, 7);
});

test('a URL filter that is not a UUID becomes "no filter", never a query', () => {
  /* `?fila=abc` chegava ao Postgres como `abc::uuid` e derrubava a tela em 500.
     Filtro torto é, no máximo, filtro ignorado — não é erro de servidor. */
  assert.equal(
    uuidOuNada('bed9a832-13d2-456e-a623-5f8de4a91e73'),
    'bed9a832-13d2-456e-a623-5f8de4a91e73',
  );
  assert.equal(uuidOuNada('abc'), undefined);
  assert.equal(uuidOuNada(''), undefined);
  assert.equal(uuidOuNada(undefined), undefined);
  // Quase-UUID: um dígito a mais continua não sendo UUID.
  assert.equal(uuidOuNada('bed9a832-13d2-456e-a623-5f8de4a91e733'), undefined);
});

test('a URL date only passes in the format Postgres accepts, and only if it exists on the calendar', () => {
  assert.equal(dataOuNada('2026-09-07'), '2026-09-07');
  assert.equal(dataOuNada('abc'), undefined);
  assert.equal(dataOuNada('07/09/2026'), undefined);
  // 31 de fevereiro passa no formato e não existe: o `::date` recusaria com 500.
  assert.equal(dataOuNada('2026-02-31'), undefined);
  assert.equal(dataOuNada('2026-13-01'), undefined);
  assert.equal(dataOuNada(undefined), undefined);
});
