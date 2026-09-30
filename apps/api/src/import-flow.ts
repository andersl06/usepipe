import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { blipReadFlow, blipReadSubflows, importReport, validateFlow } from '@pipe/core';
import { fecharBancos, noTenant } from './database.js';
import { importFlowOfBlip } from './domain/flow.js';

/**
 * Import a Blip Builder editor export or published flow. This is a command rather than a route, as in `provisionar.ts`: there is no flow-builder UI, and database access authenticates the operator. To preview counts without a database, run `pnpm --filter @pipe/api importar:fluxo --arquivo fluxo.json`. To write and publish a new version, add `--tenant <uuid> --canal <uuid> --nome "Atendimento" --publicar`. Blip exports each subflow separately: add `--subfluxo <shortName>=<arquivo.json>` once per subflow the flow's `subflow:` blocks call (P12).
 */

const { values } = parseArgs({
  options: {
    arquivo: { type: 'string' },
    tenant: { type: 'string' },
    canal: { type: 'string' },
    nome: { type: 'string' },
    publicar: { type: 'boolean', default: false },
    subfluxo: { type: 'string', multiple: true },
  },
});

if (!values.arquivo) {
  console.error('Informe --arquivo <caminho do JSON exportado da Blip>.');
  process.exit(2);
}

const json: unknown = JSON.parse(readFileSync(values.arquivo, 'utf8'));

const subflows: Record<string, unknown> = {};
for (const item of values.subfluxo ?? []) {
  const separador = item.indexOf('=');
  if (separador <= 0) {
    console.error(`Use --subfluxo <nome>=<arquivo>; recebi '${item}'.`);
    process.exit(2);
  }
  subflows[item.slice(0, separador)] = JSON.parse(readFileSync(item.slice(separador + 1), 'utf8'));
}

if (!values.tenant) {
  const flow = blipReadFlow(json, 'previa');
  if (Object.keys(subflows).length > 0) flow.subflows = { ...(flow.subflows ?? {}), ...blipReadSubflows(subflows) };
  let validation = 'ok';
  try {
    validateFlow(flow);
  } catch (error) {
    validation = (error as Error).message;
  }
  console.log(JSON.stringify({ relatorio: importReport(flow), validation }, null, 2));
} else {
  const tenantId = values.tenant;
  const resultado = await noTenant(tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId,
      name: values.nome ?? 'Fluxo importado da Blip',
      channelId: values.canal ?? null,
      json,
      publicar: values.publicar ?? false,
      subflows,
    }),
  );
  console.log(JSON.stringify(resultado, null, 2));
  await fecharBancos();
}
