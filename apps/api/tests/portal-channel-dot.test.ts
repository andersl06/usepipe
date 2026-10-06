import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { carregarGradeDoPortal } = await import('../src/domain/management-flow.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/** The portal card tells whether a bot has an active channel, so a router with one stops showing as unpublished. */

let a: Cenario;

async function newChannel(label: string, active: boolean): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, config, ativo)
    values (${a.tenantId}, 'whatsapp_cloud', ${label}, '{}'::jsonb, ${active}) returning id
  `);
  return rows[0]!.id;
}

async function newRouter(label: string, channelId: string | null): Promise<string> {
  const mark = randomUUID().slice(0, 8);
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
    values (${a.tenantId}, ${`${label} ${mark}`}, 'roteador', 'rascunho', ${channelId}, ${`${label}-${mark}`}) returning id
  `);
  return rows[0]!.id;
}

const portal = async () =>
  (await noTenant(a.tenantId, (tx) => carregarGradeDoPortal(tx, { search: '', page: 1, byPage: 120 }))).flows;

beforeAll(async () => {
  a = await montarCenario(`dot-${randomUUID().slice(0, 8)}`);
});

afterAll(async () => {
  await a?.encerrar();
});

describe('portal grid canalAtivo', () => {
  it('is false for a router with no channel', async () => {
    const id = await newRouter('semcanal', null);
    expect((await portal()).find((f) => f.id === id)?.canalAtivo).toBe(false);
  });

  it('is true for a router with an active main channel', async () => {
    const id = await newRouter('principal', await newChannel('c-ativo', true));
    expect((await portal()).find((f) => f.id === id)?.canalAtivo).toBe(true);
  });

  it('is false when the only channel is inactive', async () => {
    const id = await newRouter('inativo', await newChannel('c-inativo', false));
    expect((await portal()).find((f) => f.id === id)?.canalAtivo).toBe(false);
  });

  it('is true for a router whose only active channel is an extra one', async () => {
    const id = await newRouter('extra', null);
    const channel = await newChannel('c-extra', true);
    await a.dono.execute(sql`insert into roteador_canal (tenant_id, roteador_id, canal_id) values (${a.tenantId}, ${id}, ${channel})`);
    expect((await portal()).find((f) => f.id === id)?.canalAtivo).toBe(true);
  });
});
