import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { blipReadFlow, importReport, validateFlow } from '@pipe/core';
import { fecharBancos, noTenant } from './database.js';
import { importFlowOfBlip } from './domain/flow.js';

/**
 * Import a Blip Builder editor export or published flow. This is a command rather than a route, as in `provisionar.ts`: there is no flow-builder UI, and database access authenticates the operator. To preview counts without a database, run `pnpm --filter @pipe/api importar:fluxo --arquivo fluxo.json`. To write and publish a new version, add `--tenant <uuid> --canal <uuid> --nome "Atendimento" --publicar`.
 */

const { values } = parseArgs({
  options: {
    arquivo: { type: 'string' },
    tenant: { type: 'string' },
    canal: { type: 'string' },
    nome: { type: 'string' },
    publicar: { type: 'boolean', default: false },
  },
});

if (!values.arquivo) {
  console.error('Informe --arquivo <caminho do JSON exportado da Blip>.');
  process.exit(2);
}

const json: unknown = JSON.parse(readFileSync(values.arquivo, 'utf8'));

if (!values.tenant) {
  const flow = blipReadFlow(json, 'previa');
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
    }),
  );
  console.log(JSON.stringify(resultado, null, 2));
  await fecharBancos();
}
