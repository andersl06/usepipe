import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acaoDeAdicionar,
  LEVELS_OF_EDIT,
  editLevel,
  permissionsOfLevelOfEdit,
  rolePermissions,
} from '../src/pages/flow/team/permissions.ts';

import { membersOfTeam } from '../src/pages/flow/itens.ts';

test('membersOfTeam maps API rows to card members and drops nameless rows', () => {
  const rows = [
    { userId: 'a', nome: 'Ana', email: 'ana@x.com' },
    { userId: 'b', nome: '  ', email: 'b@x.com' },
    { userId: 'c', nome: 'Caio', email: 'caio@x.com', fotoUrl: 'https://x/c.png' },
  ];
  assert.deepEqual(membersOfTeam(rows), [
    { nome: 'Ana', fotoUrl: null },
    { nome: 'Caio', fotoUrl: 'https://x/c.png' },
  ]);
  assert.deepEqual(membersOfTeam([]), []);
});

const RECURSOS =[{ key: 'builder' }, { key: 'channels' }, { key: 'team' }];

test('adicionar oferece somente as quatro paradas da barra da Blip', () => {
  assert.equal(acaoDeAdicionar('visualizar'), 'Salvar');
  assert.equal(acaoDeAdicionar('personalizado'), 'Continuar');
  assert.deepEqual(
    rolePermissions('visualizar', RECURSOS),
    { builder: 'ler', channels: 'ler', team: 'ler' },
  );
  assert.deepEqual(
    rolePermissions('editar', RECURSOS),
    { builder: 'escrever', channels: 'escrever', team: 'escrever' },
  );
});

test('edit has the five literal states and derives the selector from the matrix', () => {
  assert.deepEqual(
    LEVELS_OF_EDIT.map((option) => option.rotulo),
    ['Sem permissão', 'Customizado', 'Visualizar', 'Ver e editar', 'Admin'],
  );
  assert.equal(
    editLevel('personalizado', RECURSOS, {
      builder: 'nenhum',
      channels: 'nenhum',
      team: 'nenhum',
    }),
    'nenhum',
  );
  assert.equal(
    editLevel('personalizado', RECURSOS, {
      builder: 'escrever',
      channels: 'ler',
      team: 'nenhum',
    }),
    'personalizado',
  );
  assert.equal(editLevel('admin', RECURSOS, {}), 'admin');
});

test('o seletor marca as linhas; só Customizado preserva a escolha granular', () => {
  const misto = { builder: 'escrever', channels: 'ler', team: 'nenhum' } as const;
  assert.deepEqual(permissionsOfLevelOfEdit('personalizado', RECURSOS, misto), misto);
  assert.deepEqual(permissionsOfLevelOfEdit('nenhum', RECURSOS, misto), {
    builder: 'nenhum',
    channels: 'nenhum',
    team: 'nenhum',
  });
  assert.deepEqual(permissionsOfLevelOfEdit('admin', RECURSOS, misto), {
    builder: 'escrever',
    channels: 'escrever',
    team: 'escrever',
  });
});
