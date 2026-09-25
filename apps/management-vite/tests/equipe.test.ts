import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acaoDeAdicionar,
  NIVEIS_OF_EDIT,
  editNivel,
  permissionsOfNivelOfEdit,
  rolePermissions,
} from '../src/pages/flow/team/permissions.ts';

const RECURSOS = [{ chave: 'builder' }, { chave: 'channels' }, { chave: 'team' }];

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
    NIVEIS_OF_EDIT.map((option) => option.rotulo),
    ['Sem permissão', 'Customizado', 'Visualizar', 'Ver e editar', 'Admin'],
  );
  assert.equal(
    editNivel('personalizado', RECURSOS, {
      builder: 'nenhum',
      channels: 'nenhum',
      team: 'nenhum',
    }),
    'nenhum',
  );
  assert.equal(
    editNivel('personalizado', RECURSOS, {
      builder: 'escrever',
      channels: 'ler',
      team: 'nenhum',
    }),
    'personalizado',
  );
  assert.equal(editNivel('admin', RECURSOS, {}), 'admin');
});

test('o seletor marca as linhas; só Customizado preserva a escolha granular', () => {
  const misto = { builder: 'escrever', channels: 'ler', team: 'nenhum' } as const;
  assert.deepEqual(permissionsOfNivelOfEdit('personalizado', RECURSOS, misto), misto);
  assert.deepEqual(permissionsOfNivelOfEdit('nenhum', RECURSOS, misto), {
    builder: 'nenhum',
    channels: 'nenhum',
    team: 'nenhum',
  });
  assert.deepEqual(permissionsOfNivelOfEdit('admin', RECURSOS, misto), {
    builder: 'escrever',
    channels: 'escrever',
    team: 'escrever',
  });
});
