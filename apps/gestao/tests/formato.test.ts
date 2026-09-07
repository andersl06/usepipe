import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAS_DA_SEMANA,
  dataHora,
  dataIso,
  denominador,
  duracao,
  duracaoLonga,
  numero,
  percentual,
  relogio,
} from '../src/lib/formato.ts';

/**
 * A formatação de todo número que o gestor lê.
 *
 * Nada aqui toca banco: é a camada que transforma segundo em texto, e é a
 * última coisa que roda antes do número aparecer na tela do supervisor. Erro
 * aqui não derruba o aplicativo — ele imprime um número plausível e errado, que
 * é justamente o tipo de falha que ninguém percebe até alguém tomar decisão
 * sobre gente em cima dele.
 */

test('duração passa a mostrar a hora só quando existe hora', () => {
  /* Se a fronteira dos 3.600 escorregar, a lista de conversas abertas mostra
     "59:59" para atendimento de mais de uma hora, e some com o caso crítico. */
  assert.equal(duracao(3599), '59:59');
  assert.equal(duracao(3600), '1:00:00');
  assert.equal(duracao(0), '00:00');
  assert.equal(duracao(59), '00:59');
});

test('duração nunca vira negativa nem "NaN"', () => {
  /* `segundosEntre` devolve negativo quando o relógio do banco e o do servidor
     discordam. Sem o piso em zero, a tela mostraria "-1:-5" ao vivo. */
  assert.equal(duracao(-5), '00:00');
  assert.equal(duracao(NaN), '—');
  assert.equal(duracao(null), '—');
  assert.equal(duracao(undefined), '—');
});

test('duração longa não fabrica "1h 60min"', () => {
  /* Arredondar o resto da hora separado somava 60 minutos sem somar a hora.
     7.190s são 1h59min48s: o relatório de esforço imprimia "1h 60min". */
  assert.equal(duracaoLonga(7190), '2h 00min');
  assert.equal(duracaoLonga(3599), '1h 00min');
  assert.equal(duracaoLonga(15120), '4h 12min');
  assert.equal(duracaoLonga(90), '2min');
  assert.equal(duracaoLonga(0), '0min');
});

test('duração longa devolve travessão para ausência, e não "NaNmin"', () => {
  /* Média sobre população zero volta `NaN` do core. Sem esta guarda, o
     relatório imprime "NaNmin" em vez de admitir que não há dado. */
  assert.equal(duracaoLonga(NaN), '—');
  assert.equal(duracaoLonga(null), '—');
  assert.equal(duracaoLonga(undefined), '—');
});

test('número usa a separação brasileira', () => {
  /* Ponto de milhar e vírgula decimal. Com a formatação inglesa, "1.234"
     seria lido como mil vezes menor por quem lê a tela. */
  assert.equal(numero(1234), '1.234');
  assert.equal(numero(1234.56, 2), '1.234,56');
  assert.equal(numero(0), '0');
  assert.equal(numero(null), '—');
  assert.equal(numero(NaN), '—');
});

test('percentual arredonda para inteiro e recusa o que não é número', () => {
  assert.equal(percentual(0.8756), '88%');
  assert.equal(percentual(0), '0%');
  assert.equal(percentual(1), '100%');
  assert.equal(percentual(NaN), '—');
  assert.equal(percentual(null), '—');
});

test('o denominador mostra a população e o que ficou de fora', () => {
  /* Régua de métricas (§2): média que esconde o denominador melhora justamente
     quando o atendimento piora, porque as conversas ruins caem da conta. Se
     este texto sumir, o número volta a mentir sem avisar. */
  assert.equal(
    denominador({ populacao: 289, excluidas: 23, valor: null, soma: 0 }),
    '289 de 312 · 23 sem resposta',
  );
  // Sem exclusão não há sufixo: não se anuncia zero.
  assert.equal(denominador({ populacao: 10, excluidas: 0, valor: null, soma: 0 }), '10 de 10');
  assert.equal(denominador({ populacao: 0, excluidas: 0, valor: null, soma: 0 }), '0 de 0');
  // O rótulo do que foi excluído muda por métrica.
  assert.equal(
    denominador({ populacao: 5, excluidas: 2, valor: null, soma: 0 }, 'sem nota'),
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

test('a semana começa no domingo, como o Postgres conta', () => {
  /* `extract(dow)` do Postgres e `getUTCDay` do core usam 0 = domingo. Se esta
     lista girar, o horário de atendimento de segunda passa a valer no domingo. */
  assert.equal(DIAS_DA_SEMANA[0], 'Domingo');
  assert.equal(DIAS_DA_SEMANA[6], 'Sábado');
  assert.equal(DIAS_DA_SEMANA.length, 7);
});
