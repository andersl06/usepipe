import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLUSTER_DA_CAPTURA,
  FLAGS_DA_CAPTURA,
  analyticsAbas,
  mostraManager,
} from '../src/pages/flow/analytics/abas.ts';

/**
 * A fileira de abas da Análise (`/fluxo/{id}/analise`).
 *
 * O que trava aqui é o `ng-show` de cada aba, e em especial o `Zn()`: é a
 * única condição que não é uma flag direta — depende do CLUSTER, com recaída
 * em `default` — e é exatamente a que volta errada lendo só o nome das flags
 * (`is-showing-data-extractor-tab` diz "Golden,Doberman" e não decide nada).
 */

const visiveis = (flags = FLAGS_DA_CAPTURA, cluster = CLUSTER_DA_CAPTURA) =>
  analyticsAbas(flags, cluster)
    .filter((a) => a.visivel)
    .map((a) => a.rotulo);

test('the capture\'s contract sees seven tabs, in the template\'s order', () => {
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

test('the Manager navigates the flow\'s current tree', () => {
  const aba = analyticsAbas(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA).find(
    (item) => item.key === 'dataExtractor',
  );
  assert.equal(aba?.segment, 'gerenciador-de-relatorios');
});

test('the Manager falls back to `default` when the cluster has no key of its own', () => {
  const byCluster = FLAGS_DA_CAPTURA.managerByCluster;
  assert.equal(mostraManager(byCluster, 'Beagle'), true);
  assert.equal(mostraManager(byCluster, 'Golden'), false);
  assert.equal(mostraManager(byCluster, 'DOBERMANN'), false);
});

test('a hidden tab stays in the row, just invisible', () => {
  const abas = analyticsAbas(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA);
  assert.equal(abas.length, 8);
  assert.equal(abas.at(-1)?.key, 'goodData');
  assert.equal(abas.at(-1)?.visivel, false);
});

test('cada flag desliga só a sua aba', () => {
  const sem = visiveis({
    ...FLAGS_DA_CAPTURA,
    abaActiveMessages: false,
    abaVisaoGeral: false,
    dataDictionary: false,
  });
  assert.deepEqual(sem, [
    'Dashboard',
    'Relatórios Personalizados',
    'Jornada dos Contatos',
    'Gerenciador de Relatórios',
  ]);
  assert.ok(visiveis({ ...FLAGS_DA_CAPTURA, goodData: true }).includes('GoodData'));
});
