import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Migration 0093: the database itself keeps a channel on at most one live bot. The API already checks this
 * (`botOfChannel` + `lockChannel`); these tests write straight to the tables to prove the backstop. Invented data only.
 */

let a: Cenario;

async function newChannel(label: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, config) values (${a.tenantId}, 'whatsapp_cloud', ${label}, '{}'::jsonb) returning id
  `);
  return rows[0]!.id;
}

async function newFlow(tipo: 'fluxo' | 'roteador', estado: string, channelId: string | null): Promise<string> {
  const mark = randomUUID().slice(0, 8);
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
    values (${a.tenantId}, ${`Guard ${mark}`}, ${tipo}, ${estado}, ${channelId}, ${`guard-${mark}`}) returning id
  `);
  return rows[0]!.id;
}

const addExtra = (routerId: string, channelId: string) =>
  a.dono.execute(sql`insert into roteador_canal (tenant_id, roteador_id, canal_id) values (${a.tenantId}, ${routerId}, ${channelId})`);

/** The Postgres error behind drizzle's "Failed query" wrapper. */
async function pgError(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string };
    return { code: cause.code, constraint: cause.constraint };
  }
  throw new Error('expected the database to reject the write');
}

beforeAll(async () => {
  a = await montarCenario(`guard-${randomUUID().slice(0, 8)}`);
});

afterAll(async () => {
  await a?.encerrar();
});

describe('one published flow per channel', () => {
  it('rejects a second published flow on the same channel', async () => {
    const channel = await newChannel('c1');
    await newFlow('fluxo', 'publicado', channel);
    expect(await pgError(newFlow('fluxo', 'publicado', channel))).toEqual({ code: '23505', constraint: 'fluxo_canal_publicado_uk' });
  });

  it('allows a draft and an archived flow to keep the link next to the published one', async () => {
    const channel = await newChannel('c2');
    await newFlow('fluxo', 'publicado', channel);
    await expect(newFlow('fluxo', 'rascunho', channel)).resolves.toBeTruthy();
    await expect(newFlow('fluxo', 'arquivado', channel)).resolves.toBeTruthy();
  });

  it('rejects publishing a draft whose channel is already held by a published flow', async () => {
    const channel = await newChannel('c3');
    await newFlow('fluxo', 'publicado', channel);
    const draft = await newFlow('fluxo', 'rascunho', channel);
    await expect(
      a.dono.execute(sql`update fluxo set estado = 'publicado' where id = ${draft}::uuid`),
    ).rejects.toThrow();
  });
});

describe('extra router channels', () => {
  it('rejects an extra channel already held by another live flow as its main channel', async () => {
    const channel = await newChannel('c4');
    await newFlow('fluxo', 'publicado', channel);
    const router = await newFlow('roteador', 'rascunho', null);
    expect(await pgError(addExtra(router, channel))).toEqual({ code: '23505', constraint: 'roteador_canal_um_bot' });
  });

  it('rejects an extra channel already extra on another live router', async () => {
    const channel = await newChannel('c5');
    const first = await newFlow('roteador', 'rascunho', null);
    const second = await newFlow('roteador', 'rascunho', null);
    await addExtra(first, channel);
    expect(await pgError(addExtra(second, channel))).toEqual({ code: '23505', constraint: 'roteador_canal_um_bot' });
  });

  it('allows the channel once the previous holder is archived, and the router own main channel', async () => {
    const channel = await newChannel('c6');
    const old = await newFlow('fluxo', 'arquivado', channel);
    expect(old).toBeTruthy();
    const router = await newFlow('roteador', 'publicado', channel);
    // the router itself holding the channel as main does not block its own extra rows
    await expect(addExtra(router, channel)).resolves.toBeTruthy();
  });
});
