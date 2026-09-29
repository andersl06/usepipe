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
        // A script calling a tenant library function, as "Inserir função da biblioteca" writes it.
        type: 'ExecuteScriptV2',
        settings: {
          source: 'function run() {\n  return formatarCpf(\'123.456.789-00\');\n}\n',
          inputVariables: [],
          outputVariable: 'cpfLimpo',
        },
        conditions: [{ source: 'input', comparison: 'equals', values: ['biblioteca'] }],
      },
      {
        type: 'SendMessage',
        settings: { type: 'text/plain', content: 'CPF: {{cpfLimpo}}' },
        conditions: [{ source: 'input', comparison: 'equals', values: ['biblioteca'] }],
      },
      {
        // 40k characters pass the app's 64 KB character check, but 80 KB of UTF-8 violate the
        // `pg_column_size(valor) <= 65536` CHECK: a real database error inside the action.
        type: 'SetBucket',
        settings: { id: 'grande', type: 'text/plain', document: 'é'.repeat(40_000) },
        conditions: [{ source: 'input', comparison: 'equals', values: ['bucket-grande'] }],
      },
      {
        type: 'SetBucket',
        settings: { id: 'saudacao', type: 'text/plain', document: 'olá' },
        conditions: [{ source: 'input', comparison: 'equals', values: ['provedores'] }],
      },
      {
        type: 'SendMessage',
        settings: {
          type: 'text/plain',
          content: '{{application.identity}}|{{tunnel.identity}}|{{bucket.saudacao}}|{{calendar.year}}|{{random.guid}}',
        },
        conditions: [{ source: 'input', comparison: 'equals', values: ['provedores'] }],
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

  it('a script can call a function from the flow library (CR-07)', async () => {
    await cenario.dono.execute(sql`
      insert into funcao_do_fluxo (tenant_id, nome, parametros, codigo)
      values (${cenario.tenantId}, 'formatarCpf', '["cpf"]'::jsonb,
        'function soDigitos(t) { return String(t).replace(/\\D/g, ""); } function formatarCpf(cpf) { return soDigitos(cpf); }')
    `);
    await falar('biblioteca');
    const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and autor_tipo = 'bot'
    `);
    expect(rows.map((m) => m.conteudo)).toEqual(['CPF: 12345678900']);
  });

  it('fills application, bucket, calendar and random; tunnel stays empty without a router', async () => {
    await falar('provedores');
    const { rows: fluxos } = await cenario.dono.execute<{ short_name: string }>(sql`
      select short_name from fluxo where tenant_id = ${cenario.tenantId}::uuid
    `);
    const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
      select conteudo from mensagem where tenant_id = ${cenario.tenantId}::uuid and autor_tipo = 'bot'
    `);
    expect(rows).toHaveLength(1);
    const [identity, tunnel, bucket, year, guid] = rows[0]!.conteudo.split('|');
    expect(identity).toBe(`${fluxos[0]!.short_name}@msging.net`);
    expect(tunnel).toBe('');
    expect(bucket).toBe('olá');
    expect(year).toBe(String(new Date().getUTCFullYear()));
    expect(guid).toMatch(/^[0-9a-f-]{36}$/);
  });

  /** Publish a one-block flow whose root runs a single SendCommand. */
  async function publicarComando(uri: string, resource: unknown): Promise<void> {
    const r = await noTenant(cenario.tenantId, (tx) => importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Ações de contexto',
      channelId: cenario.channelId,
      json: {
        id: 'comando',
        states: [{
          id: 'raiz', root: true, input: {},
          outputActions: [{ type: 'SendCommand', settings: { uri, resource } }],
          outputs: [],
        }],
      },
      publicar: true,
    }));
    expect(r.errorOfValidation).toBeNull();
  }

  async function conversaAtual(): Promise<{ id: string; fila_id: string | null; estado: string; encerrada_em: Date | null }> {
    const { rows } = await cenario.dono.execute<{ id: string; fila_id: string | null; estado: string; encerrada_em: Date | null }>(sql`
      select id, fila_id, estado, encerrada_em from conversa where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  async function eventosDa(conversaId: string): Promise<string[]> {
    const { rows } = await cenario.dono.execute<{ tipo: string }>(sql`
      select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by em, tipo
    `);
    return rows.map((r) => r.tipo);
  }

  it('SendCommand /transfer refuses a queue of another tenant (WR-01)', async () => {
    const outro = await montarCenario(`flow-actions-outro-${randomUUID().slice(0, 8)}`);
    try {
      await publicarComando('/tickets/atual/transfer', { queueId: outro.queueId });
      await falar('oi');
      const conversa = await conversaAtual();
      // The action failed (the flow overflows to the tenant's own default queue), never the foreign queue.
      expect(conversa.fila_id).toBe(cenario.queueId);
      const { rows } = await cenario.dono.execute<{ estado: string }>(sql`
        select estado from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
      `);
      expect(rows.map((x) => x.estado)).toEqual(['falhou']);
    } finally {
      await outro.encerrar();
    }
  });

  it('SendCommand /transfer goes through the bot attendance handoff: events, queue and distribution (WR-01)', async () => {
    const { rows: fila } = await cenario.dono.execute<{ id: string }>(sql`
      insert into fila (tenant_id, nome) values (${cenario.tenantId}, 'Vendas') returning id
    `);
    await publicarComando('/tickets/atual/transfer', { queueId: fila[0]!.id });
    await falar('oi');
    const conversa = await conversaAtual();
    expect(conversa.fila_id).toBe(fila[0]!.id);
    expect(conversa.estado).toBe('na_fila');
    expect(await eventosDa(conversa.id)).toEqual(expect.arrayContaining(['criada', 'enfileirada']));
  });

  it('SendCommand /status encerrada closes through the domain closure: encerrada_em and event (WR-01)', async () => {
    await publicarComando('/tickets/atual/status', { status: 'encerrada' });
    await falar('oi');
    const conversa = await conversaAtual();
    expect(conversa.estado).toBe('encerrada');
    expect(conversa.encerrada_em).not.toBeNull();
    expect(await eventosDa(conversa.id)).toContain('encerrada');
  });

  it('SendCommand /status refuses a state that requires an agent (WR-01)', async () => {
    await publicarComando('/tickets/atual/status', { status: 'em_atendimento' });
    await falar('oi');
    const conversa = await conversaAtual();
    expect(conversa.estado).not.toBe('em_atendimento');
    expect(conversa.fila_id).toBe(cenario.queueId);
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
