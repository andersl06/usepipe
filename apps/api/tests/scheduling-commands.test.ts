import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { matchCommand, type CommandRequest } from '@pipe/core';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { executeCommand } = await import('../src/domain/engine-services.js');
const { databaseMessagingEffects } = await import('../src/domain/scheduling-commands.js');
const { dueScheduledMessages, fireScheduledMessage } = await import('../src/domain/scheduled-messages.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type Response = { method: string; status: string; type?: string; resource?: unknown; reason?: { code: number } };

/**
 * P7 over the real tables (migration 0053 + `lista_distribuicao`): scheduler, broadcast lists,
 * event-track and click tracker through `executeCommand`, and the scheduled send through the
 * normal outbound path (`mensagem` + `outbox_mensagem`), to a contact and to a list.
 */

let a: Cenario;
let b: Cenario;

beforeEach(async () => {
  a = await montarCenario(`p7-a-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`p7-b-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterEach(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

const noTickets = new Proxy({}, {
  get: () => () => {
    throw new Error('ticket effect not expected');
  },
}) as Parameters<typeof executeCommand>[4];

async function newFlow(c: Cenario): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, short_name)
    values (${c.tenantId}, 'Notificações', 'fluxo', 'publicado', ${`notif-${randomUUID().slice(0, 6)}`}) returning id
  `);
  return rows[0]!.id;
}

/** A WhatsApp contact; with `open`, an open conversation whose 24 h window is running. */
async function newContact(c: Cenario, phone: string, open: boolean): Promise<string> {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164) values (${c.tenantId}, 'Cliente', ${`+${phone}`}) returning id
  `);
  const contactId = rows[0]!.id;
  await c.dono.execute(sql`
    insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
    values (${c.tenantId}, ${contactId}, 'whatsapp_cloud', ${phone})
  `);
  await c.dono.execute(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado, criada_em, janela_expira_em, ultima_mensagem_em)
    values (${c.tenantId}, ${c.inboxId}, ${contactId}, ${open ? 'Waiting' : 'ClosedAttendant'}, now(),
            ${open ? sql`now() + interval '20 hours'` : sql`null`}, now())
  `);
  return contactId;
}

function run(c: Cenario, flowId: string, contactId: string, to: string, method: string, uri: string, resource: unknown = null): Promise<Response> {
  const command = matchCommand({ to, method, uri });
  if (!command) throw new Error(`sem rota: ${uri}`);
  const request: CommandRequest = { uri, method: method.toUpperCase(), resource, command, flowId };
  const messaging = databaseMessagingEffects({ tenantId: c.tenantId, flowId, contactId });
  return noTenant(c.tenantId, (tx) => executeCommand(tx, c.tenantId, request, true, noTickets, undefined, messaging)) as Promise<Response>;
}

const SCHEDULER = 'postmaster@scheduler.msging.net';
const BROADCAST = 'postmaster@broadcast.msging.net';
const ANALYTICS = 'postmaster@analytics.msging.net';
const CLICKTRACKER = 'postmaster@clicktracker.msging.net';

async function botMessages(c: Cenario, contactId: string): Promise<{ conteudo: string | null; outbox: number }[]> {
  const { rows } = await c.dono.execute<{ conteudo: string | null; outbox: number }>(sql`
    select m.conteudo, (select count(*)::int from outbox_mensagem o where o.mensagem_id = m.id) as outbox
      from mensagem m join conversa cv on cv.id = m.conversa_id
     where cv.contato_id = ${contactId} and m.direcao = 'saida'
  `);
  return rows;
}

describe('broadcast lists', () => {
  it("adds the tenant's contacts by channel identity, lists them and refuses unknown contacts", async () => {
    const flowId = await newFlow(a);
    const ana = await newContact(a, '5511900000001', true);
    const bia = await newContact(a, '5511900000002', true);
    const deOutroTenant = await newContact(b, '5511900000003', true);

    expect(await run(a, flowId, ana, BROADCAST, 'set', '/lists', { identity: 'alunos@broadcast.msging.net' })).toMatchObject({ status: 'success' });
    await run(a, flowId, ana, BROADCAST, 'set', '/lists/alunos@broadcast.msging.net/recipients', '5511900000001@wa.gw.msging.net');
    await run(a, flowId, ana, BROADCAST, 'set', '/lists/alunos@broadcast.msging.net/recipients', { identity: bia });
    expect(await run(a, flowId, ana, BROADCAST, 'set', '/lists/alunos@broadcast.msging.net/recipients', deOutroTenant)).toMatchObject({
      status: 'failure',
      reason: { code: 67 },
    });

    const list = await run(a, flowId, ana, BROADCAST, 'get', '/lists/alunos@broadcast.msging.net/recipients');
    expect(list.resource).toEqual({
      total: 2,
      itemType: 'application/vnd.lime.identity',
      items: ['5511900000001@wa.gw.msging.net', '5511900000002@wa.gw.msging.net'],
    });
    expect(await run(a, flowId, ana, BROADCAST, 'delete', '/lists/alunos@broadcast.msging.net/recipients/5511900000002@wa.gw.msging.net')).toMatchObject({
      status: 'success',
    });
    expect(((await run(a, flowId, ana, BROADCAST, 'get', '/lists')).resource as { items: string[] }).items).toEqual(['alunos@broadcast.msging.net']);
    // Another tenant does not see the list.
    const flowB = await newFlow(b);
    expect(await run(b, flowB, deOutroTenant, BROADCAST, 'get', '/lists/alunos@broadcast.msging.net')).toMatchObject({ reason: { code: 67 } });
  });
});

describe('scheduler', () => {
  it('stores, reads, reschedules and cancels a schedule by its message id', async () => {
    const flowId = await newFlow(a);
    const ana = await newContact(a, '5511900000011', true);
    const when = new Date(Date.now() + 3_600_000).toISOString();
    const resource = { when, message: { id: 'lembrete-1', type: 'text/plain', content: 'Amanhã tem aula.' } };
    expect(await run(a, flowId, ana, SCHEDULER, 'set', '/schedules', resource)).toEqual({ method: 'set', status: 'success' });
    expect(await run(a, flowId, ana, SCHEDULER, 'get', '/schedules/lempete-inexistente')).toMatchObject({ reason: { code: 67 } });
    const read = await run(a, flowId, ana, SCHEDULER, 'get', '/schedules/lembrete-1');
    expect(read).toMatchObject({
      type: 'application/vnd.iris.schedule+json',
      resource: { when, status: 'scheduled', message: { id: 'lembrete-1', to: ana, content: 'Amanhã tem aula.' } },
    });

    const later = new Date(Date.now() + 7_200_000).toISOString();
    await run(a, flowId, ana, SCHEDULER, 'set', '/schedules', { ...resource, when: later });
    const { rows } = await a.dono.execute<{ n: number }>(sql`select count(*)::int as n from agendamento_mensagem where tenant_id = ${a.tenantId}`);
    expect(rows[0]!.n).toBe(1);
    expect((await run(a, flowId, ana, SCHEDULER, 'get', '/schedules/lembrete-1')).resource).toMatchObject({ when: later });

    expect(await run(a, flowId, ana, SCHEDULER, 'delete', '/schedules/lembrete-1')).toEqual({ method: 'delete', status: 'success' });
    expect((await run(a, flowId, ana, SCHEDULER, 'get', '/schedules/lembrete-1')).resource).toMatchObject({ status: 'canceled' });
    expect(await dueScheduledMessages()).not.toContainEqual(expect.objectContaining({ tenantId: a.tenantId }));
  });

  it('fires a due text schedule through the outbound path once, and only when due', async () => {
    const flowId = await newFlow(a);
    const ana = await newContact(a, '5511900000021', true);
    await run(a, flowId, ana, SCHEDULER, 'set', '/schedules', {
      when: new Date(Date.now() + 3_600_000).toISOString(),
      message: { id: 'futuro', type: 'text/plain', content: 'Ainda não.' },
    });
    await run(a, flowId, ana, SCHEDULER, 'set', '/schedules', {
      when: new Date(Date.now() - 1_000).toISOString(),
      message: { id: 'agora', to: '5511900000021@wa.gw.msging.net', type: 'text/plain', content: 'Sua aula começou.' },
    });
    const due = (await dueScheduledMessages(1_000)).filter((d) => d.tenantId === a.tenantId);
    expect(due).toHaveLength(1);

    const outcomes = await fireScheduledMessage(a.tenantId, due[0]!.scheduleId);
    expect(outcomes).toEqual([expect.objectContaining({ contactId: ana, sent: true })]);
    expect(await botMessages(a, ana)).toEqual([{ conteudo: 'Sua aula começou.', outbox: 1 }]);
    // At most once: firing again does nothing.
    expect(await fireScheduledMessage(a.tenantId, due[0]!.scheduleId)).toBeNull();
    expect((await run(a, flowId, ana, SCHEDULER, 'get', '/schedules/agora')).resource).toMatchObject({ status: 'executed' });
  });

  it('sends to every contact of a `{list}@broadcast.msging.net` and records who failed', async () => {
    const flowId = await newFlow(a);
    const ana = await newContact(a, '5511900000031', true);
    const semConversa = await newContact(a, '5511900000032', false);
    for (const contact of [ana, semConversa]) {
      await run(a, flowId, ana, BROADCAST, 'set', '/lists/turma@broadcast.msging.net/recipients', contact);
    }
    await run(a, flowId, ana, SCHEDULER, 'set', '/schedules', {
      when: new Date(Date.now() - 1_000).toISOString(),
      message: { id: 'aviso-turma', to: 'turma@broadcast.msging.net', type: 'text/plain', content: 'Aviso da turma.' },
    });
    const { rows } = await a.dono.execute<{ id: string }>(sql`select id from agendamento_mensagem where mensagem_id = 'aviso-turma' and tenant_id = ${a.tenantId}`);
    const outcomes = await fireScheduledMessage(a.tenantId, rows[0]!.id);
    expect(outcomes).toEqual([
      expect.objectContaining({ contactId: ana, sent: true }),
      expect.objectContaining({ contactId: semConversa, sent: false }),
    ]);
    expect(await botMessages(a, ana)).toHaveLength(1);
    expect(await botMessages(a, semConversa)).toHaveLength(0);
  });

  it('opens a conversation with a WhatsApp template when the contact has none open', async () => {
    const flowId = await newFlow(a);
    const bia = await newContact(a, '5511900000041', false);
    await a.dono.execute(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo, status_meta, cabecalho_tipo)
      values (${a.tenantId}, ${a.channelId}, 'lembrete_de_aula', 'pt_BR', 'utilidade', 'Olá {{1}}, sua aula é amanhã.', 'aprovado', 'nenhum')
    `);
    await run(a, flowId, bia, SCHEDULER, 'set', '/schedules', {
      when: new Date(Date.now() - 1_000).toISOString(),
      message: {
        id: 'template-1',
        type: 'application/json',
        content: {
          type: 'template',
          template: { name: 'lembrete_de_aula', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Bia' }] }] },
        },
      },
    });
    const { rows } = await a.dono.execute<{ id: string }>(sql`select id from agendamento_mensagem where mensagem_id = 'template-1' and tenant_id = ${a.tenantId}`);
    expect(await fireScheduledMessage(a.tenantId, rows[0]!.id)).toEqual([expect.objectContaining({ contactId: bia, sent: true })]);
    expect(await botMessages(a, bia)).toEqual([{ conteudo: 'Olá Bia, sua aula é amanhã.', outbox: 1 }]);
  });
});

describe('event-track and click tracker', () => {
  it('records events per tenant and reuses one short link per destination', async () => {
    const flowId = await newFlow(a);
    const ana = await newContact(a, '5511900000051', true);
    await run(a, flowId, ana, ANALYTICS, 'set', '/event-track', { category: 'notificacao', action: 'agendada' });
    await run(a, flowId, ana, ANALYTICS, 'set', '/event-track', { category: 'notificacao', action: 'agendada', extras: { origem: 'bot' } });
    const counts = await run(a, flowId, ana, ANALYTICS, 'get', '/event-track/notificacao');
    expect((counts.resource as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ category: 'notificacao', action: 'agendada', count: 2 }),
    ]);
    const flowB = await newFlow(b);
    const other = await newContact(b, '5511900000052', true);
    expect(((await run(b, flowB, other, ANALYTICS, 'get', '/event-track/notificacao')).resource as { total: number }).total).toBe(0);

    const first = await run(a, flowId, ana, CLICKTRACKER, 'set', '/entrypoint/encode', { url: 'https://exemplo.com.br/aula' });
    const second = await run(a, flowId, ana, CLICKTRACKER, 'set', '/entrypoint/encode', 'https://exemplo.com.br/aula');
    expect(first).toMatchObject({ status: 'success', type: 'text/plain' });
    expect(second.resource).toBe(first.resource);
    expect(await run(a, flowId, ana, CLICKTRACKER, 'set', '/entrypoint/encode', { url: 'http://127.0.0.1/x' })).toMatchObject({ reason: { code: 64 } });
  });
});
