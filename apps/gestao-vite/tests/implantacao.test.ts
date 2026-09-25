import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarPassos } from '../src/lib/passos-da-implantacao.ts';
import type { DeploymentSignals } from '../src/lib/passos-da-implantacao.ts';

/**
 * Os passos do assistente de implantação, a partir dos sinais do banco. Cada
 * passo está feito quando o que ele pede existe — nunca por clique.
 */

const NADA: DeploymentSignals = {
  adminEntrou: false,
  channelsConectados: 0,
  channelsPendentes: 0,
  convites: 0,
  members: 1,
  queuesActive: 0,
  queuesWithAgent: 0,
  ultimaImport: null,
  conversationAtendida: false,
};

const DESK = 'https://app.teste';

function estados(signals: DeploymentSignals): Record<string, string> {
  return Object.fromEntries(montarPassos(signals, DESK).map((p) => [p.id, p.state]));
}

test('tenant recém-provisionado: seis passos, na ordem do onboarding, todos pendentes', () => {
  const passos = montarPassos(NADA, DESK);
  assert.deepEqual(
    passos.map((p) => p.id),
    ['acesso', 'whatsapp', 'equipe', 'fila', 'contatos', 'conversa'],
  );
  assert.ok(passos.every((p) => p.state === 'pendente'));
});

test('a conversa de teste depende do WhatsApp, e só então oferece o Desk', () => {
  const sem = montarPassos(NADA, DESK).find((p) => p.id === 'conversa')!;
  assert.equal(sem.acao, null);
  assert.match(sem.resumo, /Depende do WhatsApp/);

  const com = montarPassos({ ...NADA, channelsConectados: 1 }, DESK).find((p) => p.id === 'conversa')!;
  assert.deepEqual(com.acao, { rotulo: 'Abrir o Desk', href: DESK, externo: true });
});

test('canal marcado para reautorização é andamento, não feito', () => {
  assert.equal(estados({ ...NADA, channelsPendentes: 1 })['whatsapp'], 'andamento');
});

test('convite sem aceite é andamento; alguém além do administrador é feito', () => {
  assert.equal(estados({ ...NADA, convites: 2 })['equipe'], 'andamento');
  assert.equal(estados({ ...NADA, convites: 2, members: 3 })['equipe'], 'feito');
});

test('fila sem atendente não conta: a conversa chegaria e ninguém a receberia', () => {
  const passo = montarPassos({ ...NADA, queuesActive: 2 }, DESK).find((p) => p.id === 'fila')!;
  assert.equal(passo.state, 'pendente');
  assert.match(passo.resumo, /nenhum atendente/);
  assert.equal(estados({ ...NADA, queuesActive: 2, queuesWithAgent: 1 })['fila'], 'feito');
});

test('importação: em andamento, falha e concluída sem aceito não fecham o passo', () => {
  const import = { id: 'i', aceitos: 0, rejeitados: 0, temFalhas: false };
  assert.equal(estados({ ...NADA, ultimaImport: { ...import, state: 'executando' } })['contatos'], 'andamento');
  assert.equal(estados({ ...NADA, ultimaImport: { ...import, state: 'falhou' } })['contatos'], 'pendente');
  assert.equal(
    estados({ ...NADA, ultimaImport: { ...import, state: 'concluida', rejeitados: 4 } })['contatos'],
    'pendente',
  );
  const feita = montarPassos(
    { ...NADA, ultimaImport: { ...import, state: 'concluida', aceitos: 12, rejeitados: 1 } },
    DESK,
  ).find((p) => p.id === 'contatos')!;
  assert.equal(feita.state, 'feito');
  assert.equal(feita.resumo, '12 contatos importados, 1 linha rejeitada.');
});

test('tudo pronto: seis de seis', () => {
  const tudo = estados({
    adminEntrou: true,
    channelsConectados: 1,
    channelsPendentes: 0,
    convites: 1,
    members: 2,
    queuesActive: 1,
    queuesWithAgent: 1,
    ultimaImport: { id: 'i', state: 'concluida', aceitos: 3, rejeitados: 0, temFalhas: false },
    conversationAtendida: true,
  });
  assert.ok(Object.values(tudo).every((e) => e === 'feito'));
});
