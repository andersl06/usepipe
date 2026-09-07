import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Marcos } from '@pipe/core';
import { avaliarSlaDaConversa, type RegraSlaCarregada } from '../src/lib/sla.ts';

/**
 * A pastilha de SLA do monitoramento detalhado.
 *
 * A conta é do `@pipe/core`; o que mora aqui é a escolha da regra aplicável e a
 * tradução para o rótulo da tela. As duas coisas decidem se o supervisor vê
 * "ESTOUROU" e vai atrás da conversa, ou vê "—" e passa direto. Nenhuma delas
 * toca banco: recebem as regras já carregadas.
 */

const T0 = new Date('2026-09-07T12:00:00Z');
const depois = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

const regra = (parcial: Partial<RegraSlaCarregada> = {}): RegraSlaCarregada => ({
  id: 'r',
  nome: 'Padrão',
  alvo: 'primeira_resposta',
  prazoSeg: 300,
  alertaSeg: 240,
  escopoTipo: 'tenant',
  escopoId: null,
  ...parcial,
});

const marcos = (parcial: Partial<Marcos> = {}): Marcos => ({
  conversaId: 'c',
  criadaEm: T0,
  atribuidaEm: T0,
  primeiraRespostaEm: null,
  encerradaEm: null,
  encerradaPor: null,
  atribuicoes: 1,
  ...parcial,
});

test('sem regra ativa a pastilha some, e não vira "DENTRO"', () => {
  /* "DENTRO" sem regra configurada seria mentira: afirma que o prazo está sendo
     cumprido quando não existe prazo. O travessão é o que faz o gestor
     perceber que falta cadastrar a regra. */
  const pill = avaliarSlaDaConversa([], marcos(), 'fila-1', depois(10));
  assert.equal(pill.estado, 'sem_regra');
  assert.equal(pill.rotulo, '—');
});

test('regra da fila vence a regra do tenant', () => {
  /* A específica é a que o gestor configurou de propósito. Se a do tenant
     ganhasse, a fila de urgência herdaria o prazo frouxo do padrão. */
  const regras = [
    regra({ id: 'tenant', prazoSeg: 3600, alertaSeg: null }),
    regra({ id: 'fila', escopoTipo: 'fila', escopoId: 'fila-1', prazoSeg: 60, alertaSeg: null }),
  ];
  // 120s: dentro do prazo do tenant (3600) e fora do prazo da fila (60).
  assert.equal(avaliarSlaDaConversa(regras, marcos(), 'fila-1', depois(120)).estado, 'estourado');
  // Outra fila não é alcançada pela regra específica e cai no padrão do tenant.
  assert.equal(avaliarSlaDaConversa(regras, marcos(), 'fila-2', depois(120)).estado, 'dentro');
});

test('conversa sem fila cai na regra do tenant, não em "sem regra"', () => {
  /* Conversa ainda na raiz tem `filaId` nulo — é justamente a que corre risco
     de ficar esquecida, e é a que mais precisa do relógio. */
  const pill = avaliarSlaDaConversa([regra({ alertaSeg: null })], marcos(), null, depois(400));
  assert.equal(pill.estado, 'estourado');
});

test('alerta, dentro e estourado seguem os limiares configurados', () => {
  const regras = [regra({ prazoSeg: 300, alertaSeg: 240 })];
  const em = (s: number) => avaliarSlaDaConversa(regras, marcos(), null, depois(s)).estado;
  assert.equal(em(10), 'dentro');
  assert.equal(em(239), 'dentro');
  // O limiar é inclusivo: exatamente no alerta já alerta.
  assert.equal(em(240), 'alerta');
  assert.equal(em(299), 'alerta');
  assert.equal(em(300), 'estourado');
});

test('estouro anuncia quantos segundos passaram do prazo', () => {
  /* É o número que ordena a fila do que precisa de atenção primeiro. Sem ele,
     "ESTOUROU" há 10 segundos e há duas horas parecem a mesma coisa. */
  const pill = avaliarSlaDaConversa([regra({ prazoSeg: 300 })], marcos(), null, depois(500));
  assert.equal(pill.estado, 'estourado');
  assert.equal(pill.excedidoSeg, 200);
});

test('sem estouro não há excedido para mostrar', () => {
  const pill = avaliarSlaDaConversa([regra()], marcos(), null, depois(10));
  assert.equal(pill.excedidoSeg, null);
});

test('responder depois do prazo continua sendo estouro', () => {
  /* O relatório de SLA existe para contar o que falhou. Se responder tarde
     apagasse o estouro, bastaria responder atrasado para o indicador ficar
     limpo — e o estouro sumiria exatamente nos casos que importam. */
  const pill = avaliarSlaDaConversa(
    [regra({ prazoSeg: 300 })],
    marcos({ primeiraRespostaEm: depois(500) }),
    null,
    depois(600),
  );
  assert.equal(pill.estado, 'estourado');
});

test('responder dentro do prazo fecha a pastilha em "CUMPRIDO"', () => {
  /* Cumprido é estado final: o relógio para. Sem isso a conversa antiga
     estouraria mais tarde só porque o tempo continuou passando. */
  const pill = avaliarSlaDaConversa(
    [regra({ prazoSeg: 300 })],
    marcos({ primeiraRespostaEm: depois(60) }),
    null,
    depois(9999),
  );
  assert.equal(pill.estado, 'cumprido');
  assert.equal(pill.rotulo, 'CUMPRIDO');
});

test('alvo sem marco de início não vira pastilha', () => {
  /* `tempo_resposta` só começa quando existe mensagem do cliente sem resposta.
     Sem esse marco, contar o tempo desde a criação inventaria estouro. */
  const pill = avaliarSlaDaConversa(
    [regra({ alvo: 'tempo_resposta' })],
    marcos(),
    null,
    depois(9999),
  );
  assert.equal(pill.estado, 'sem_regra');
});
