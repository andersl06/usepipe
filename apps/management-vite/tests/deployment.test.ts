import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarPassos } from '../src/lib/passos-of-deployment.ts';
import type { DeploymentSignals } from '../src/lib/passos-of-deployment.ts';

/**
 * The deployment wizard's steps, derived from the database signals. Each step is done when what it requires exists — never by a click.
 */

const NADA: DeploymentSignals = {
  adminEntrou: false,
  channelsConnected: 0,
  channelsPending: 0,
  convites: 0,
  members: 1,
  queuesActive: 0,
  queuesWithAgent: 0,
  lastImport: null,
  conversationHandled: false,
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
  assert.ok(passos.every((p) => p.state === 'pendente'));
});

test('the test conversation depends on WhatsApp, and only then offers the Desk', () => {
  const sem = montarPassos(NADA, DESK).find((p) => p.id === 'conversa')!;
  assert.equal(sem.acao, null);
  assert.match(sem.resumo, /Depende do WhatsApp/);

  const com = montarPassos({ ...NADA, channelsConnected: 1 }, DESK).find((p) => p.id === 'conversa')!;
  assert.deepEqual(com.acao, { rotulo: 'Abrir o Desk', href: DESK, externo: true });
});

test('a channel flagged for reauthorization is in progress, not done', () => {
  assert.equal(estados({ ...NADA, channelsPending: 1 })['whatsapp'], 'andamento');
});

test('an invitation without acceptance is in progress; someone beyond the admin is done', () => {
  assert.equal(estados({ ...NADA, convites: 2 })['equipe'], 'andamento');
  assert.equal(estados({ ...NADA, convites: 2, members: 3 })['equipe'], 'feito');
});

test('a queue with no agent does not count: the conversation would arrive and no one would receive it', () => {
  const passo = montarPassos({ ...NADA, queuesActive: 2 }, DESK).find((p) => p.id === 'fila')!;
  assert.equal(passo.state, 'pendente');
  assert.match(passo.resumo, /nenhum atendente/);
  assert.equal(estados({ ...NADA, queuesActive: 2, queuesWithAgent: 1 })['fila'], 'feito');
});

test('import: in progress, failed and completed-without-accepted do not close the step', () => {
  const importBase = { id: 'i', accepted: 0, rejeitados: 0, temFalhas: false };
  assert.equal(estados({ ...NADA, lastImport: { ...importBase, state: 'executando' } })['contatos'], 'andamento');
  assert.equal(estados({ ...NADA, lastImport: { ...importBase, state: 'falhou' } })['contatos'], 'pendente');
  assert.equal(
    estados({ ...NADA, lastImport: { ...importBase, state: 'concluida', rejeitados: 4 } })['contatos'],
    'pendente',
  );
  const feita = montarPassos(
    { ...NADA, lastImport: { ...importBase, state: 'concluida', accepted: 12, rejeitados: 1 } },
    DESK,
  ).find((p) => p.id === 'contatos')!;
  assert.equal(feita.state, 'feito');
  assert.equal(feita.resumo, '12 contatos importados, 1 linha rejeitada.');
});

test('tudo pronto: seis de seis', () => {
  const tudo = estados({
    adminEntrou: true,
    channelsConnected: 1,
    channelsPending: 0,
    convites: 1,
    members: 2,
    queuesActive: 1,
    queuesWithAgent: 1,
    lastImport: { id: 'i', state: 'concluida', accepted: 3, rejeitados: 0, temFalhas: false },
    conversationHandled: true,
  });
  assert.ok(Object.values(tudo).every((e) => e === 'feito'));
});
