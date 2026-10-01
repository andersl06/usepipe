import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { loadHistory } = await import('../src/domain/management/history.js');
const { montarCenario } = await import('./ajuda.js');

const marca = randomUUID().slice(0, 8);
let c: Awaited<ReturnType<typeof montarCenario>>;
const janela = { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + 86_400_000) };

async function encerrada(nome: string) {
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${c.tenantId}, ${nome}) returning id`);
  await c.dono.execute(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, encerrada_em)
    values (${c.tenantId}, ${c.inboxId}, ${rows[0]!.id}, ${c.queueId}, 'encerrada', now())`);
}

beforeAll(async () => {
  c = await montarCenario(`hl-${marca}`);
  await encerrada(`Ana_100% ${marca}`);
  await encerrada(`Anax100 ${marca}`);
}, 60_000);

describe('loadHistory: curingas do LIKE', () => {
  const total = (filtro: { contact?: string; tickets?: string[] }) =>
    noTenant(c.tenantId, (tx) => loadHistory(tx, janela, filtro)).then((r) => r.total);

  it('% e _ digitados no contato não casam com tudo', async () => {
    expect(await total({ contact: `Ana_100% ${marca}` })).toBe(1);
    expect(await total({ contact: `Ana%${marca}` })).toBe(0);
    expect(await total({ contact: `Ana_00% ${marca}` })).toBe(0);
  });

  it('% e _ digitados no ticket não casam com tudo', async () => {
    expect(await total({ tickets: ['%'] })).toBe(0);
    expect(await total({ tickets: ['______'] })).toBe(0);
  });
});
