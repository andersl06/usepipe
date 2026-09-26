import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLUSTER_DA_CAPTURA,
  FLAGS_DA_CAPTURA,
  analyticsTabs,
  showsManager,
} from '../src/pages/flow/analytics/abas.ts';

/**
 * The Analysis tab row (`/fluxo/{id}/analise`).
 *
 * What gates this is each tab's `ng-show`, and especially `Zn()`: it's the only condition that isn't a direct flag — it depends on the CLUSTER, falling back to `default` — and it's exactly the one that comes back wrong if you only read the flag names (`is-showing-data-extractor-tab` says "Golden,Doberman" and decides nothing).
 */

const visiveis = (flags = FLAGS_DA_CAPTURA, cluster = CLUSTER_DA_CAPTURA) =>
  analyticsTabs(flags, cluster)
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
  const aba = analyticsTabs(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA).find(
    (item) => item.key === 'dataExtractor',
  );
  assert.equal(aba?.segment, 'report-manager');
});

test('the Manager falls back to `default` when the cluster has no key of its own', () => {
  const byCluster = FLAGS_DA_CAPTURA.managerByCluster;
  assert.equal(showsManager(byCluster, 'Beagle'), true);
  assert.equal(showsManager(byCluster, 'Golden'), false);
  assert.equal(showsManager(byCluster, 'DOBERMANN'), false);
});

test('a hidden tab stays in the row, just invisible', () => {
  const abas = analyticsTabs(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA);
  assert.equal(abas.length, 8);
  assert.equal(abas.at(-1)?.key, 'goodData');
  assert.equal(abas.at(-1)?.visivel, false);
});

test('cada flag desliga só a sua aba', () => {
  const sem = visiveis({
    ...FLAGS_DA_CAPTURA,
    tabActiveMessages: false,
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
