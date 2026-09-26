import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { ClienteGraphDuble } = await import('../src/domain/whatsapp/cliente-graph.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The BOT'S channel — `PUT`/`DELETE /v1/gestao/fluxos/:id/canal`, the `GET` the channel page reads, and the manual connection with `fluxo_id`.
 *
 * What's proven is what the source decides (`referencias-blip/canais/FICHA-conectar-canal-no-bot.md` §4): the channel belongs to the bot and the permission is the bot's `channels`; one bot per number ("Oops… This number is already in use" — Blip refuses, it doesn't transfer; whoever swaps disconnects the previous bot first); and, once the router is connected to the number, a message arriving on that number lands on it. Plus Pipe's own guards: an inactive channel doesn't connect (409), another tenant and a malformed uuid are 404, and a bot has only one channel (the `fluxo.canal_id` column).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem edita fluxo na conta — o equivalente de conta de `channels.escrever`. */
let sessionEditor: string;
/** People from tenant A with no permission at all. */
let sessionWithoutAuthority: string;
/** Someone who's only a member of ONE flow, with `channels: write` — nothing at the account level. */
let memberOfFlow: string;
let sessionOfOtherTenant: string;

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return userId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

/** Um contato (fluxo ou roteador) direto no banco. */
async function newFlow(
  cenario: Cenario,
  tipo: 'fluxo' | 'roteador',
  extra: { state?: string; channelId?: string } = {},
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id)
    values (
      ${cenario.tenantId}, ${`${tipo} ${randomUUID().slice(0, 8)}`}, ${tipo},
      ${extra.state ?? 'rascunho'}, ${extra.channelId ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

/** One more channel on the tenant, without going through Meta. */
async function newChannel(
  cenario: Cenario,
  extra: { type?: string; active?: boolean; number?: string } = {},
): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, ativo, config)
    values (
      ${cenario.tenantId}, ${extra.type ?? 'whatsapp_cloud'}, ${`Canal ${marca}`},
      ${extra.active ?? true}, ${JSON.stringify({ numero: extra.number ?? `+55119${marca.slice(0, 7)}` })}::jsonb
    )
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

const codigo = (r: { body: Record<string, unknown> }) =>
  (r.body['error'] as { code?: string } | undefined)?.code;
const detalhe = (r: { body: Record<string, unknown> }) =>
  (r.body['error'] as { detalhe?: Record<string, unknown> } | undefined)?.detalhe ?? {};

const ligar = (sessao: string, flowId: string, channelId: string) =>
  chamar(sessao, 'PUT', `/v1/management/flows/${flowId}/channel`, { canalId: channelId });
const desligar = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'DELETE', `/v1/management/flows/${fluxoId}/channel`);
const readChannel = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'GET', `/v1/management/flows/${fluxoId}/channel`);

async function channelOfDatabase(fluxoId: string): Promise<string | null> {
  const { rows } = await a.dono.execute<{ channelId: string | null }>(
    sql`select canal_id as "channelId" from fluxo where id = ${fluxoId}::uuid`,
  );
  return rows[0]?.channelId ?? null;
}

async function auditoriaDe(fluxoId: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'fluxo' and objeto_id = ${fluxoId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  sessionEditor = await openSession(a, await pessoaCom(a, ['automacao.fluxo.editar']));
  sessionWithoutAuthority = await openSession(a, await pessoaCom(a, []));
  memberOfFlow = await pessoaCom(a, []);
  sessionOfOtherTenant = await openSession(b, await pessoaCom(b, ['automacao.fluxo.editar']));
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('PUT e GET /v1/management/flows/:id/channel', () => {
  it('Connect a channel to a bot, audit it, and include channel details in contact GET', async () => {
    const flowId = await newFlow(a, 'fluxo');
    const channelId = await newChannel(a, { number: '+5511900000001' });

    const ligado = await ligar(sessionEditor, flowId, channelId);
    expect(ligado.status).toBe(200);
    expect(ligado.body).toMatchObject({
      id: channelId,
      tipo: 'whatsapp_cloud',
      numero: '+5511900000001',
      ativo: true,
      flowId,
    });
    expect(await channelOfDatabase(flowId)).toBe(channelId);

    const log = await auditoriaDe(flowId);
    expect(log.at(-1)).toMatchObject({
      acao: 'alterou',
      antes: { canalId: null },
      depois: { canalId: channelId, canalTipo: 'whatsapp_cloud' },
    });

    const lido = await readChannel(sessionEditor, flowId);
    expect(lido.status).toBe(200);
    expect(lido.body['channel']).toMatchObject({ id: channelId, flowId });
    const disponiveis = lido.body['disponiveis'] as { id: string; flowId: string | null }[];
    expect(disponiveis.find((c) => c.id === channelId)?.flowId).toBe(flowId);

    const contact = await chamar(sessionEditor, 'GET', `/v1/management/flows/${flowId}`);
    expect(contact.body['contact']).toMatchObject({
      canalId: channelId,
      canalTipo: 'whatsapp_cloud',
      canalAtivo: true,
      canalNumero: '+5511900000001',
    });
    expect((contact.body['contact'] as { canalNome: string }).canalNome).toMatch(/^Canal /);

    // // Connecting the same channel again isn't an error and doesn't create a record.
    expect((await ligar(sessionEditor, flowId, channelId)).status).toBe(200);
    expect(await auditoriaDe(flowId)).toHaveLength(log.length);
  });

  it('Allow only one bot per number and connect another only after the first disconnects', async () => {
    const first = await newFlow(a, 'fluxo');
    const segundo = await newFlow(a, 'roteador');
    const canalId = await newChannel(a);
    expect((await ligar(sessionEditor, first, canalId)).status).toBe(200);

    const recusa = await ligar(sessionEditor, segundo, canalId);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('number_in_use');
    expect((recusa.body['error'] as { message: string }).message).toBe(
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
    );
    expect(detalhe(recusa)['fluxoId']).toBe(first);
    expect(await channelOfDatabase(segundo)).toBeNull();

    // // The second one's screen sees the channel as "in use by the first."
    const lido = await readChannel(sessionEditor, segundo);
    const disponiveis = lido.body['disponiveis'] as { id: string; flowId: string | null }[];
    expect(disponiveis.find((c) => c.id === canalId)?.flowId).toBe(first);

    // // Switching bots means: disconnect on the old one, connect on the new one.
    expect((await desligar(sessionEditor, first)).status).toBe(204);
    expect(await channelOfDatabase(first)).toBeNull();
    expect((await ligar(sessionEditor, segundo, canalId)).status).toBe(200);
    expect(await channelOfDatabase(segundo)).toBe(canalId);

    // // Archived doesn't hold the number: a third one connects over it.
    await a.dono.execute(sql`update fluxo set estado = 'arquivado' where id = ${segundo}::uuid`);
    const third = await newFlow(a, 'fluxo');
    expect((await ligar(sessionEditor, third, canalId)).status).toBe(200);
  });

  it('Return 409 and identify the existing channel when connecting a second channel to one bot', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const whatsapp = await newChannel(a);
    const instagram = await newChannel(a, { type: 'instagram' });
    expect((await ligar(sessionEditor, fluxoId, whatsapp)).status).toBe(200);

    const recusa = await ligar(sessionEditor, fluxoId, instagram);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('flow_already_has_channel');
    expect(detalhe(recusa)['canalId']).toBe(whatsapp);
    expect(await channelOfDatabase(fluxoId)).toBe(whatsapp);
  });

  it('Return 409 for an inactive channel and 404 for invalid or cross-tenant IDs', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const desligado = await newChannel(a, { active: false });
    const inativo = await ligar(sessionEditor, fluxoId, desligado);
    expect(inativo.status).toBe(409);
    expect(codigo(inativo)).toBe('channel_inactive');

    const channelOfB = await newChannel(b);
    expect((await ligar(sessionEditor, fluxoId, channelOfB)).status).toBe(404);
    expect((await ligar(sessionEditor, fluxoId, 'nao-e-uuid')).status).toBe(404);
    expect((await ligar(sessionEditor, 'nao-e-uuid', channelOfB)).status).toBe(404);
    expect((await chamar(sessionEditor, 'PUT', `/v1/management/flows/${fluxoId}/channel`, {})).status).toBe(400);

    const channelOfA = await newChannel(a);
    expect((await ligar(sessionOfOtherTenant, fluxoId, channelOfA)).status).toBe(404);
    expect((await readChannel(sessionOfOtherTenant, fluxoId)).status).toBe(404);
    expect((await desligar(sessionOfOtherTenant, fluxoId)).status).toBe(404);
    expect(await channelOfDatabase(fluxoId)).toBeNull();
  });

  it('Require the bot\'s `channels` permission and allow flow members with `channels.escrever` to connect', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const otherFlow = await newFlow(a, 'fluxo');
    const canalId = await newChannel(a);

    const semPoder = await ligar(sessionWithoutAuthority, fluxoId, canalId);
    expect(semPoder.status).toBe(403);
    expect(codigo(semPoder)).toBe('without_permission');
    expect((await desligar(sessionWithoutAuthority, fluxoId)).status).toBe(403);

    await a.dono.execute(sql`
      insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
      values (${a.tenantId}, ${fluxoId}::uuid, ${memberOfFlow}::uuid, 'personalizado',
              ${JSON.stringify({ channels: 'escrever' })}::jsonb)
    `);
    const sessionMember = await openSession(a, memberOfFlow);
    expect((await ligar(sessionMember, fluxoId, canalId)).status).toBe(200);
    expect((await desligar(sessionMember, fluxoId)).status).toBe(204);
    // // On the flow they're not a member of, still no permission.
    expect((await ligar(sessionMember, otherFlow, canalId)).status).toBe(403);
  });
});

describe('DELETE /v1/management/flows/:id/channel', () => {
  it('Disconnect the bot without changing the channel, audit the action, and allow repeated disconnects', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const canalId = await newChannel(a);
    await ligar(sessionEditor, fluxoId, canalId);

    expect((await desligar(sessionEditor, fluxoId)).status).toBe(204);
    expect(await channelOfDatabase(fluxoId)).toBeNull();
    const { rows } = await a.dono.execute<{ ativo: boolean }>(
      sql`select ativo from canal where id = ${canalId}::uuid`,
    );
    expect(rows[0]?.ativo).toBe(true);

    const log = await auditoriaDe(fluxoId);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', antes: { canalId }, depois: { canalId: null } });

    expect((await desligar(sessionEditor, fluxoId)).status).toBe(204);
    expect(await auditoriaDe(fluxoId)).toHaveLength(log.length);

    const lido = await readChannel(sessionEditor, fluxoId);
    expect(lido.body['channel']).toBeNull();
  });
});

describe('Connect a new channel to a bot using `fluxo_id`', () => {
  const appSecret = 'a'.repeat(32);

  it('Create a channel already linked to the bot under the bot\'s permission', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`ligado-${fluxoId}`);
    const criado = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      name: 'Número do bot',
      flowId: fluxoId,
    });
    expect(criado.status).toBe(201);
    const canalId = criado.body['id'] as string;
    expect(await channelOfDatabase(fluxoId)).toBe(canalId);

    const lido = await readChannel(sessionEditor, fluxoId);
    expect(lido.body['channel']).toMatchObject({ id: canalId, tipo: 'whatsapp_cloud', nome: 'Número do bot', flowId: fluxoId });
  });

  it('Reject missing bot permission, an occupied bot, or a malformed flow before creating a channel', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`negado-${fluxoId}`);
    const corpo = {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      flowId: fluxoId,
    };
    const contar = async () => {
      const { rows } = await a.dono.execute<{ n: string }>(
        sql`select count(*)::text as n from canal where tenant_id = ${a.tenantId}::uuid and numero_id = ${numeroId}`,
      );
      return Number(rows[0]!.n);
    };

    expect((await chamar(sessionWithoutAuthority, 'POST', '/v1/channels/whatsapp/manual', corpo)).status).toBe(403);
    expect(await contar()).toBe(0);

    expect(
      (await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', { ...corpo, flowId: 'nao-e-uuid' })).status,
    ).toBe(404);
    expect(await contar()).toBe(0);

    await ligar(sessionEditor, fluxoId, await newChannel(a));
    const cheio = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', corpo);
    expect(cheio.status).toBe(409);
    expect(codigo(cheio)).toBe('flow_already_has_channel');
    expect(await contar()).toBe(0);
  });
});

/* ------------------------------------------------- A mensagem cai no roteador */

const enviar = (texto: string) => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: texto },
});

/** A one-question principal: answers and waits. */
const PRINCIPAL = {
  states: [
    { id: 'inicio', root: true, input: {}, outputs: [{ stateId: 'ola' }] },
    { id: 'ola', inputActions: [enviar('Roteador: olá!')], input: {}, outputs: [{ stateId: 'ola' }] },
  ],
};

describe('Route messages from a connected phone number to its router bot', () => {
  it('Answer the customer\'s first message through the router\'s primary service', async () => {
    const principal = await noTenant(a.tenantId, (tx) =>
      importFlowOfBlip(tx, {
        tenantId: a.tenantId,
        name: `Principal ${randomUUID().slice(0, 6)}`,
        channelId: null,
        json: PRINCIPAL,
        publicar: true,
      }),
    );
    expect(principal.errorOfValidation).toBeNull();

    // // Publishing the router isn't this task's gesture: it's born published, but WITHOUT a channel.
    const routerId = await newFlow(a, 'roteador', { state: 'publicado' });
    await a.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min)
      values (${a.tenantId}, ${routerId}, ${principal.flowId}, 'Principal', true, false, null)
    `);

    // // Through the screen: the scenario's channel (the number that receives the webhook) becomes the router's channel.
    expect((await ligar(sessionEditor, routerId, a.channelId)).status).toBe(200);

    const CLIENTE = '5511933330001';
    const corpo = JSON.stringify(payloadOfMessage(CLIENTE, 'oi'));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);

    const { rows } = await a.dono.execute<{ conteudo: string }>(sql`
      select m.conteudo from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where ct.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
         and m.autor_tipo = 'bot'
       order by m.criada_em desc limit 1
    `);
    expect(rows[0]?.conteudo).toBe('Roteador: olá!');

    const { rows: position } = await a.dono.execute<{ servico_id: string }>(sql`
      select p.servico_id from posicao_no_roteador p
        join contato ct on ct.id = p.contato_id
       where p.roteador_id = ${routerId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
    `);
    expect(position[0]?.servico_id).toBe(principal.flowId);

    // // Once the router is disconnected from the number, the next new conversation no longer goes through it.
    expect((await desligar(sessionEditor, routerId)).status).toBe(204);
  });
});

/* ---------------------------------------- Reconectar por cima, sem desconectar */

describe('reconexão manual do mesmo número', () => {
  const appSecret = 'b'.repeat(32);

  /**
   * The client's token expires, and in the source the way out is to redo the connection on the same channel — there's no disconnect on WhatsApp (`FICHA-conectar-canal-no-bot.md` §5). Without `canal_id`, swapping the token was a dead end: creating a new one runs into the same number.
   */
  it('Update existing channel credentials by canal_id instead of rejecting its phone number', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`reconecta-${fluxoId}`);
    const corpo = {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      flowId: fluxoId,
    };
    const criado = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', corpo);
    expect(criado.status).toBe(201);
    const canalId = criado.body['id'] as string;

    /*
     * Without `canal_id`: this is the dead end the owner ran into — the number already belongs to a channel. Outside the bot, `canal.gerenciar` is in charge, hence the separate session.
     */
    const sessionOfChannel = await openSession(a, await pessoaCom(a, ['canal.gerenciar']));
    const { flowId: _semBot, ...semBot } = corpo;
    const repetido = await chamar(sessionOfChannel, 'POST', '/v1/channels/whatsapp/manual', semBot);
    expect(repetido.status).toBe(422);
    expect(codigo(repetido)).toBe('configuration_invalid');

    /*
     * The Meta double matches token to number, so the test token is the same one; what proves the swap is the new App Secret stored on the channel.
     */
    const newSecret = 'c'.repeat(32);
    const refeito = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      ...corpo,
      app_secret: newSecret,
      channelId: canalId,
    });
    expect(refeito.status).toBe(201);
    expect(refeito.body['id']).toBe(canalId);
    /* The channel stays connected to the same bot, and a second one wasn't born. */
    expect(await channelOfDatabase(fluxoId)).toBe(canalId);
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from canal where tenant_id = ${a.tenantId}::uuid and numero_id = ${numeroId}`,
    );
    expect(Number(rows[0]!.n)).toBe(1);

    const { rows: guardado } = await a.dono.execute<{ secret: string }>(
      sql`select config->>'appSecret' as secret from canal where id = ${canalId}::uuid`,
    );
    /* Encrypted in the database: what matters is that it CHANGED, not the plaintext value. */
    expect(guardado[0]!.secret).toBeTruthy();
    expect(guardado[0]!.secret).not.toBe(appSecret);
  });

  it('Reject attempts to reconnect another tenant\'s channel', async () => {
    const alheio = await newChannel(b);
    const resposta = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: ClienteGraphDuble.sufixo('alheio'),
      access_token: 'manual-alheio',
      app_secret: appSecret,
      channelId: alheio,
    });
    expect(resposta.status).toBe(404);
  });
});
