import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decorrido,
  dia,
  diaEHora,
  duracaoCurta,
  duracaoRelogio,
  hora,
} from '../src/servidor/formato.ts';

/**
 * A formatação de tempo do Desk.
 *
 * Tudo é formatado no servidor e desce como texto pronto — é o que evita o
 * cliente renderizar uma hora diferente da que o servidor mandou. Como o texto
 * já vem decidido, um erro aqui é invisível: a tela mostra uma hora coerente e
 * errada, e o atendente responde achando que a janela de 24h ainda está aberta.
 */

test('a hora sai no fuso de São Paulo, não no do servidor', () => {
  /* O contêiner roda em UTC. Sem o fuso fixo, a lista de conversas mostraria a
     mensagem das 23h de ontem como se fosse das 2h de hoje. */
  const instante = new Date('2026-09-07T02:00:00Z');
  assert.equal(hora(instante), '23:00');
  assert.equal(dia(instante), '06/09');
  assert.equal(diaEHora(instante), '06/09 23:00');
});

test('o decorrido conta minutos cheios em hh:mm', () => {
  const t = (min: number) => decorrido(new Date(0), new Date(min * 60_000));
  assert.equal(t(0), '00:00');
  assert.equal(t(5), '00:05');
  assert.equal(t(59), '00:59');
  assert.equal(t(60), '01:00');
  assert.equal(t(125), '02:05');
  // Mais de um dia continua contando em horas: não há campo de dia na coluna.
  assert.equal(t(1500), '25:00');
});

test('o decorrido não volta no tempo', () => {
  /* Relógio do banco e relógio do servidor discordam por alguns milissegundos.
     Sem o piso em zero, a conversa recém-aberta piscaria "-1:-1" na lista. */
  assert.equal(decorrido(new Date(60_000), new Date(0)), '00:00');
});

test('o decorrido despreza o segundo, não arredonda para cima', () => {
  /* 59 segundos ainda é "há menos de um minuto". Arredondando, toda conversa
     nasceria com um minuto de espera na tela. */
  assert.equal(decorrido(new Date(0), new Date(59_000)), '00:00');
  assert.equal(decorrido(new Date(0), new Date(60_999)), '00:01');
});

test('a janela restante troca de formato ao passar da hora', () => {
  /* É o aviso da janela de 24h do WhatsApp: abaixo de uma hora o atendente
     precisa ver o minuto, acima dela a hora basta. */
  assert.equal(duracaoCurta(0), '0min');
  assert.equal(duracaoCurta(59), '0min');
  assert.equal(duracaoCurta(60), '1min');
  assert.equal(duracaoCurta(38 * 60), '38min');
  assert.equal(duracaoCurta(3599), '59min');
  assert.equal(duracaoCurta(3600), '1h00');
  assert.equal(duracaoCurta(21 * 3600 + 48 * 60), '21h48');
});

test('janela vencida mostra zero, e não tempo negativo', () => {
  /* A janela expira entre o cálculo e a renderização. "-3min restantes" é pior
     do que "0min": o atendente lê como se ainda desse tempo. */
  assert.equal(duracaoCurta(-500), '0min');
});

test('a duração de relógio alinha dígito com dígito, e o dia só aparece quando existe', () => {
  assert.equal(duracaoRelogio(0), '00:00:00');
  assert.equal(duracaoRelogio(9), '00:00:09');
  assert.equal(duracaoRelogio(3661), '01:01:01');
  // Passando de um dia a régua muda: o segundo deixa de importar e o dia entra.
  assert.equal(duracaoRelogio(90000), '1d 01:00');
});

test('sem medida, a duração é um traço — e não zero', () => {
  // Zero segundos de espera e ausência de espera medida são coisas diferentes.
  // Confundir as duas faz um atendente comemorar uma média que não existe.
  assert.equal(duracaoRelogio(null), '—');
});

test('duração negativa não vira relógio ao contrário', () => {
  // Relógio de servidor atrasado, ou encerramento gravado antes da abertura.
  assert.equal(duracaoRelogio(-5), '00:00:00');
});
