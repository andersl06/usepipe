import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { noTenant } = await import('../src/database.js');
const { loadHistory } = await import('../src/domain/management/history.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/** The history reads who closed a ticket from `evento.dados.encerrada_por` (and the old `closedBy` key). */
let c: Cenario;
const T0 = new Date();
const MIN = 60_000;

beforeAll(async () => {
  c = await montarCenario(`ck-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

/** Assigned conversation closed with `dados`; returns the history status. */
async function statusFor(dados: Record<string, unknown>): Promise<string | null> {
  const { rows: ct } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${c.tenantId}::uuid, 'Cli') returning id
  `);
  const fim = new Date(T0.getTime() - MIN);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em, encerrada_em)
    values (${c.tenantId}::uuid, ${c.inboxId}::uuid, ${ct[0]!.id}::uuid, ${c.queueId}::uuid, 'ClosedAttendant', ${new Date(T0.getTime() - 10 * MIN)}, ${fim})
    returning id
  `);
  const id = rows[0]!.id;
  const evento = (tipo: string, em: Date, d: Record<string, unknown>) => c.dono.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, em, fila_id, dados)
    values (${c.tenantId}::uuid, ${id}::uuid, ${tipo}, ${em}, ${c.queueId}::uuid, ${JSON.stringify(d)}::jsonb)
  `);
  await evento('criada', new Date(T0.getTime() - 10 * MIN), {});
  await evento('atribuida', new Date(T0.getTime() - 9 * MIN), {});
  await evento('encerrada', fim, dados);
  const { linhas } = await noTenant(c.tenantId, (tx) =>
    loadHistory(tx, { start: new Date(T0.getTime() - 2 * MIN), end: new Date(T0.getTime() + MIN) }, {}, { limit: 100, offset: 0 }),
  );
  return linhas.find((l) => l.id === id)?.status ?? null;
}

describe('origem do encerramento no histórico', () => {
  it('encerrada_por=atendente classifica como finalizada', async () => {
    expect(await statusFor({ encerrada_por: 'atendente' })).toBe('finalizada');
  });

  it('linhas antigas com closedBy continuam lidas', async () => {
    expect(await statusFor({ closedBy: 'atendente' })).toBe('finalizada');
  });

  it('inatividade de conversa atribuída é abandonada', async () => {
    expect(await statusFor({ encerrada_por: 'inatividade' })).toBe('abandonada');
  });
});
