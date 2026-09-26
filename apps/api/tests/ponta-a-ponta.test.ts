import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { agregarDia, dubleWhatsApp, payloadDeStatus, processarOutbox } =
  await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadOfMessage, VERIFY_TOKEN } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The full path, with the double enabled: inbound webhook → conversation and message → reply through the API → outbox → worker delivers → `entregue` → read status → `lida`. And the failure path: media in a rejected format never reaches a call to Meta. Nothing here is a shortcut: the double stands in for the Cloud API, and the statuses it generates come back through the **same** signed webhook endpoint Meta would use.
 */

let cenario: Cenario;
let api: ApiNoAr;
const CLIENTE = '5511988887777';

beforeAll(async () => {
  cenario = await montarCenario(randomUUID().slice(0, 8));
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function postarWebhook(payload: unknown, assinatura?: string): Promise<Response> {
  const corpo = JSON.stringify(payload);
  return fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': assinatura ?? assinar(corpo),
    },
    body: corpo,
  });
}

async function comApi(caminho: string, init: RequestInit = {}, token?: string): Promise<Response> {
  return fetch(`${api.url}${caminho}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token ?? cenario.token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function umaLinha<T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
): Promise<T | null> {
  const { rows } = await cenario.dono.execute(query);
  return (rows[0] as T | undefined) ?? null;
}

/** Delivers the statuses the double accumulated, through the webhook, the way Meta would. */
async function entregarStatusDoDuble(): Promise<void> {
  for (const status of dubleWhatsApp.drenarStatus()) {
    const resposta = await postarWebhook(payloadDeStatus(status));
    expect(resposta.status).toBe(200);
  }
}

describe('Handle inbound webhook events', () => {
  it('Answer Meta\'s webhook subscription challenge', async () => {
    const url =
      `${api.url}/webhooks/whatsapp/${cenario.channelId}` +
      `?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234567890`;
    const resposta = await fetch(url);
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toBe('1234567890');
  });

  it('recusa desafio com verify_token errado', async () => {
    const url =
      `${api.url}/webhooks/whatsapp/${cenario.channelId}` +
      `?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`;
    const resposta = await fetch(url);
    expect(resposta.status).toBe(403);
  });

  it('recusa payload com assinatura inválida', async () => {
    const resposta = await postarWebhook(payloadOfMessage(CLIENTE, 'oi'), 'sha256=00');
    expect(resposta.status).toBe(401);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('signature_invalid');
  });
});

describe('Run the full webhook-to-delivery flow with a Meta stub', () => {
  let conversationId: string;
  let messageOutputId: string;

  it('Create a contact, conversation, and message from an inbound webhook and open the window', async () => {
    const resposta = await postarWebhook(
      payloadOfMessage(CLIENTE, 'Bom dia, preciso da segunda via'),
    );
    expect(resposta.status).toBe(200);

    const conversation = await umaLinha<{
      id: string;
      state: string;
      agentId: string | null;
      windowExpiresAt: Date | string | null;
      lastMessageOf: string | null;
    }>(sql`
      select c.id, c.estado as state, c.atendente_id as "agentId",
             c.janela_expira_em as "windowExpiresAt", c.ultima_mensagem_de as "lastMessageOf"
        from conversa c
        join contato ct on ct.id = c.contato_id
       where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
       limit 1
    `);
    expect(conversation).not.toBeNull();
    conversationId = conversation!.id;

    // Load-based distribution: the queue's only online agent received the conversation.
    expect(conversation!.agentId).toBe(cenario.agentId);
    expect(conversation!.state).toBe('atribuida');
    expect(conversation!.lastMessageOf).toBe('contato');

    // The window opens for 24h starting from the customer's message.
    const expira = new Date(String(conversation!.windowExpiresAt)).getTime();
    const daquiA24h = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expira - daquiA24h)).toBeLessThan(60_000);

    const message = await umaLinha<{ direction: string; content: string }>(sql`
      select direcao as direction, conteudo as content from mensagem
       where conversa_id = ${conversationId}::uuid and direcao = 'entrada' limit 1
    `);
    expect(message?.content).toBe('Bom dia, preciso da segunda via');
  });

  it('Do not duplicate a message when Meta redelivers the same event', async () => {
    const idProvedor = `wamid.REPETIDA.${randomUUID()}`;
    const payload = payloadOfMessage(CLIENTE, 'mensagem repetida', { id: idProvedor });
    expect((await postarWebhook(payload)).status).toBe(200);
    expect((await postarWebhook(payload)).status).toBe(200);

    const count = await umaLinha<{ total: string }>(
      sql`select count(*)::text as total from mensagem where id_provedor = ${idProvedor}`,
    );
    expect(Number(count?.total)).toBe(1);
  });

  it('Create a pending outbox message when an agent replies through the API', async () => {
    const resposta = await comApi(`/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        texto: 'Bom dia! Já vou providenciar.',
        agentId: cenario.agentId,
      }),
    });
    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      stateDelivery: string;
      insideOfWindow: boolean;
      categoryCobranca: string;
    };
    messageOutputId = corpo.id;

    // The point of this work: it is no longer created as `enviada`.
    expect(corpo.stateDelivery).toBe('pendente');
    expect(corpo.insideOfWindow).toBe(true);
    expect(corpo.categoryCobranca).toBe('livre');

    const outbox = await umaLinha<{ state: string; tentativas: number }>(
      sql`select estado as state, tentativas from outbox_mensagem where mensagem_id = ${messageOutputId}::uuid`,
    );
    expect(outbox?.state).toBe('pendente');
    expect(Number(outbox?.tentativas)).toBe(0);
  });

  it('o worker drena o outbox e a Meta (dublê) é chamada uma vez', async () => {
    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.messageId === messageOutputId);
    expect(meu?.state).toBe('enviada');
    expect(dubleWhatsApp.chamadas.length).toBe(antes + 1);

    const mensagem = await umaLinha<{ stateDelivery: string; idProvider: string | null }>(
      sql`select estado_entrega as "stateDelivery", id_provedor as "idProvider" from mensagem where id = ${messageOutputId}::uuid`,
    );
    expect(mensagem?.stateDelivery).toBe('enviada');
    expect(mensagem?.idProvider).toMatch(/^wamid\.DUBLE/);
  });

  it('Update a message to delivered when its delivery webhook arrives', async () => {
    await entregarStatusDoDuble();

    const mensagem = await umaLinha<{ stateDelivery: string; entregueAt: string | null }>(
      sql`select estado_entrega as "stateDelivery", entregue_em as "entregueAt" from mensagem where id = ${messageOutputId}::uuid`,
    );
    expect(mensagem?.stateDelivery).toBe('entregue');
    expect(mensagem?.entregueAt).not.toBeNull();

    const outbox = await umaLinha<{ state: string }>(
      sql`select estado as state from outbox_mensagem where mensagem_id = ${messageOutputId}::uuid`,
    );
    expect(outbox?.state).toBe('entregue');
  });

  it('Update a message to read when its read-status webhook arrives', async () => {
    const idProvedor = (
      await umaLinha<{ idProvider: string }>(
        sql`select id_provedor as "idProvider" from mensagem where id = ${messageOutputId}::uuid`,
      )
    )?.idProvider;
    expect(idProvedor).toBeTruthy();

    dubleWhatsApp.marcarLida(idProvedor!);
    await entregarStatusDoDuble();

    const mensagem = await umaLinha<{ stateDelivery: string; lidaAt: string | null }>(
      sql`select estado_entrega as "stateDelivery", lida_em as "lidaAt" from mensagem where id = ${messageOutputId}::uuid`,
    );
    expect(mensagem?.stateDelivery).toBe('lida');
    expect(mensagem?.lidaAt).not.toBeNull();
  });

  it('Do not regress message state when status webhooks arrive out of order', async () => {
    const idProvedor = (
      await umaLinha<{ idProvider: string }>(
        sql`select id_provedor as "idProvider" from mensagem where id = ${messageOutputId}::uuid`,
      )
    )!.idProvider;

    // `delivered` arriving after `read` is routine on Meta's side. It must be discarded.
    await postarWebhook(
      payloadDeStatus({
        phoneNumberId: '555000111',
        id: idProvedor,
        status: 'delivered',
        recipientId: CLIENTE,
        em: new Date(),
      }),
    );
    const mensagem = await umaLinha<{ stateDelivery: string }>(
      sql`select estado_entrega as "stateDelivery" from mensagem where id = ${messageOutputId}::uuid`,
    );
    expect(mensagem?.stateDelivery).toBe('lida');
  });

  it('List conversations and messages through REST with cursor pagination', async () => {
    const lista = await comApi('/v1/conversations?limit=1&order_by=criada_em[desc]');
    expect(lista.status).toBe(200);
    const page = (await lista.json()) as {
      data: { id: string; contact: { phoneE164: string } }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(page.data).toHaveLength(1);
    expect(page.page_info.end_cursor).toBeTruthy();

    const messages = await comApi(`/v1/conversations/${conversationId}/messages?limit=50`);
    const corpo = (await messages.json()) as { data: { direction: string; stateDelivery: string | null }[] };
    expect(corpo.data.some((m) => m.direction === 'entrada')).toBe(true);
    expect(corpo.data.some((m) => m.direction === 'saida' && m.stateDelivery === 'lida')).toBe(true);
  });
});

describe('caminho da falha', () => {
  let conversaId: string;

  beforeAll(async () => {
    await postarWebhook(payloadOfMessage('5521955554444', 'segue o arquivo', { name: 'Bruno' }));
    const conversa = await umaLinha<{ id: string }>(sql`
      select c.id from conversa c
        join contato ct on ct.id = c.contato_id
       where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = '+5521955554444'
       limit 1
    `);
    conversaId = conversa!.id;
  });

  it('Reject unsupported media before calling Meta and mark the delivery failed', async () => {
    const attachment = await umaLinha<{ id: string }>(sql`
      insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original)
      values (${cenario.tenantId}, 'e2e/instalador.exe', 'application/x-msdownload', 4096,
              'instalador.exe')
      returning id
    `);

    const resposta = await comApi(`/v1/conversations/${conversaId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'documento',
        texto: 'segue o instalador',
        attachmentId: attachment!.id,
        agentId: cenario.agentId,
      }),
    });
    expect(resposta.status).toBe(201);
    const criada = (await resposta.json()) as { id: string; stateDelivery: string };
    expect(criada.stateDelivery).toBe('pendente');

    const chamadasAntes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.messageId === criada.id);

    expect(meu?.state).toBe('falhou');
    expect(meu?.errorCode).toBe('midia_formato_recusado');
    // The proof that validation happened before the call.
    expect(dubleWhatsApp.chamadas.length).toBe(chamadasAntes);

    const mensagem = await umaLinha<{
      stateDelivery: string;
      errorCode: string;
      errorText: string;
    }>(sql`select estado_entrega as "stateDelivery", erro_codigo as "errorCode", erro_texto as "errorText" from mensagem where id = ${criada.id}::uuid`);
    expect(mensagem?.stateDelivery).toBe('falhou');
    expect(mensagem?.errorCode).toBe('midia_formato_recusado');
    // The text is what the Desk shows on screen: it must be readable, not a code.
    expect(mensagem?.errorText).toContain('application/x-msdownload');
    expect(mensagem?.errorText).toContain('não é aceito');

    const outbox = await umaLinha<{ state: string; lastError: string }>(
      sql`select estado as state, ultimo_erro as "lastError" from outbox_mensagem where mensagem_id = ${criada.id}::uuid`,
    );
    expect(outbox?.state).toBe('falhou');
    expect(outbox?.lastError).toContain('midia_formato_recusado');
  });

  it('Reject free-text messages outside the window and explain why', async () => {
    await cenario.dono.execute(sql`
      update conversa set janela_expira_em = now() - interval '1 hour'
       where id = ${conversaId}::uuid
    `);

    const chamadasAntes = dubleWhatsApp.chamadas.length;
    const resposta = await comApi(`/v1/conversations/${conversaId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ texto: 'oi de novo', agentId: cenario.agentId }),
    });

    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as {
      error: { code: string; message: string; detalhe: { modo: string } };
    };
    expect(corpo.error.code).toBe('janela_fechada');
    expect(corpo.error.message).toContain('template aprovado pela Meta');
    expect(corpo.error.detalhe.modo).toBe('somente_template');
    expect(dubleWhatsApp.chamadas.length).toBe(chamadasAntes);
  });
});

describe('Aggregate daily metrics from events idempotently', () => {
  it('fecha metrica_diaria a partir dos eventos e é idempotente', async () => {
    // O dia corrente no fuso do tenant — os eventos deste teste acabaram de acontecer.
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const first = await agregarDia(cenario.tenantId, hoje);
    expect(first.linhas).toBeGreaterThan(0);

    const linha = await umaLinha<{
      conversationsCreated: number;
      messagesInbound: number;
      messagesOutput: number;
      firstResponseN: number;
    }>(sql`
      select conversas_criadas as "conversationsCreated", mensagens_entrada as "messagesInbound",
             mensagens_saida as "messagesOutput", primeira_resposta_n as "firstResponseN"
        from metrica_diaria
       where tenant_id = ${cenario.tenantId}::uuid and dia = ${hoje}::date
         and dimensao_tipo = 'fila' and dimensao_id = ${cenario.queueId}::uuid
    `);
    expect(Number(linha?.conversationsCreated)).toBeGreaterThanOrEqual(2);
    expect(Number(linha?.messagesInbound)).toBeGreaterThanOrEqual(3);
    expect(Number(linha?.messagesOutput)).toBeGreaterThanOrEqual(1);
    expect(Number(linha?.firstResponseN)).toBeGreaterThanOrEqual(1);

    // Running it again overwrites, never accumulates on top — this is what allows recalculating
    // past data when a metric's definition changes.
    await agregarDia(cenario.tenantId, hoje);
    const depois = await umaLinha<{ conversas_criadas: number }>(sql`
      select conversas_criadas from metrica_diaria
       where tenant_id = ${cenario.tenantId}::uuid and dia = ${hoje}::date
         and dimensao_tipo = 'fila' and dimensao_id = ${cenario.queueId}::uuid
    `);
    expect(Number(depois?.conversas_criadas)).toBe(Number(linha?.conversationsCreated));
  });
});

describe('Authenticate API requests with an API key', () => {
  it('sem Bearer, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/conversations`);
    expect(resposta.status).toBe(401);
  });

  it('token inexistente, 401', async () => {
    const resposta = await comApi('/v1/conversations', {}, 'pipe_naoexiste_segredo');
    expect(resposta.status).toBe(401);
  });

  it('Return 403 when an API key lacks the resource scope', async () => {
    const resposta = await comApi('/v1/conversations', {}, cenario.tokenWithoutScope);
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe('without_scope');

    // The same key can read the queue, because it holds that scope.
    expect((await comApi('/v1/queues', {}, cenario.tokenWithoutScope)).status).toBe(200);
  });
});
