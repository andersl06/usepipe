import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentRegistered } from '../src/lib/cadastros.ts';
import {
  permissionsDescription,
  agentsQueues,
  queuesInCard,
  filterAgents,
  editTitulo,
} from '../src/lib/atendentes.ts';

/**
 * As contas da tela "Gestão de atendentes", medida em
 * `referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §b.2.
 *
 * O que vale provar: a busca varre nome E e-mail (o placeholder da origem é
 * "Buscar por nome ou e-mail", e buscar só no nome faz a pessoa digitar o
 * e-mail que está na tela e não achar nada), o filtro de fila é OU (uma fila
 * marcada basta), e as três variantes de descrição da página de permissões.
 */

function pessoa(
  nome: string,
  email: string,
  queues: string[],
  limiteSimultaneo: number | null = 5,
): AgentRegistered {
  return { id: nome, nome, email, ativo: true, state: 'online', queues, limiteSimultaneo };
}

const LISTA = [
  pessoa('Ana Souza', 'ana.souza@pipe.com.br', ['Default', 'Suporte'], 6),
  pessoa('Bruno Dias', 'bruno.dias@pipe.com.br', ['Suporte'], 5),
  pessoa('Carla Menezes', 'carla.menezes@pipe.com.br', ['Financeiro'], 4),
  pessoa('Diego Faria', 'diego.faria@pipe.com.br', [], null),
];

test('a busca acha pelo nome e pelo e-mail, sem caixa', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: 'ANA sou', queues: [] }).map((a) => a.nome),
    ['Ana Souza'],
  );
  assert.deepEqual(
    filterAgents(LISTA, { search: 'carla.menezes@pipe', queues: [] }).map((a) => a.nome),
    ['Carla Menezes'],
  );
});

test('o filtro de fila é OU: quem está em Suporte aparece mesmo estando também em Default', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: '', queues: ['Suporte'] }).map((a) => a.nome),
    ['Ana Souza', 'Bruno Dias'],
  );
  assert.deepEqual(
    filterAgents(LISTA, { search: '', queues: ['Suporte', 'Financeiro'] }).map((a) => a.nome),
    ['Ana Souza', 'Bruno Dias', 'Carla Menezes'],
  );
});

test('busca e filtro se somam, e nenhuma fila marcada quer dizer todas', () => {
  assert.deepEqual(
    filterAgents(LISTA, { search: 'a', queues: ['Financeiro'] }).map((a) => a.nome),
    ['Carla Menezes'],
  );
  assert.equal(filterAgents(LISTA, { search: '   ', queues: [] }).length, 4);
});

test('o painel de filtro oferece as filas da própria lista, sem repetição e em ordem', () => {
  assert.deepEqual(agentsQueues(LISTA), ['Default', 'Financeiro', 'Suporte']);
});

test('a coluna Filas do cartão é vírgula sem espaço, como na captura', () => {
  assert.equal(queuesInCard(['Default', 'Suporte']), 'Default,Suporte');
  assert.equal(queuesInCard([]), '—');
});

test('a descrição da página de permissões tem as três variantes da origem', () => {
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

test('o título da edição em lote concorda em número', () => {
  assert.equal(editTitulo(1), 'Editar 1 atendente');
  assert.equal(editTitulo(3), 'Editar 3 atendentes');
});
