import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { lastAttendance, ticketOfConversation } = await import('../src/domain/flow.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * The `Ticket` the engine exposes as `{{ticket.*}}` carries the same numbers as the Desk, the bridge
 * and the Desk commands: `sequentialId` is `numero_sequencial` (never a count by `criada_em`),
 * `parentSequentialId` is the origin ticket of a transfer, and a transferred ticket is closed.
 */

let cenario: Cenario;
let contatoId: string;

beforeAll(async () => {
  cenario = await montarCenario(`ticket-seq-${randomUUID().slice(0, 8)}`);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente do ticket', '+5511933332222') returning id
  `);
  contatoId = rows[0]!.id;
  // A ticket dated far in the future and created first: it takes number 1 while every later ticket
  // sorts before it by `criada_em`, so a count by `criada_em` and the stored number disagree.
  await ticket('Open', { criadaEm: '2100-01-01T00:00:00Z' });
}, 180_000);

afterAll(async () => {
  await cenario?.encerrar();
});

async function ticket(
  estado: string,
  options: { criadaEm?: string; paiId?: string; encerrada?: boolean } = {},
): Promise<{ id: string; numero: number }> {
  const { rows } = await cenario.dono.execute<{ id: string; numero: number }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, estado, criada_em, conversa_pai_id,
      encerrada_em, janela_expira_em
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.queueId}, ${estado},
      ${options.criadaEm ?? new Date().toISOString()}::timestamptz, ${options.paiId ?? null}::uuid,
      ${options.encerrada ? sql`now()` : null}, now() + interval '20 hours'
    )
    returning id, numero_sequencial::int as numero
  `);
  return rows[0]!;
}

async function documento(id: string): Promise<Record<string, unknown>> {
  return noTenant(cenario.tenantId, (tx) => ticketOfConversation(tx, id));
}

describe('{{ticket.*}} ids follow the stored ticket number', () => {
  it('sequentialId is numero_sequencial, not a count by criada_em', async () => {
    const t = await ticket('Open');
    const { rows } = await cenario.dono.execute<{ contagem: number }>(sql`
      select count(*)::int as contagem from conversa c2
       where c2.tenant_id = ${cenario.tenantId}::uuid
         and (c2.criada_em, c2.id) <= ((select criada_em from conversa where id = ${t.id}::uuid), ${t.id}::uuid)
    `);
    // The scenario really makes the two numberings diverge.
    expect(rows[0]!.contagem).not.toBe(t.numero);

    const doc = await documento(t.id);
    expect(doc['sequentialId']).toBe(t.numero);
    expect(doc['parentSequentialId']).toBeNull();
  });

  it('a child ticket exposes the sequential number of the ticket it came from', async () => {
    const pai = await ticket('Transferred', { encerrada: true });
    const filho = await ticket('Waiting', { paiId: pai.id });

    const doc = await documento(filho.id);
    expect(doc['sequentialId']).toBe(filho.numero);
    expect(doc['parentSequentialId']).toBe(pai.numero);
  });

  it.each([
    ['Waiting', false],
    ['Assigned', false],
    ['Open', false],
    ['ClosedAttendant', true],
    ['ClosedClient', true],
    ['ClosedClientInactivity', true],
    ['Transferred', true],
  ])('closed is true only for terminal states (%s)', async (estado, fechado) => {
    const t = await ticket(estado, { encerrada: fechado });
    const doc = await documento(t.id);
    expect(doc['status']).toBe(estado);
    expect(doc['closed']).toBe(fechado);
  });

  it("the contact's last closed attendance (closed-ticket input) uses the same numbers", async () => {
    const outro = await cenario.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164)
      values (${cenario.tenantId}, 'Outro cliente', '+5511933331111') returning id
    `);
    const contato = outro.rows[0]!.id;
    const inserir = async (estado: string, paiId: string | null) => {
      const { rows } = await cenario.dono.execute<{ id: string; numero: number }>(sql`
        insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em, conversa_pai_id, encerrada_em, janela_expira_em)
        values (${cenario.tenantId}, ${cenario.inboxId}, ${contato}, ${cenario.queueId}, ${estado},
                '2000-01-01T00:00:00Z'::timestamptz, ${paiId}::uuid, now(), now() + interval '20 hours')
        returning id, numero_sequencial::int as numero
      `);
      return rows[0]!;
    };
    const pai = await inserir('Transferred', null);
    const filho = await inserir('ClosedClient', pai.id);

    const recente = await noTenant(cenario.tenantId, (tx) => lastAttendance(tx, contato, null, randomUUID()));
    expect(recente.id).toBe(filho.id);
    expect(recente.sequentialId).toBe(filho.numero);
    expect(recente.parentSequentialId).toBe(pai.numero);
    expect(recente.status).toBe('ClosedAttendant');
  });
});
