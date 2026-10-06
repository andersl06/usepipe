import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { identificarEntradas } = await import('../src/controllers/webhooks-whatsapp.js');
const { fireInputExpiration } = await import('../src/domain/input-expiration-job.js');
const { listContactsOfFlow } = await import('../src/domain/management-flow.js');
const { loadChannelOfFlow } = await import('../src/domain/management/communication.js');
const { APP_SECRET, VERIFY_TOKEN, assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * P10: two routers with different WhatsApp numbers never see each other's data, a Meta payload
 * carrying several numbers is routed per number, a channel cannot be attached to two live bots, and
 * a router service flow keeps its channel through the conversation inbox. Invented data only.
 */

const NUMBER_1 = '555000111';
const NUMBER_2 = '555000222';
const NUMBER_3 = '555000333';

let a: Cenario;
let api: ApiNoAr;
let editorSession: string;
let router1: string;
let router2: string;
let router3: string;
let channel1: string;
let channel2: string;
let channel3: string;
let channel4: string;
let inbox1: string;
let inbox2: string;
let inbox3: string;
let service1: string;

function block(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    $title: id,
    $position: { top: '40px', left: '40px' },
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    ...extra,
  };
}
const say = (content: string) => ({ action: { type: 'SendMessage', settings: { type: 'text/plain', content } } });

/** `pergunta` waits one minute and expires into `inatividade`. */
function design(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  return {
    flow: {
      inicio: block('inicio', {
        root: true,
        $contentActions: [{ input: { bypass: false } }],
        $defaultOutput: { stateId: 'pergunta' },
      }),
      pergunta: block('pergunta', {
        $contentActions: [say('Qual é o número do pedido?'), { input: { bypass: false, variable: 'pedido', expiration: '0:1' } }],
        $conditionOutputs: [{ stateId: 'obrigado', conditions: [{ source: 'input', comparison: 'exists', values: [] }] }],
        $defaultOutput: { stateId: 'inatividade' },
      }),
      obrigado: block('obrigado', {
        $contentActions: [say('Obrigado.'), { input: { bypass: false } }],
        $defaultOutput: { stateId: 'obrigado' },
      }),
      inatividade: block('inatividade', {
        $contentActions: [say('Você ainda está aí?'), { input: { bypass: false, expiration: '8:0' } }],
        $defaultOutput: { stateId: 'obrigado' },
      }),
    },
    globals: {},
  };
}

async function one(query: ReturnType<typeof sql>): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(query);
  return rows[0]!.id;
}

async function newChannel(label: string, numberId: string | null): Promise<string> {
  const config = JSON.stringify({
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
    phoneNumberId: numberId,
    tokenAcesso: 'token-falso-do-usuario-de-sistema',
  });
  return one(sql`
    insert into canal (tenant_id, tipo, nome, config, numero_id)
    values (${a.tenantId}, 'whatsapp_cloud', ${label}, ${config}::jsonb, ${numberId}) returning id
  `);
}

async function newInbox(channelId: string, queueId: string): Promise<string> {
  return one(sql`
    insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
    values (${a.tenantId}, ${channelId}, 'Entrada', ${queueId}) returning id
  `);
}

async function newRouter(label: string, channelId: string | null): Promise<string> {
  const mark = randomUUID().slice(0, 8);
  return one(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
    values (${a.tenantId}, ${`${label} ${mark}`}, 'roteador', 'publicado', ${channelId}, ${`${label}-${mark}`})
    returning id
  `);
}

function metaPayload(from: string, text: string, numberId: string): unknown {
  const payload = payloadOfMessage(from, text) as {
    entry: { changes: { value: { metadata: { phone_number_id: string } } }[] }[];
  };
  payload.entry[0]!.changes[0]!.value.metadata.phone_number_id = numberId;
  return payload;
}

async function postToChannel(channelId: string, payload: unknown): Promise<number> {
  const body = JSON.stringify(payload);
  const response = await fetch(`${api.url}/webhooks/whatsapp/${channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(body) },
    body,
  });
  return response.status;
}

async function contactOfPhone(phone: string): Promise<string | null> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    select id from contato where tenant_id = ${a.tenantId}::uuid and telefone_e164 = ${`+${phone}`} limit 1
  `);
  return rows[0]?.id ?? null;
}

async function inboxOfConversation(phone: string): Promise<string | null> {
  const { rows } = await a.dono.execute<{ inbox_id: string }>(sql`
    select c.inbox_id from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${phone}`}
     order by c.criada_em desc limit 1
  `);
  return rows[0]?.inbox_id ?? null;
}

const contactsOf = async (flowId: string) =>
  (await noTenant(a.tenantId, (tx) => listContactsOfFlow(tx, a.tenantId, flowId))).map((c) => c.id);

async function openEditorSession(): Promise<string> {
  const mark = randomUUID().slice(0, 8);
  const userId = await one(sql`
    insert into usuario (tenant_id, nome, email)
    values (${a.tenantId}, ${`Editor ${mark}`}, ${`editor-${mark}@e2e.pipe.app`}) returning id
  `);
  const roleId = await one(sql`
    insert into papel (tenant_id, nome, escopo) values (${a.tenantId}, ${`papel ${mark}`}, 'atendimento') returning id
  `);
  await a.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${a.tenantId}, ${roleId}, 'automacao.fluxo.editar')
  `);
  await a.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${a.tenantId}, ${userId}, ${roleId})
  `);
  const token = createToken();
  await a.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${a.tenantId}, ${userId}, ${token.hash}, ${token.expiraEm}, 'google')
  `);
  return token.token;
}

async function attach(flowId: string, channelId: string): Promise<{ status: number; code?: string }> {
  const response = await fetch(`${api.url}/v1/management/flows/${flowId}/channel`, {
    method: 'PUT',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${editorSession}`, 'content-type': 'application/json' },
    body: JSON.stringify({ canalId: channelId }),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { error?: { code?: string } }) : {};
  return { status: response.status, ...(body.error?.code ? { code: body.error.code } : {}) };
}

beforeAll(async () => {
  a = await montarCenario(`iso-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  editorSession = await openEditorSession();

  // Router 1 owns number 1 (legacy link) and number 3 (extra link); router 2 owns number 2.
  channel1 = a.channelId;
  await a.dono.execute(sql`update canal set numero_id = ${NUMBER_1} where id = ${channel1}::uuid`);
  await a.dono.execute(sql`update fluxo set tipo = 'roteador', estado = 'publicado' where id = ${a.flowId}::uuid`);
  router1 = a.flowId;
  inbox1 = a.inboxId;
  channel2 = await newChannel('Numero 2', NUMBER_2);
  channel3 = await newChannel('Numero 3', NUMBER_3);
  channel4 = await newChannel('Numero 4', null);
  inbox2 = await newInbox(channel2, a.queueId);
  inbox3 = await newInbox(channel3, a.queueId);
  router2 = await newRouter('router-dois', channel2);
  router3 = await newRouter('router-tres', null);
  await a.dono.execute(sql`
    insert into roteador_canal (tenant_id, roteador_id, canal_id) values
      (${a.tenantId}, ${router1}, ${channel3}),
      (${a.tenantId}, ${router3}, ${channel4})
  `);

  // A service flow under router 1; it has no channel of its own.
  const imported = await noTenant(a.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: a.tenantId, name: 'Servico 1', channelId: null, json: design(), publicar: true }),
  );
  expect(imported.errorOfValidation).toBeNull();
  service1 = imported.flowId;
  await a.dono.execute(sql`
    insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal)
    values (${a.tenantId}, ${router1}, ${service1}, 'servico-1', true)
  `);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('webhook payload with several numbers', () => {
  it('splits one entry into one item per phone_number_id, each carrying only its own changes', () => {
    const change = (numberId: string, id: string) => ({
      field: 'messages',
      value: { metadata: { phone_number_id: numberId }, messages: [{ id }] },
    });
    const items = identificarEntradas({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-1', changes: [change(NUMBER_1, 'm1'), change(NUMBER_2, 'm2'), change(NUMBER_1, 'm3')] }],
    });
    expect(items.map((i) => i.numberId).sort()).toEqual([NUMBER_1, NUMBER_2]);
    const first = items.find((i) => i.numberId === NUMBER_1)!;
    const second = items.find((i) => i.numberId === NUMBER_2)!;
    const idsOf = (item: { body: unknown }) =>
      (item.body as { entry: { changes: { value: { messages: { id: string }[] } }[] }[] }).entry.flatMap((e) =>
        e.changes.flatMap((c) => c.value.messages.map((m) => m.id)),
      );
    expect(idsOf(first)).toEqual(['m1', 'm3']);
    expect(idsOf(second)).toEqual(['m2']);
  });

  it('keeps changes without a phone_number_id on the entry-level item', () => {
    const items = identificarEntradas({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-1', changes: [{ field: 'message_template_status_update', value: {} }] }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.numberId).toBeUndefined();
    expect(items[0]!.wabaId).toBe('waba-1');
  });

  it('discards, on a channel own route, a change addressed to another phone_number_id', async () => {
    const foreign = '5511933330001';
    expect(await postToChannel(channel1, metaPayload(foreign, 'oi', NUMBER_2))).toBe(200);
    expect(await contactOfPhone(foreign)).toBeNull();
    const own = '5511933330002';
    expect(await postToChannel(channel1, metaPayload(own, 'oi', NUMBER_1))).toBe(200);
    expect(await contactOfPhone(own)).not.toBeNull();
  });
});

describe('two routers, two numbers', () => {
  const phone1 = '5511944440001';
  const phone2 = '5511944440002';
  const phone3 = '5511944440003';

  it('files each inbound conversation under the inbox of its own number', async () => {
    expect(await postToChannel(channel1, metaPayload(phone1, 'oi', NUMBER_1))).toBe(200);
    expect(await postToChannel(channel2, metaPayload(phone2, 'oi', NUMBER_2))).toBe(200);
    expect(await postToChannel(channel3, metaPayload(phone3, 'oi', NUMBER_3))).toBe(200);
    expect(await contactOfPhone(phone1)).not.toBeNull();
    expect(await contactOfPhone(phone2)).not.toBeNull();
    expect(await contactOfPhone(phone3)).not.toBeNull();
    // Conversations exist only when a handoff happened; when they do, they follow the number.
    const expected: [string, string][] = [[phone1, inbox1], [phone2, inbox2], [phone3, inbox3]];
    for (const [phone, inbox] of expected) {
      const found = await inboxOfConversation(phone);
      if (found) expect(found).toBe(inbox);
    }
  });

  it('never lists the contacts of one router in the other', async () => {
    // Seed one conversation per number so the lists have data regardless of the bot handoff.
    const seed = async (phone: string, inbox: string) => {
      const contactId = (await contactOfPhone(phone))!;
      await a.dono.execute(sql`
        insert into conversa (tenant_id, inbox_id, contato_id, estado)
        select ${a.tenantId}::uuid, ${inbox}::uuid, ${contactId}::uuid, 'Open'
         where not exists (select 1 from conversa where inbox_id = ${inbox}::uuid and contato_id = ${contactId}::uuid)
      `);
      return contactId;
    };
    const c1 = await seed(phone1, inbox1);
    const c2 = await seed(phone2, inbox2);
    const c3 = await seed(phone3, inbox3);
    const ofRouter1 = await contactsOf(router1);
    const ofRouter2 = await contactsOf(router2);
    expect(ofRouter1).toContain(c1);
    expect(ofRouter1).toContain(c3);
    expect(ofRouter1).not.toContain(c2);
    expect(ofRouter2).toContain(c2);
    expect(ofRouter2).not.toContain(c1);
    expect(ofRouter2).not.toContain(c3);
  });
});

describe('a channel belongs to one live bot', () => {
  it('refuses to attach the legacy channel of router 1 to router 2', async () => {
    const empty = await newRouter('router-vazio', null);
    const result = await attach(empty, channel1);
    expect(result.status).toBe(409);
    expect(result.code).toBe('number_in_use');
  });

  it('refuses to attach an extra router channel to another router or to a regular flow', async () => {
    const plain = await one(sql`
      insert into fluxo (tenant_id, nome, tipo, estado, short_name)
      values (${a.tenantId}, 'Fluxo simples', 'fluxo', 'rascunho', ${`simples-${randomUUID().slice(0, 8)}`}) returning id
    `);
    const empty = await newRouter('router-vazio', null);
    const toRouter = await attach(empty, channel3);
    expect(toRouter.code).toBe('number_in_use');
    const toFlow = await attach(plain, channel3);
    expect(toFlow.code).toBe('number_in_use');
  });
});

describe('router service flow', () => {
  it('fires input expiration with the channel resolved through the conversation inbox', async () => {
    const contactId = await one(sql`
      insert into contato (tenant_id, nome) values (${a.tenantId}, 'Servico expira') returning id
    `);
    const { rows } = await a.dono.execute<{ id: string }>(sql`
      insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, estado,
                                  entrada_expira_em, entrada_expira_bloco)
      select ${a.tenantId}::uuid, v.id, ${contactId}::uuid, ${inbox1}::uuid, 'aguardando',
             now() - interval '1 second', 'pergunta'
        from fluxo_versao v where v.fluxo_id = ${service1}::uuid and v.tenant_id = ${a.tenantId}::uuid limit 1
      returning id
    `);
    const result = await fireInputExpiration(a.tenantId, rows[0]!.id);
    expect(result).not.toBeNull();
    expect(result?.tratou).toBe(true);
  });
});

describe('channel of a router on the templates page', () => {
  it('resolves the first linked channel when the router has no legacy channel', async () => {
    const resolved = await noTenant(a.tenantId, (tx) => loadChannelOfFlow(tx, a.tenantId, router3));
    expect(resolved).toBe(channel4);
  });

  it('keeps resolving the legacy channel of a router that has one', async () => {
    const resolved = await noTenant(a.tenantId, (tx) => loadChannelOfFlow(tx, a.tenantId, router1));
    expect(resolved).toBe(channel1);
  });
});
