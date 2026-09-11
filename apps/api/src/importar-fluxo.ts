import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { lerFluxoDaBlip, relatorioDaImportacao, validarFluxo } from '@pipe/core';
import { fecharBancos, noTenant } from './banco.js';
import { importarFluxoDaBlip } from './dominio/fluxo.js';

/**
 * Importa um fluxo do Builder da Blip — o export do editor ou o fluxo publicado.
 *
 * Comando, e não rota, pelo mesmo motivo de `provisionar.ts`: ainda não há tela de
 * construtor de fluxo, e a credencial de quem roda isto é o acesso ao banco.
 *
 * ```
 * # só lê e mostra o relatório (contagens por tipo), sem banco:
 * pnpm --filter @pipe/api importar:fluxo --arquivo fluxo.json
 * # grava como versão nova e publica no canal:
 * pnpm --filter @pipe/api importar:fluxo --arquivo fluxo.json \
 *   --tenant <uuid> --canal <uuid> --nome "Atendimento" --publicar
 * ```
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
  const fluxo = lerFluxoDaBlip(json, 'previa');
  let validacao = 'ok';
  try {
    validarFluxo(fluxo);
  } catch (erro) {
    validacao = (erro as Error).message;
  }
  console.log(JSON.stringify({ relatorio: relatorioDaImportacao(fluxo), validacao }, null, 2));
} else {
  const tenantId = values.tenant;
  const resultado = await noTenant(tenantId, (tx) =>
    importarFluxoDaBlip(tx, {
      tenantId,
      nome: values.nome ?? 'Fluxo importado da Blip',
      canalId: values.canal ?? null,
      json,
      publicar: values.publicar ?? false,
    }),
  );
  console.log(JSON.stringify(resultado, null, 2));
  await fecharBancos();
}
