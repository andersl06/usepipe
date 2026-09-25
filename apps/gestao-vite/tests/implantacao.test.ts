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

test('a freshly provisioned tenant: six steps, in onboarding order, all pending', () => {
  const passos = montarPassos(NADA, DESK);
  assert.deepEqual(
    passos.map((p) => p.id),
    ['acesso', 'whatsapp', 'equipe', 'fila', 'contatos', 'conversa'],
  );
  assert.ok(passos.every((p) => p.state === 'pending'));
});

test('the test conversation depends on WhatsApp, and only then offers the Desk', () => {
  const sem = montarPassos(NADA, DESK).find((p) => p.id === 'conversation')!;
  assert.equal(sem.acao, null);
  assert.match(sem.resumo, /Depende do WhatsApp/);

  const com = montarPassos({ ...NADA, channelsConectados: 1 }, DESK).find((p) => p.id === 'conversation')!;
  assert.deepEqual(com.acao, { rotulo: 'Abrir o Desk', href: DESK, externo: true });
});

test('a channel flagged for reauthorization is in progress, not done', () => {
  assert.equal(estados({ ...NADA, channelsPendentes: 1 })['whatsapp'], 'progress');
});

test('an invitation without acceptance is in progress; someone beyond the admin is done', () => {
  assert.equal(estados({ ...NADA, convites: 2 })['equipe'], 'progress');
  assert.equal(estados({ ...NADA, convites: 2, members: 3 })['equipe'], 'done');
});

test('a queue with no agent does not count: the conversation would arrive and no one would receive it', () => {
  const passo = montarPassos({ ...NADA, queuesActive: 2 }, DESK).find((p) => p.id === 'queue')!;
  assert.equal(passo.state, 'pending');
  assert.match(passo.resumo, /nenhum atendente/);
  assert.equal(estados({ ...NADA, queuesActive: 2, queuesWithAgent: 1 })['fila'], 'done');
});

test('import: in progress, failed and completed-without-accepted do not close the step', () => {
  const import = { id: 'i', aceitos: 0, rejeitados: 0, temFalhas: false };
  assert.equal(estados({ ...NADA, ultimaImport: { ...import, state: 'executando' } })['contatos'], 'progress');
  assert.equal(estados({ ...NADA, ultimaImport: { ...import, state: 'falhou' } })['contatos'], 'pending');
  assert.equal(
    estados({ ...NADA, ultimaImport: { ...import, state: 'concluida', rejeitados: 4 } })['contatos'],
    'pending',
  );
  const feita = montarPassos(
    { ...NADA, ultimaImport: { ...import, state: 'concluida', aceitos: 12, rejeitados: 1 } },
    DESK,
  ).find((p) => p.id === 'contacts')!;
  assert.equal(feita.state, 'done');
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
