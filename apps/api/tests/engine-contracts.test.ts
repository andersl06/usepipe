import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip, summaryOfContext, toChannelOutput } = await import('../src/domain/flow.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');
const { EXPIRATIONS_KEY } = await import('@pipe/core');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Blip runtime contracts that need the API: `SendRawMessage` of any channel MIME (the export's
 * only raw card builds type and content from a variable), `SetVariable.expiration` persisted in
 * `execucao_fluxo.contexto`, and the full `{{ticket.*}}` document after `ForwardToDesk`.
 */

const CLIENTE = '5511922220039';

const FLOW: unknown = {
  id: 'engine-contracts',
  states: [
    {
      id: 'raiz',
      root: true,
      input: {},
      outputs: [
        { order: 0, stateId: 'envia-raw', conditions: [{ source: 'input', comparison: 'equals', values: ['raw'] }] },
        { order: 1, stateId: 'expira', conditions: [{ source: 'input', comparison: 'equals', values: ['expira'] }] },
        { order: 2, stateId: 'transbordo', conditions: [{ source: 'input', comparison: 'equals', values: ['ticket'] }] },
        { order: 3, stateId: 'raiz' },
      ],
    },
    {
      id: 'envia-raw',
      inputActions: [
        {
          type: 'SetVariable',
          settings: {
            variable: 'messageComponent',
            value: JSON.stringify({
              type: 'application/vnd.lime.web-link+json',
              content: { uri: 'https://exemplo.com/segunda-via', text: 'Segunda via' },
            }),
          },
        },
        {
          type: 'SendRawMessage',
          settings: {
            metadata: { '#stateName': '{{state.name}}', '#stateId': '{{state.id}}' },
            type: '{{messageComponent@type}}',
            rawContent: '{{messageComponent@content}}',
          },
        },
      ],
      outputs: [{ order: 0, stateId: 'raiz' }],
    },
    {
      id: 'expira',
      inputActions: [{ type: 'SetVariable', settings: { variable: 'codigo', value: '123', expiration: 300 } }],
      outputs: [{ order: 0, stateId: 'raiz' }],
    },
    {
      id: 'transbordo',
      inputActions: [
        { type: 'ForwardToDesk', settings: {} },
        {
          type: 'SendMessage',
          settings: {
            type: 'text/plain',
            content: '{{ticket.status}}|{{ticket.team}}|{{ticket.sequentialId}}|{{ticket.customerIdentity}}|{{ticket.closed}}',
          },
        },
      ],
      outputs: [{ order: 0, stateId: 'raiz' }],
    },
  ],
};

let cenario: Cenario;
let api: ApiNoAr;

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(CLIENTE, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function conversa(): Promise<{ id: string; contatoId: string }> {
  const { rows } = await cenario.dono.execute<{ id: string; contatoId: string }>(sql`
    select c.id, c.contato_id as "contatoId" from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
       and c.estado <> 'encerrada'
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function ultimaMensagemDoBot(conversationId: string): Promise<{ tipo: string; conteudo: string | null; dados: unknown }> {
  const { rows } = await cenario.dono.execute<{ tipo: string; conteudo: string | null; dados: unknown }>(sql`
    select tipo, conteudo, dados from mensagem
     where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot'
     order by criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

beforeAll(async () => {
  cenario = await montarCenario(`engine-contracts-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Contratos do motor',
      channelId: cenario.channelId,
      json: FLOW,
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('SendRawMessage with any channel MIME', () => {
  it('delivers a web link whose type and content come from a variable, as in the Blip export', async () => {
    await falar('raw');
    const linha = await ultimaMensagemDoBot((await conversa()).id);
    expect(linha.tipo).toBe('texto');
    expect(linha.conteudo).toBe('Segunda via\nhttps://exemplo.com/segunda-via');
    expect(linha.dados).toEqual({ webLink: { uri: 'https://exemplo.com/segunda-via' } });
  });

  it('parses raw location text before building the channel output', () => {
    expect(
      toChannelOutput({ tipo: 'application/vnd.lime.location+json', conteudo: '{"latitude":-23.5,"longitude":-46.6}', bruto: true }),
    ).toMatchObject({ tipo: 'localizacao', dados: { localizacao: { latitude: -23.5, longitude: -46.6 } } });
  });
});

describe('SetVariable.expiration', () => {
  it('is saved with the execution context and never shown to the agent', async () => {
    await falar('expira');
    const { rows } = await cenario.dono.execute<{ contexto: Record<string, string> }>(sql`
      select contexto from execucao_fluxo where conversa_id = ${(await conversa()).id}::uuid
       order by iniciada_em desc limit 1
    `);
    const contexto = rows[0]!.contexto;
    expect(contexto['codigo']).toBe('123');
    const expiresAt = (JSON.parse(contexto[EXPIRATIONS_KEY]!) as Record<string, number>)['codigo']!;
    expect(expiresAt).toBeGreaterThan(Date.now() + 200_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
    expect(summaryOfContext(contexto, null)).not.toContain(EXPIRATIONS_KEY);
  });
});

describe('ticket.* after ForwardToDesk', () => {
  it('exposes the Blip Ticket fields of the new attendance', async () => {
    await falar('ticket');
    const { id, contatoId } = await conversa();
    const { rows } = await cenario.dono.execute<{ fila: string; sequencial: number }>(sql`
      select q.nome as fila,
             (select count(*)::int from conversa c2
               where c2.tenant_id = c.tenant_id and (c2.criada_em, c2.id) <= (c.criada_em, c.id)) as sequencial
        from conversa c join fila q on q.id = c.fila_id
       where c.id = ${id}::uuid
    `);
    const linha = await ultimaMensagemDoBot(id);
    expect(linha.conteudo).toBe(`Waiting|${rows[0]!.fila}|${rows[0]!.sequencial}|${contatoId}|false`);
  });
});
