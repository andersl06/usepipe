import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The queue mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { noTenant, forgetChannel } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const widget = await import('../src/domain/widget.js');
const { WidgetController } = await import('../src/controllers/widget.js');
const { WidgetChannelsController } = await import('../src/controllers/widget-channels.js');
const { corsOptionsFor } = await import('../src/servidor.js');
const { withinRateLimit } = await import('../src/rate-limit.js');
const { processarOutbox } = await import('@pipe/workers');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Pipe Chat API: provisioning, the visitor round trip through the shared inbound path, and the security gates of the public routes. Invented data only.
 */

const ORIGIN = 'https://site.exemplo.com';
const controller = new WidgetController();

let a: Cenario;
let b: Cenario;
let channelId: string;
let key: string;
let secret: string;
let otherKey: string;

function request(origin: string | undefined, ip = '203.0.113.7') {
  return { headers: origin === undefined ? {} : { origin }, ip };
}

async function rejection(fn: () => Promise<unknown>): Promise<{ status: number; codigo: string }> {
  try {
    await fn();
  } catch (error) {
    return error as { status: number; codigo: string };
  }
  throw new Error('expected a rejection');
}

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

/** The first visitor message moves `inicio` into `resposta`, which answers and waits again. */
function design() {
  return {
    flow: {
      inicio: block('inicio', {
        root: true,
        $contentActions: [{ input: { bypass: false } }],
        $defaultOutput: { stateId: 'resposta' },
      }),
      resposta: block('resposta', {
        $contentActions: [say('Ola, eu sou o bot do chat.'), { input: { bypass: false } }],
        $defaultOutput: { stateId: 'resposta' },
      }),
    },
    globals: {},
  };
}

async function newVisitor(): Promise<{ visitorId: string; token: string }> {
  const session = await controller.session(key, undefined, request(ORIGIN, `198.51.100.${Math.floor(Math.random() * 200)}`));
  return { visitorId: session.visitorId, token: session.token };
}

beforeAll(async () => {
  a = await montarCenario(`wg-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`wh-${randomUUID().slice(0, 8)}`);
  const created = await widget.createWidgetChannel(a.tenantId, a.agentId, {
    name: 'Chat do site',
    allowedOrigins: [`${ORIGIN}/`, 'HTTPS://Site.Exemplo.com'],
    greeting: 'Como podemos ajudar?',
  });
  channelId = created.id;
  key = created.widgetKey;
  const { rows } = await a.dono.execute<{ config: Record<string, string> }>(
    sql`select config from canal where id = ${channelId}::uuid`,
  );
  secret = rows[0]!.config['widgetSecret']!;
  const other = await widget.createWidgetChannel(b.tenantId, b.agentId, { allowedOrigins: [ORIGIN] });
  otherKey = other.widgetKey;
  const flow = await noTenant(a.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: a.tenantId, name: 'Bot do chat', channelId, json: design(), publicar: true }),
  );
  expect(flow.errorOfValidation).toBeNull();
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

describe('provisioning', () => {
  it('returns a 32-hex key, normalized origins and the greeting, and never the secret', async () => {
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    const [listed] = await widget.listWidgetChannels(a.tenantId);
    expect(listed!.allowedOrigins).toEqual([ORIGIN]);
    expect(listed!.greeting).toBe('Como podemos ajudar?');
    expect(JSON.stringify(listed)).not.toContain('widgetSecret');
  });

  it('stores the secret encrypted at rest', () => {
    expect(secret).toBeTruthy();
    expect(secret).not.toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects origins that are not scheme://host[:port]', async () => {
    for (const bad of ['ftp://x.com', 'site.com', 'https://x.com/path', 'javascript:alert(1)']) {
      const error = await rejection(() => widget.updateWidgetChannel(a.tenantId, a.agentId, channelId, { allowedOrigins: [bad] }));
      expect(error.status).toBe(422);
    }
  });

  it('rotates the public key', async () => {
    const created = await widget.createWidgetChannel(a.tenantId, a.agentId, { allowedOrigins: [ORIGIN] });
    const rotated = await widget.updateWidgetChannel(a.tenantId, a.agentId, created.id, { rotateKey: true });
    expect(rotated.widgetKey).not.toBe(created.widgetKey);
    expect(await widget.resolveWidgetChannel(created.widgetKey)).toBeNull();
    expect((await widget.resolveWidgetChannel(rotated.widgetKey))?.id).toBe(created.id);
  });

  it('resolves only active widget channels by key', async () => {
    expect((await widget.resolveWidgetChannel(key))?.tenantId).toBe(a.tenantId);
    expect(await widget.resolveWidgetChannel('0'.repeat(32))).toBeNull();
    expect(await widget.resolveWidgetChannel('not-a-key')).toBeNull();
    const created = await widget.createWidgetChannel(a.tenantId, a.agentId, { allowedOrigins: [ORIGIN] });
    await a.dono.execute(sql`update canal set ativo = false where id = ${created.id}::uuid`);
    forgetChannel(created.id);
    expect(await widget.resolveWidgetChannel(created.widgetKey)).toBeNull();
  });

  it('keeps tokens deterministic per visitor', () => {
    expect(widget.visitorToken('s', 'v1')).toBe(widget.visitorToken('s', 'v1'));
    expect(widget.visitorToken('s', 'v1')).not.toBe(widget.visitorToken('s', 'v2'));
  });

  it('limits calls per key within the window', () => {
    const k = `t:${randomUUID()}`;
    expect([withinRateLimit(k, 2, 60_000), withinRateLimit(k, 2, 60_000), withinRateLimit(k, 2, 60_000)]).toEqual([true, true, false]);
  });

  it('denies the management controller to users without the channel permission', async () => {
    const admin = new WidgetChannelsController();
    const fake = { session: { tenantId: a.tenantId, userId: a.agentId } } as never;
    await expect(admin.list(fake)).rejects.toMatchObject({ status: 403 });
    await expect(admin.create(fake, { allowedOrigins: [ORIGIN] })).rejects.toMatchObject({ status: 403 });
  });
});

describe('visitor round trip', () => {
  it('opens a session, reaches the linked bot through the inbound path and polls the reply', async () => {
    const session = await controller.session(key, undefined, request(ORIGIN));
    expect(session).toMatchObject({ greeting: 'Como podemos ajudar?', channelName: 'Chat do site' });
    expect(session.visitorId).toMatch(/^[0-9a-f-]{36}$/);

    const accepted = await controller.send(key, { visitorId: session.visitorId, token: session.token, text: 'oi' }, request(ORIGIN));
    expect(accepted).toEqual({ accepted: true });

    const { rows } = await a.dono.execute<{ tenant_id: string }>(sql`
      select tenant_id from contato_identidade where canal_tipo = 'widget' and identificador = ${session.visitorId}
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(a.tenantId);

    const { data } = await controller.poll(key, session.visitorId, session.token, undefined, request(ORIGIN));
    expect(data.map((m) => [m.direction, m.text])).toEqual([
      ['in', 'oi'],
      ['out', 'Ola, eu sou o bot do chat.'],
    ]);

    const last = data[data.length - 1]!;
    const after = await controller.poll(key, session.visitorId, session.token, last.createdAt, request(ORIGIN));
    expect(after.data).toEqual([]);
  });

  it('reuses a valid visitor pair and mints a new one for an invalid pair', async () => {
    const first = await newVisitor();
    const again = await controller.session(key, first, request(ORIGIN));
    expect(again.visitorId).toBe(first.visitorId);
    const forged = await controller.session(key, { visitorId: first.visitorId, token: 'bad' }, request(ORIGIN));
    expect(forged.visitorId).not.toBe(first.visitorId);
  });

  it('keeps visitors isolated from each other', async () => {
    const v1 = await newVisitor();
    const v2 = await newVisitor();
    await controller.send(key, { ...v1, text: 'segredo do visitante 1' }, request(ORIGIN));
    const own = await controller.poll(key, v1.visitorId, v1.token, undefined, request(ORIGIN));
    expect(own.data.some((m) => m.text === 'segredo do visitante 1')).toBe(true);
    const other = await controller.poll(key, v2.visitorId, v2.token, undefined, request(ORIGIN));
    expect(other.data).toEqual([]);
    const cross = await rejection(() => controller.poll(key, v1.visitorId, v2.token, undefined, request(ORIGIN)));
    expect(cross.status).toBe(404);
  });

  it('stores visitor HTML verbatim and returns it as a plain string', async () => {
    const v = await newVisitor();
    const html = '<img src=x onerror=alert(1)>';
    await controller.send(key, { ...v, text: html }, request(ORIGIN));
    const { data } = await controller.poll(key, v.visitorId, v.token, undefined, request(ORIGIN));
    expect(data[0]!.text).toBe(html);
    expect(typeof data[0]!.text).toBe('string');
  });
});

describe('security gates', () => {
  it('returns 404 for an unknown key and never resolves another tenant from client input', async () => {
    const error = await rejection(() => controller.session('0'.repeat(32), undefined, request(ORIGIN)));
    expect(error.status).toBe(404);
    // A visitor token minted for tenant A's channel is worthless on tenant B's channel.
    const v = await newVisitor();
    const crossTenant = await rejection(() => controller.send(otherKey, { ...v, text: 'oi' }, request(ORIGIN)));
    expect(crossTenant.status).toBe(404);
  });

  it('returns 403 when the Origin is missing or not allow-listed', async () => {
    expect((await rejection(() => controller.session(key, undefined, request(undefined)))).status).toBe(403);
    expect((await rejection(() => controller.session(key, undefined, request('https://evil.example')))).status).toBe(403);
    expect((await rejection(() => controller.session(key, undefined, request('http://site.exemplo.com')))).status).toBe(403);
  });

  it('returns 404 for a wrong visitor token', async () => {
    const v = await newVisitor();
    expect((await rejection(() => controller.send(key, { visitorId: v.visitorId, token: 'x'.repeat(64), text: 'oi' }, request(ORIGIN)))).status).toBe(404);
    expect((await rejection(() => controller.poll(key, v.visitorId, 'short', undefined, request(ORIGIN)))).status).toBe(404);
    expect((await rejection(() => controller.poll(key, 'not-a-uuid', v.token, undefined, request(ORIGIN)))).status).toBe(404);
  });

  it('returns 400 for empty or oversized text', async () => {
    const v = await newVisitor();
    expect((await rejection(() => controller.send(key, { ...v, text: '   ' }, request(ORIGIN)))).status).toBe(400);
    expect((await rejection(() => controller.send(key, { ...v, text: 'a'.repeat(2001) }, request(ORIGIN)))).status).toBe(400);
    await expect(controller.send(key, { ...v, text: 'a'.repeat(2000) }, request(ORIGIN))).resolves.toEqual({ accepted: true });
  });

  it('returns 429 after 30 requests per key and IP in a minute', async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 30; i++) await controller.session(key, undefined, request(ORIGIN, ip));
    const error = await rejection(() => controller.session(key, undefined, request(ORIGIN, ip)));
    expect(error.status).toBe(429);
    // Another IP is unaffected.
    await expect(controller.session(key, undefined, request(ORIGIN, '192.0.2.250'))).resolves.toBeTruthy();
  });

  it('never reads a session: the controller has no session guard', async () => {
    const withCookie = { headers: { origin: ORIGIN, cookie: 'pipe_session=abc' }, ip: '198.51.100.250' };
    await expect(controller.session(key, undefined, withCookie)).resolves.toBeTruthy();
  });
});

describe('CORS delegate', () => {
  it('opens widget paths without credentials and keeps the app options for everything else', () => {
    const widgetOptions = corsOptionsFor('/v1/widget/abc/messages');
    expect(widgetOptions).toMatchObject({ origin: true, credentials: false, allowedHeaders: ['content-type'] });
    const app = corsOptionsFor('/v1/conversations');
    expect(app.credentials).toBe(true);
    expect(typeof app.origin).toBe('function');
    expect(corsOptionsFor(undefined).credentials).toBe(true);
  });
});

describe('delivery of widget replies', () => {
  it('marks widget outbox rows as sent without calling the WhatsApp client', async () => {
    const v = await newVisitor();
    await controller.send(key, { ...v, text: 'entrega' }, request(ORIGIN));
    const results = await processarOutbox();
    const { rows } = await a.dono.execute<{ id: string; estado_entrega: string; id_provedor: string | null }>(sql`
      select m.id, m.estado_entrega, m.id_provedor
        from mensagem m
        join execucao_fluxo ex on ex.id = m.execucao_id
        join contato_identidade ci on ci.contato_id = ex.contato_id and ci.canal_tipo = 'widget'
       where ci.identificador = ${v.visitorId} and m.direcao = 'saida'
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.estado_entrega).toBe('enviada');
      expect(row.id_provedor).toBe(row.id);
    }
    expect(results.filter((r) => r.state === 'falhou')).toEqual([]);
  });
});
