import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acaoDeAdicionar,
  NIVEIS_DA_EDICAO,
  nivelDaEdicao,
  permissoesDoNivelDaEdicao,
  permissoesDoPapel,
} from '../src/paginas/fluxo/equipe/permissoes.ts';

const RECURSOS = [{ chave: 'builder' }, { chave: 'channels' }, { chave: 'team' }];

test('adicionar oferece somente as quatro paradas da barra da Blip', () => {
  assert.equal(acaoDeAdicionar('visualizar'), 'Salvar');
  assert.equal(acaoDeAdicionar('personalizado'), 'Continuar');
  assert.deepEqual(
    permissoesDoPapel('visualizar', RECURSOS),
    { builder: 'ler', channels: 'ler', team: 'ler' },
  );
  assert.deepEqual(
    permissoesDoPapel('editar', RECURSOS),
    { builder: 'escrever', channels: 'escrever', team: 'escrever' },
  );
});

test('editar tem os cinco estados literais e deriva o seletor da matriz', () => {
  assert.deepEqual(
    NIVEIS_DA_EDICAO.map((opcao) => opcao.rotulo),
    ['Sem permissão', 'Customizado', 'Visualizar', 'Ver e editar', 'Admin'],
  );
  assert.equal(
    nivelDaEdicao('personalizado', RECURSOS, {
      builder: 'nenhum',
      channels: 'nenhum',
      team: 'nenhum',
    }),
    'nenhum',
  );
  assert.equal(
    nivelDaEdicao('personalizado', RECURSOS, {
      builder: 'escrever',
      channels: 'ler',
      team: 'nenhum',
    }),
    'personalizado',
  );
  assert.equal(nivelDaEdicao('admin', RECURSOS, {}), 'admin');
});

test('o seletor marca as linhas; só Customizado preserva a escolha granular', () => {
  const misto = { builder: 'escrever', channels: 'ler', team: 'nenhum' } as const;
  assert.deepEqual(permissoesDoNivelDaEdicao('personalizado', RECURSOS, misto), misto);
  assert.deepEqual(permissoesDoNivelDaEdicao('nenhum', RECURSOS, misto), {
    builder: 'nenhum',
    channels: 'nenhum',
    team: 'nenhum',
  });
  assert.deepEqual(permissoesDoNivelDaEdicao('admin', RECURSOS, misto), {
    builder: 'escrever',
    channels: 'escrever',
    team: 'escrever',
  });
});
