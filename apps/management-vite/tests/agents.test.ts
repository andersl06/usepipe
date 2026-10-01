import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentRegistered } from '../src/lib/registrations.ts';
import {
  permissionsDescription,
  agentsQueues,
  queuesInCard,
  filterAgents,
  editTitle,
  resolveEmails,
} from '../src/lib/agents.ts';

/**
 * The accounts for the "Gestão de atendentes" (Attendant Management) screen, measured in `referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §b.2.
 *
 * What's worth proving: search sweeps both name AND email (the source's placeholder is "Buscar por nome ou e-mail", and searching only the name makes someone type the email that's on screen and find nothing), the queue filter is OR (one checked queue is enough), and the three variants of the permissions page's description.
 */

function pessoa(
  nome: string,
  email: string,
  queues: string[],
  limiteSimultaneo: number | null = 5,
): AgentRegistered {
  return { id: nome, name: nome, email, active: true, state: 'online', queues, queueIds: [], limiteSimultaneo };
}

const LISTA = [
  pessoa('Ana Souza', 'ana.souza@pipe.com.br', ['Default', 'Suporte'], 6),
  pessoa('Bruno Dias', 'bruno.dias@pipe.com.br', ['Suporte'], 5),
  pessoa('Carla Menezes', 'carla.menezes@pipe.com.br', ['Financeiro'], 4),
  pessoa('Diego Faria', 'diego.faria@pipe.com.br', [], null),
];

test('search matches by name and email, case-insensitively', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: 'ANA sou', queues: [] }).map((a) => a.name),
    ['Ana Souza'],
  );
  assert.deepEqual(
    filterAgents(LISTA, { search: 'carla.menezes@pipe', queues: [] }).map((a) => a.name),
    ['Carla Menezes'],
  );
});

test('the queue filter is OR: whoever is in Support shows up even if also in Default', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: '', queues: ['Suporte'] }).map((a) => a.name),
    ['Ana Souza', 'Bruno Dias'],
  );
  assert.deepEqual(
    filterAgents(LISTA, { search: '', queues: ['Suporte', 'Financeiro'] }).map((a) => a.name),
    ['Ana Souza', 'Bruno Dias', 'Carla Menezes'],
  );
});

test('search and filter add up, and no queue checked means all of them', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: 'a', queues: ['Financeiro'] }).map((a) => a.name),
    ['Carla Menezes'],
  );
  assert.equal(filterAgents(LISTA, { search: '   ', queues: [] }).length, 4);
});

test('the filter panel offers the list\'s own queues, without repeats and in order', () => {
  assert.deepEqual(agentsQueues(LISTA), ['Default', 'Financeiro', 'Suporte']);
});

test('the card\'s Queues column is comma-separated without spaces, matching the capture', () => {
  assert.equal(queuesInCard(['Default', 'Suporte']), 'Default,Suporte');
  assert.equal(queuesInCard([]), '—');
});

test('the permissions page\'s description has the three variants from the source', () => {
  assert.equal(permissionsDescription(['Ana Souza']), 'Configure as permissões de Ana Souza');
  assert.equal(
    permissionsDescription(['Ana Souza', 'Bruno Dias']),
    'Configure as permissões de Ana Souza e Bruno Dias',
  );
  assert.equal(
    permissionsDescription(['Ana Souza', 'Bruno Dias', 'Carla Menezes']),
    'Configure as permissões de Ana Souza e outros 2 atendentes',
  );
});

test('the bulk-edit title agrees in number', () => {
  assert.equal(editTitle(1), 'Editar 1 atendente');
  assert.equal(editTitle(3), 'Editar 3 atendentes');
});

test('resolveEmails separa quem tem cadastro de quem não tem, sem repetir', () => {
  const lista = [pessoa('Ana', 'ana@x.com', []), pessoa('Beto', 'beto@x.com', [])];
  const r = resolveEmails(lista, ['ANA@x.com', 'ana@x.com', 'ninguem@x.com']);
  assert.deepEqual(r.ids, ['Ana']);
  assert.deepEqual(r.unknown, ['ninguem@x.com']);
});
