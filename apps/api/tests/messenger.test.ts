import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';
const { createDatabase, estaCifrado, closeDatabase, migrate, seed } = await import('@pipe/db');
const { dubleMessenger, processarOutbox } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { sendMessage } = await import('../src/domain/envio.js');
const { MessengerChannelsController } = await import('../src/controllers/channels-messenger.js');
const { aplicarPerfilMessenger, readChannelMessenger } = await import('../src/domain/messenger/channel.js');
import type { RequestWithSession } from '../src/session.js';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
const { ClienteGraphMessengerDuble, clienteGraphMessenger, definirFabricaGraphMessenger } = await import('../src/domain/messenger/cliente-graph.js');
const { payloadDoMessenger, valuesOfMessenger } = await import('../src/domain/messenger/inbound.js');

describe('Messenger', () => {
  beforeEach(() => { definirFabricaGraphMessenger(null); ClienteGraphMessengerDuble.reiniciar(); });
  it('Resolve Page IDs deterministically and verify the App Secret', async () => {
    const cliente = clienteGraphMessenger('pagina-teste');
    expect((await cliente.fetchPage()).id).toBe(ClienteGraphMessengerDuble.idOfPage('pagina-teste'));
    expect(await cliente.checkSecretOfApp('ab'.repeat(16))).toBe(true);
    expect(await cliente.checkSecretOfApp(`bad${'0'.repeat(29)}`)).toBe(false);
  });
  it('Translate Messenger PSIDs, postbacks, and media while ignoring echoes', () => {
    const payload = { object: 'page', entry: [{ id: 'pagina', messaging: [
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, message: { mid: 'mid-1', text: 'Olá' } },
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, postback: { mid: 'mid-2', title: 'Começar' } },
      { sender: { id: 'pagina' }, message: { mid: 'eco', text: 'não entra', is_echo: true } },
      { sender: { id: 'psid' }, message: { mid: 'mid-3', attachments: [{ type: 'image', payload: { url: 'https://imagem.teste/a.jpg' } }] } },
    ] }] };
    expect(payloadDoMessenger(payload)).toBe(true);
    expect(valuesOfMessenger(payload, 'pagina')[0]?.messages).toMatchObject([
      { from: 'psid', id: 'mid-1', text: { body: 'Olá' } }, { id: 'mid-2', text: { body: 'Começar' } }, { id: 'mid-3', image: { url: 'https://imagem.teste/a.jpg' } },
    ]);
  });
  it('Discard events from another Facebook Page', () => expect(valuesOfMessenger({ object: 'page', entry: [{ id: 'outra', messaging: [] }] }, 'pagina')).toEqual([]));
});

describe('Exercise Messenger with the database, webhook, and worker', () => {
  const secret = 'ab'.repeat(16);
  const sufixo = randomUUID().slice(0, 8);
  let dono: ReturnType<typeof createDatabase>;
  let api: Awaited<ReturnType<typeof upApi>>;
  let A: { tenantId: string; adminId: string };
  let B: { tenantId: string; adminId: string };
  let channelId: string;
  let pageId: string;
  const controller = new MessengerChannelsController();

  async function tenant(nome: string) {
    const { tenantId } = await seed(dono, { nome: `messenger ${nome}`, slug: `messenger-${nome}` });
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email) values (${tenantId}::uuid, 'Admin', ${`admin-${nome}@pipe.app`}) returning id
    `);
    const adminId = rows[0]!.id;
    await dono.execute(sql`insert into usuario_papel (tenant_id, usuario_id, papel_id)
      select ${tenantId}::uuid, ${adminId}::uuid, id from papel
       where tenant_id = ${tenantId}::uuid and nome = 'administrador'`);
    return { tenantId, adminId };
  }

  const request = (q: { tenantId: string; adminId: string }) =>
    ({ sessao: { tenantId: q.tenantId, usuarioId: q.adminId, origem: 'google' } }) as unknown as RequestWithSession;

  async function linhas<T extends Record<string, unknown>>(query: ReturnType<typeof sql>) {
    return (await dono.execute(query)).rows as T[];
  }

  async function conectar(q: { tenantId: string; adminId: string }, token: string, appSecret = secret) {
    return controller.manual(request(q), { access_token: token, app_secret: appSecret });
  }

  function payload(mid: string, de = 'psid-1') {
    return { object: 'page', entry: [{ id: pageId, messaging: [{ sender: { id: de }, recipient: { id: pageId }, timestamp: Date.now(), message: { mid, text: 'Olá' } }] }] };
  }

  async function postar(corpo: unknown, key = secret) {
    const bruto = JSON.stringify(corpo);
    return fetch(`${api.url}/webhooks/messenger/${channelId}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', key).update(bruto).digest('hex')}` }, body: bruto,
    });
  }

  beforeAll(async () => {
    await migrate(process.env['DATABASE_URL']!);
    dono = createDatabase({ url: process.env['DATABASE_URL']!, maxConexoes: 2 });
    A = await tenant(`a-${sufixo}`); B = await tenant(`b-${sufixo}`); api = await upApi(0);
    const ligado = await conectar(A, `ok-${sufixo}`); channelId = ligado.id; pageId = ligado.paginaId!;
  }, 180_000);
  afterAll(async () => { await api?.fechar(); await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`); await closeDatabase(dono); });
  beforeEach(() => { ClienteGraphMessengerDuble.reiniciar(); dubleMessenger.reiniciar(); });

  it('Reject invalid tokens or App Secrets and encrypt valid credentials', async () => {
    await expect(conectar(A, `invalido-${sufixo}`)).rejects.toMatchObject({ status: 422 });
    await expect(controller.manual(request(A), { access_token: 'ok', app_secret: undefined })).rejects.toMatchObject({ status: 422 });
    await expect(controller.manual(request(A), { access_token: 'ok', app_secret: 'curto' })).rejects.toMatchObject({ status: 422 });
    const channel = await readChannelMessenger(A.tenantId, channelId);
    expect(channel.config['tokenAcesso']).toBe(`ok-${sufixo}`);
    const [linha] = await linhas<{ config: Record<string, unknown> }>(sql`select config from canal where id=${channelId}::uuid`);
    expect(estaCifrado(String(linha!.config['tokenAcesso']))).toBe(true);
    expect(estaCifrado(String(linha!.config['appSecret']))).toBe(true);
  });

  it('Reject a page already connected to another tenant and isolate disconnects', async () => {
    await expect(conectar(B, `ok-${sufixo}`)).rejects.toMatchObject({ status: 422 });
    await expect(controller.desconectar(request(B), channelId)).rejects.toMatchObject({ status: 404 });
    const desligado = await controller.desconectar(request(A), channelId);
    expect(desligado.state).toBe('desligado');
    expect(ClienteGraphMessengerDuble.chamadas).toContainEqual({ acao: 'desassinar', pageId });
  });

  it('Verify the challenge, reject bad signatures, and enqueue valid events only once per mid', async () => {
    const ligado = await conectar(A, `novo-${sufixo}`); channelId = ligado.id; pageId = ligado.paginaId!;
    const certo = await fetch(`${api.url}/webhooks/messenger/${channelId}?hub.mode=subscribe&hub.verify_token=${ligado.webhook.verifyToken}&hub.challenge=42`);
    expect(certo.status).toBe(200); expect(await certo.text()).toBe('42');
    expect((await postar(payload('mid-invalido'), 'cd'.repeat(16))).status).toBe(401);
    expect((await postar(payload('mid-1'))).status).toBe(200);
    expect((await postar(payload('mid-1'))).status).toBe(200);
    const messages = await linhas<{ id_provedor: string; conversationId: string }>(sql`select id_provedor, conversa_id from mensagem where id_provedor='mid-1'`);
    expect(messages).toHaveLength(1);
    const [contact] = await linhas<{ phoneE164: string | null }>(sql`select c.telefone_e164 from contato c join contato_identidade i on i.contato_id=c.id where i.identificador='psid-1'`);
    expect(contact!.phoneE164).toBeNull();
    const enviada = await sendMessage({ tenantId: A.tenantId, conversationId: messages[0]!.conversationId, texto: 'Olá de volta' });
    expect((await processarOutbox()).find((r) => r.messageId === enviada.id)).toMatchObject({ estado: 'enviada' });
    expect(dubleMessenger.chamadas).toContainEqual(expect.objectContaining({ para: 'psid-1', tipo: 'texto' }));
  });

  it('Ignore echoes and apply Get Started and persistent-menu settings to the Page', async () => {
    const canal = await readChannelMessenger(A.tenantId, channelId);
    await aplicarPerfilMessenger(canal, { get_started: { payload: 'PIPE_COMECAR' }, greeting: [{ locale: 'default', text: 'Bem-vindo' }] });
    await aplicarPerfilMessenger(canal, { persistent_menu: [{ locale: 'default', call_to_actions: [{ type: 'web_url', title: 'Ajuda', url: 'https://pipe.test/ajuda' }] }] });
    expect(ClienteGraphMessengerDuble.chamadas).toEqual([
      { acao: 'perfil', perfil: { get_started: { payload: 'PIPE_COMECAR' }, greeting: [{ locale: 'default', text: 'Bem-vindo' }] } },
      { acao: 'perfil', perfil: { persistent_menu: [{ locale: 'default', call_to_actions: [{ type: 'web_url', title: 'Ajuda', url: 'https://pipe.test/ajuda' }] }] } },
    ]);
  });
});
