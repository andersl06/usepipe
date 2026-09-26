import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';

const { createDatabase, estaCifrado, closeDatabase, migrate, seed } = await import('@pipe/db');
const { dubleInstagram, processarOutbox } = await import('@pipe/workers');
const { forgetChannel } = await import('../src/database.js');
const { upApi } = await import('../src/servidor.js');
const { sendMessage } = await import('../src/domain/envio.js');
const { ClienteGraphInstagramDuble, ClienteGraphInstagramReal, definirFabricaGraphInstagram } = await import(
  '../src/domain/instagram/cliente-graph.js'
);
const { atualizarConfigInstagram, readChannelInstagram } = await import('../src/domain/instagram/channel.js');
const { renewTokenOfChannel } = await import('../src/domain/instagram/renewal.js');
const { InstagramChannelsController } = await import('../src/controllers/channels-instagram.js');
import type { RequestWithSession } from '../src/session.js';

/**
 * The Instagram (Direct) channel through the manual path, against a real database and without touching Meta: connecting (and its rejections), the cipher, the HTTP webhook, inbound messages without a phone number, idempotency, echo, outbound delivery through the worker, disconnecting, isolation between customers, and token renewal.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const SECRET = 'ab'.repeat(16);
const controller = new InstagramChannelsController();

type Dono = ReturnType<typeof createDatabase>;
type Quem = { tenantId: string; adminId: string };
let dono: Dono;
let A: Quem;
let B: Quem;
let api: Awaited<ReturnType<typeof upApi>>;

async function tenantComAdmin(nome: string): Promise<Quem> {
  const { tenantId } = await seed(dono, { name: `ig ${nome}`, slug: `ig-${nome}` });
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}::uuid, 'Admin', ${`admin-${nome}@ig.pipe.app`}) returning id
  `);
  const adminId = rows[0]!.id;
  await dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    select ${tenantId}::uuid, ${adminId}::uuid, id from papel
     where tenant_id = ${tenantId}::uuid and nome = 'administrador'
  `);
  return { tenantId, adminId };
}

function request(quem: Quem): RequestWithSession {
  return { session: { tenantId: quem.tenantId, userId: quem.adminId, origem: 'google' } } as unknown as RequestWithSession;
}

function conectar(quem: Quem, token: string, extra: Record<string, string | undefined> = {}) {
  return controller.manual(request(quem), { access_token: token, app_secret: SECRET, ...extra });
}

async function linhas<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await dono.execute(query)).rows as T[];
}

function evento(channelIg: string, de: string, mensagem: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    object: 'instagram',
    entry: [
      {
        id: channelIg,
        time: Date.now(),
        messaging: [{ sender: { id: de }, recipient: { id: channelIg }, timestamp: Date.now(), message: mensagem, ...extra }],
      },
    ],
  };
}

function postar(channelId: string, payload: unknown, secret = SECRET): Promise<Response> {
  const corpo = JSON.stringify(payload);
  return fetch(`${api.url}/webhooks/instagram/${channelId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(corpo).digest('hex')}`,
    },
    body: corpo,
  });
}

beforeAll(async () => {
  await migrate(URL_DONO);
  dono = createDatabase({ url: URL_DONO, maxConnections: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  definirFabricaGraphInstagram(null);
  await api?.fechar();
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await closeDatabase(dono);
});

beforeEach(() => {
  definirFabricaGraphInstagram(null);
  ClienteGraphInstagramDuble.reiniciar();
  dubleInstagram.reiniciar();
  forgetChannel();
});

describe('conexão manual (POST /v1/channels/instagram/manual)', () => {
  it('Reject missing or invalid tokens and App Secrets from the wrong app', async () => {
    const recusas: [Record<string, string | undefined>, string][] = [
      [{ access_token: undefined }, 'O token de acesso é obrigatório.'],
      [{ app_secret: undefined }, 'O App Secret é obrigatório.'],
      [{ app_secret: 'curto' }, 'O App Secret tem 32 caracteres, só números e letras de a a f.'],
      [{ access_token: `invalido-${S}` }, 'O token não foi aceito pelo Instagram.'],
      [{ app_secret: `bad${'0'.repeat(29)}` }, 'Este App Secret não é do aplicativo que gerou o token.'],
    ];
    for (const [extra, message] of recusas) {
      await expect(conectar(A, `recusa-${S}`, extra)).rejects.toMatchObject({
        status: 422,
        codigo: 'configuracao_invalida',
        message: expect.stringContaining(message),
      });
    }
    expect(await linhas(sql`select 1 from canal where tenant_id = ${A.tenantId}::uuid`)).toHaveLength(0);
    expect(ClienteGraphInstagramDuble.chamadas.filter((c) => c.acao === 'assinar')).toHaveLength(0);
  });

  it('Create a channel and inbox, encrypt secrets, subscribe the webhook, and return its credentials', async () => {
    const token = `ok-${S}`;
    const feito = await conectar(A, token, { nome: 'Direct da loja' });
    const igUserId = ClienteGraphInstagramDuble.idOfAccount(token);

    expect(feito).toMatchObject({ nome: 'Direct da loja', estado: 'conectado', igUserId, erroDeWebhook: null });
    expect(feito.webhook.url).toBe(`https://api.teste/webhooks/instagram/${feito.id}`);
    expect(feito.webhook.verifyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(ClienteGraphInstagramDuble.chamadas).toContainEqual({ acao: 'assinar', igUserId });

    const [linha] = await linhas<{ type: string; numero_id: string; config: Record<string, unknown> }>(
      sql`select tipo, numero_id, config from canal where id = ${feito.id}::uuid`,
    );
    expect(linha).toMatchObject({ tipo: 'instagram', numero_id: igUserId });
    for (const campo of ['tokenAcesso', 'appSecret', 'verifyToken']) {
      expect(estaCifrado(String(linha!.config[campo]))).toBe(true);
    }
    expect(JSON.stringify(linha!.config)).not.toContain(token);
    expect(await linhas(sql`select 1 from inbox where canal_id = ${feito.id}::uuid`)).toHaveLength(1);

    const { channels } = await controller.listar(request(A));
    expect(channels.map((c) => c.id)).toContain(feito.id);
  });

  it('Prevent the same Instagram account from connecting twice or across tenants', async () => {
    const token = `unica-${S}`;
    await conectar(A, token);
    await expect(conectar(B, token)).rejects.toMatchObject({
      codigo: 'configuracao_invalida',
      message: 'Esta conta do Instagram já está conectada a outra caixa de entrada.',
    });
    await expect(conectar(A, token)).rejects.toMatchObject({ codigo: 'configuracao_invalida' });
    expect(await linhas(sql`select 1 from canal where tenant_id = ${B.tenantId}::uuid`)).toHaveLength(0);
  });

  it('Keep customer tokens and secrets out of Graph client error messages', async () => {
    const token = 'IGAAtoken-secreto-do-cliente';
    const buscar = (async () =>
      new Response(JSON.stringify({ error: { code: 190, message: `token ${token} inválido` } }), {
        status: 400,
      })) as typeof fetch;
    const cliente = new ClienteGraphInstagramReal(token, buscar);
    const error = (await cliente.fetchAccount().catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(token);
    expect(error.message).toContain('«segredo»');
    expect(await cliente.checkSecretOfApp(SECRET)).toBe(false);
  });

  it('o envio real manda {recipient:{id}, message:{attachment}} e a legenda em seguida', async () => {
    const pedidos: { url: string; corpo: unknown }[] = [];
    const buscar = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, corpo: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ recipient_id: '1', message_id: `mid-${pedidos.length}` }));
    }) as unknown as typeof fetch;
    const { ClienteInstagramReal } = await import('@pipe/workers');
    const r = await new ClienteInstagramReal(buscar).enviar({
      para: '123',
      conteudo: { tipo: 'imagem', link: 'https://x.teste/a.png', legenda: 'veja' },
      credentials: { igUserId: '178', tokenAccess: 't', apiVersao: 'v23.0' },
    });
    expect(r.idProvedor).toBe('mid-1');
    expect(pedidos).toEqual([
      {
        url: 'https://graph.instagram.com/v23.0/178/messages',
        corpo: { recipient: { id: '123' }, message: { attachment: { type: 'image', payload: { url: 'https://x.teste/a.png' } } } },
      },
      { url: 'https://graph.instagram.com/v23.0/178/messages', corpo: { recipient: { id: '123' }, message: { text: 'veja' } } },
    ]);
  });
});

describe('Handle Instagram inbound and outbound webhooks', () => {
  let channelId: string;
  let igUserId: string;
  let verifyToken: string;
  const IGSID = `9${Date.now()}`;

  beforeAll(async () => {
    definirFabricaGraphInstagram(null);
    const feito = await conectar(A, `webhook-${S}`);
    channelId = feito.id;
    igUserId = feito.igUserId!;
    verifyToken = feito.webhook.verifyToken;
  });

  it('Answer webhook challenges with the channel verify_token and reject wrong tokens', async () => {
    const base = `${api.url}/webhooks/instagram/${channelId}?hub.mode=subscribe&hub.challenge=4242`;
    const certo = await fetch(`${base}&hub.verify_token=${verifyToken}`);
    expect(certo.status).toBe(200);
    expect(await certo.text()).toBe('4242');
    expect((await fetch(`${base}&hub.verify_token=errado`)).status).toBe(403);
  });

  it('assinatura inválida é 401 e não grava nada', async () => {
    const r = await postar(channelId, evento(igUserId, IGSID, { mid: `mid-x-${S}`, text: 'oi' }), 'cd'.repeat(16));
    expect(r.status).toBe(401);
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-x-${S}`}`)).toHaveLength(0);
  });

  it('Create a phone-free contact by IGSID, conversation, and message without duplicating a repeated event', async () => {
    const payload = evento(igUserId, IGSID, { mid: `mid-1-${S}`, text: 'Olá, quero um orçamento' });
    expect((await postar(channelId, payload)).status).toBe(200);
    expect((await postar(channelId, payload)).status).toBe(200);

    const msgs = await linhas<{ conteudo: string; direction: string; conversationId: string }>(
      sql`select conteudo, direcao, conversa_id from mensagem where id_provedor = ${`mid-1-${S}`}`,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ conteudo: 'Olá, quero um orçamento', direcao: 'entrada' });

    const [contact] = await linhas<{ phoneE164: string | null; channelType: string }>(sql`
      select ct.telefone_e164, ci.canal_tipo from contato_identidade ci
        join contato ct on ct.id = ci.contato_id
       where ci.tenant_id = ${A.tenantId}::uuid and ci.identificador = ${IGSID}
    `);
    expect(contact).toEqual({ telefone_e164: null, canal_tipo: 'instagram' });

    const [conversation] = await linhas<{ channelId: string }>(sql`
      select ib.canal_id from conversa c join inbox ib on ib.id = c.inbox_id where c.id = ${msgs[0]!.conversationId}::uuid
    `);
    expect(conversation!.channelId).toBe(channelId);
  });

  it('Ignore account echoes, resolve attachment URLs, and discard other accounts\' events', async () => {
    await postar(channelId, evento(igUserId, igUserId, { mid: `mid-eco-${S}`, text: 'eco', is_echo: true }));
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-eco-${S}`}`)).toHaveLength(0);

    const url = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
    await postar(channelId, evento(igUserId, IGSID, { mid: `mid-img-${S}`, attachments: [{ type: 'image', payload: { url } }] }));
    const [img] = await linhas<{ type: string; keyStorage: string }>(sql`
      select m.tipo, a.chave_storage from mensagem m join anexo a on a.id = m.anexo_id
       where m.id_provedor = ${`mid-img-${S}`}
    `);
    expect(img).toEqual({ tipo: 'imagem', chave_storage: url });

    await postar(channelId, evento('17800000000000000', IGSID, { mid: `mid-alheia-${S}`, text: 'x' }));
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-alheia-${S}`}`)).toHaveLength(0);
  });

  it('a resposta sai pelo worker para o IGSID, com o token decifrado, e o `read` marca lida', async () => {
    const [{ conversa_id: conversationId }] = (await linhas<{ conversa_id: string }>(
      sql`select conversa_id from mensagem where id_provedor = ${`mid-1-${S}`}`,
    )) as [{ conversa_id: string }];
    const enviada = await sendMessage({ tenantId: A.tenantId, conversationId, texto: 'Claro! Qual o modelo?' });

    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.messageId === enviada.id);
    expect(meu).toMatchObject({ estado: 'enviada' });
    expect(dubleInstagram.chamadas).toContainEqual(
      expect.objectContaining({ para: IGSID, tipo: 'texto', igUserId }),
    );

    const [saida] = await linhas<{ idProvider: string; stateDelivery: string }>(
      sql`select id_provedor, estado_entrega from mensagem where id = ${enviada.id}::uuid`,
    );
    expect(saida!.stateDelivery).toBe('enviada');

    await postar(channelId, {
      object: 'instagram',
      entry: [{ id: igUserId, messaging: [{ sender: { id: IGSID }, recipient: { id: igUserId }, timestamp: Date.now(), read: { mid: saida!.idProvider } }] }],
    });
    const [lida] = await linhas<{ stateDelivery: string }>(
      sql`select estado_entrega from mensagem where id = ${enviada.id}::uuid`,
    );
    expect(lida!.stateDelivery).toBe('lida');
  });

  it('Hide another tenant\'s channel from listing and return 404 on disconnect', async () => {
    const { channels } = await controller.listar(request(B));
    expect(channels.map((c) => c.id)).not.toContain(channelId);
    await expect(controller.desconectar(request(B), channelId)).rejects.toMatchObject({ status: 404 });
  });

  it('Renew encrypted tokens after 24 hours and mark rejected renewals for reauthorization', async () => {
    let channel = await readChannelInstagram(A.tenantId, channelId);
    expect(await renewTokenOfChannel(channel)).toBe('cedo_demais');
    expect(ClienteGraphInstagramDuble.chamadas.filter((c) => c.acao === 'renovar')).toHaveLength(0);

    const antigo = String(channel.config['tokenAcesso']);
    channel = await atualizarConfigInstagram(channel, {
      tokenRenovadoEm: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    });
    expect(await renewTokenOfChannel(channel)).toBe('renovado');
    channel = await readChannelInstagram(A.tenantId, channelId);
    expect(channel.config['tokenAcesso']).not.toBe(antigo);
    expect(Date.parse(String(channel.config['tokenExpiraEm']))).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000);
    const [bruto] = await linhas<{ config: Record<string, unknown> }>(sql`select config from canal where id = ${channelId}::uuid`);
    expect(estaCifrado(String(bruto!.config['tokenAcesso']))).toBe(true);

    channel = await atualizarConfigInstagram(channel, {
      tokenAcesso: `expirado-${S}`,
      tokenRenovadoEm: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    });
    expect(await renewTokenOfChannel(channel)).toBe('recusado');
    const { channels } = await controller.listar(request(A));
    expect(channels.find((c) => c.id === channelId)).toMatchObject({ estado: 'indisponivel', motivo: 'reautorizacao_pendente' });
  });

  it('Unsubscribe and disable on disconnect without deleting history, then allow reconnection', async () => {
    const desligado = await controller.desconectar(request(A), channelId);
    expect(desligado.state).toBe('desligado');
    expect(ClienteGraphInstagramDuble.chamadas).toContainEqual({ acao: 'desassinar', igUserId });
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-1-${S}`}`)).toHaveLength(1);

    const r = await postar(channelId, evento(igUserId, IGSID, { mid: `mid-depois-${S}`, text: 'oi?' }));
    expect(r.status).toBe(409);

    const religado = await conectar(A, `webhook-${S}`);
    expect(religado).toMatchObject({ id: channelId, estado: 'conectado' });
  });
});
