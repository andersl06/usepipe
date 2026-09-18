import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLUSTER_DA_CAPTURA,
  FLAGS_DA_CAPTURA,
  abasDaAnalise,
  mostraGerenciador,
} from '../src/paginas/fluxo/analise/abas.ts';

/**
 * A fileira de abas da Análise (`/fluxo/{id}/analise`).
 *
 * O que trava aqui é o `ng-show` de cada aba, e em especial o `Zn()`: é a
 * única condição que não é uma flag direta — depende do CLUSTER, com recaída
 * em `default` — e é exatamente a que volta errada lendo só o nome das flags
 * (`is-showing-data-extractor-tab` diz "Golden,Doberman" e não decide nada).
 */

const visiveis = (flags = FLAGS_DA_CAPTURA, cluster = CLUSTER_DA_CAPTURA) =>
  abasDaAnalise(flags, cluster)
    .filter((a) => a.visivel)
    .map((a) => a.rotulo);

test('o contrato da captura vê sete abas, na ordem do template', () => {
  assert.deepEqual(visiveis(), [
    'Dashboard',
    'Mensagens ativas',
    'Visão Geral',
    'Relatórios Personalizados',
    'Jornada dos Contatos',
    'Gerenciador de Relatórios',
    'Dicionário de Dados',
  ]);
});

test('o Gerenciador navega na árvore atual do fluxo', () => {
  const aba = abasDaAnalise(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA).find(
    (item) => item.chave === 'dataExtractor',
  );
  assert.equal(aba?.segmento, 'gerenciador-de-relatorios');
});

test('o Gerenciador cai em `default` quando o cluster não tem chave própria', () => {
  const porCluster = FLAGS_DA_CAPTURA.gerenciadorPorCluster;
  assert.equal(mostraGerenciador(porCluster, 'Beagle'), true);
  assert.equal(mostraGerenciador(porCluster, 'Golden'), false);
  assert.equal(mostraGerenciador(porCluster, 'DOBERMANN'), false);
});

test('aba escondida continua na fileira, só que invisível', () => {
  const abas = abasDaAnalise(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA);
  assert.equal(abas.length, 8);
  assert.equal(abas.at(-1)?.chave, 'goodData');
  assert.equal(abas.at(-1)?.visivel, false);
});

test('cada flag desliga só a sua aba', () => {
  const sem = visiveis({
    ...FLAGS_DA_CAPTURA,
    abaMensagensAtivas: false,
    abaVisaoGeral: false,
    dicionarioDeDados: false,
  });
  assert.deepEqual(sem, [
    'Dashboard',
    'Relatórios Personalizados',
    'Jornada dos Contatos',
    'Gerenciador de Relatórios',
  ]);
  assert.ok(visiveis({ ...FLAGS_DA_CAPTURA, goodData: true }).includes('GoodData'));
});
