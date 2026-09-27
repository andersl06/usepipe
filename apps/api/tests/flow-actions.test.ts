import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

const PHONE = '5511933330001';

const FLOW = {
  id: 'flow-actions',
  states: [{
    id: 'raiz',
    root: true,
    input: {},
    outputActions: [
      {
        type: 'SendMessageFromHttp',
        settings: { uri: 'http://127.0.0.1/private', type: 'text/plain' },
        conditions: [{ source: 'input', comparison: 'equals', values: ['insecure'] }],
      },
      {
        type: 'MergeContact',
        settings: { name: 'Ana atualizada', contact_id: 'contact-from-another-tenant' },
        conditions: [{ source: 'input', comparison: 'equals', values: ['merge'] }],
      },
    ],
    outputs: [{ order: 0, stateId: 'raiz' }],
  }],
};

let cenario: Awaited<ReturnType<typeof montarCenario>>;
let api: Awaited<ReturnType<typeof upApi>>;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

beforeEach(async () => {
  cenario = await montarCenario(`flow-actions-${randomUUID().slice(0, 8)}`);
  dubleWhatsApp.reiniciar();
  const resultado = await noTenant(cenario.tenantId, (tx) => importFlowOfBlip(tx, {
    tenantId: cenario.tenantId,
    name: 'Ações de contexto',
    channelId: cenario.channelId,
    json: FLOW,
    publicar: true,
  }));
  expect(resultado.errorOfValidation).toBeNull();
}, 180_000);

afterEach(async () => {
  await cenario?.encerrar();
});

afterAll(async () => {
  await api?.fechar();
});

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(PHONE, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

describe('context action services', () => {
  it('rejects an insecure URL and does not send a partial response', async () => {
    await falar('insecure');
    expect(dubleWhatsApp.chamadas).toHaveLength(0);
    const { rows } = await cenario.dono.execute<{ estado: string }>(sql`
      select estado from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
       order by iniciada_em desc limit 1
    `);
    expect(rows[0]?.estado).toBe('falhou');
  });

  it('rejects contact write across tenants', async () => {
    await falar('merge');
    const { rows: before } = await cenario.dono.execute<{ id: string; nome: string | null }>(sql`
      select id, nome from contato where tenant_id = ${cenario.tenantId}::uuid
       and telefone_e164 = ${`+${PHONE}`} limit 1
    `);
    expect(before[0]).toBeDefined();
    expect(before[0]?.nome).toBe('Ana atualizada');
    const { rows: after } = await cenario.dono.execute<{ id: string; nome: string | null }>(sql`
      select id, nome from contato where tenant_id = ${cenario.tenantId}::uuid
       and telefone_e164 = ${`+${PHONE}`} limit 1
    `);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[0]?.nome).toBe('Ana atualizada');
  });
});
