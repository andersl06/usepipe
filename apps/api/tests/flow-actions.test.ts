import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp, processarOutbox } = await import('@pipe/workers');
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
      {
        type: 'SendCommand',
        settings: { uri: '/tickets/atual/transfer', resource: { queueId: 'fila-vendas' } },
        conditions: [{ source: 'input', comparison: 'equals', values: ['transfer-invalida'] }],
      },
      {
        // 40k characters pass the app's 64 KB character check, but 80 KB of UTF-8 violate the
        // `pg_column_size(valor) <= 65536` CHECK: a real database error inside the action.
        type: 'SetBucket',
        settings: { id: 'grande', type: 'text/plain', document: 'é'.repeat(40_000) },
        conditions: [{ source: 'input', comparison: 'equals', values: ['bucket-grande'] }],
      },
    ],
    outputs: [
      {
        order: 0,
        stateId: 'survey:1',
        conditions: [{ source: 'input', comparison: 'equals', values: ['pesquisa'] }],
      },
      { order: 1, stateId: 'raiz' },
    ],
  }, {
    // The native survey block exactly as the Builder's `newSurveyBlock` exports it.
    id: 'survey:1',
    input: {},
    inputActions: [{
      type: 'SendMessage',
      settings: {
        id: 'survey-1-pergunta',
        type: 'application/vnd.lime.satisfaction-survey+json',
        content: { type: '', scale: '1-5', question: 'De 1 a 5, como você avalia o atendimento?', score: '' },
      },
    }],
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

  /** The flow failed, the inbound message survived, and the conversation overflowed to the default queue. */
  async function esperarFalhaSemPerderAEntrada(texto: string): Promise<void> {
    const { rows: entradas } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and direcao = 'entrada'
    `);
    expect(entradas.map((m) => m.conteudo)).toEqual([texto]);
    const { rows: execucoes } = await cenario.dono.execute<{ estado: string }>(sql`
      select estado from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(execucoes.map((x) => x.estado)).toEqual(['falhou']);
    const { rows: conversas } = await cenario.dono.execute<{ fila_id: string | null }>(sql`
      select fila_id from conversa where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(conversas).toEqual([{ fila_id: cenario.queueId }]);
  }

  it('a DB error inside a platform action fails the action, not the inbound transaction (CR-02)', async () => {
    await falar('bucket-grande');
    await esperarFalhaSemPerderAEntrada('bucket-grande');
  });

  it('SendCommand /transfer with a non-uuid queueId fails the action and keeps the inbound message (CR-02)', async () => {
    await falar('transfer-invalida');
    await esperarFalhaSemPerderAEntrada('transfer-invalida');
  });

  it('the native satisfaction survey block sends its question to the channel and records the reply (CR-03)', async () => {
    await falar('pesquisa');
    const { rows: bot } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and autor_tipo = 'bot'
    `);
    expect(bot.map((m) => m.conteudo)).toEqual(['De 1 a 5, como você avalia o atendimento?\n1 2 3 4 5']);
    await processarOutbox();
    expect(dubleWhatsApp.chamadas.filter((c) => c.para === PHONE).map((c) => c.tipo)).toEqual(['texto']);

    await falar('5 muito bom');
    const { rows: respostas } = await cenario.dono.execute<{ nota: number; comentario: string | null }>(sql`
      select nota, comentario from pesquisa_satisfacao_resposta where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(respostas).toEqual([{ nota: 5, comentario: 'muito bom' }]);
  });
});
