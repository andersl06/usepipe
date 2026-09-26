import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/cliente.js';
import type { DatabasePipe } from '../src/cliente.js';
import { migrate } from '../src/migrate.js';
import { garantirRoleOfAccount, seed } from '../src/seed.js';
import { URL_DONO } from './ajuda.js';

/**
 * `semear` and `garantirPapelDeConta` assign every seeded user an ACCOUNT role (the "exactly one" rule from migration 0021). Repeated runs neither duplicate roles nor replace a manually assigned one. This fixed the gap that left the contract Members screen empty in the demo tenant.
 */

let dono: DatabasePipe;
let slug: string;
let tenantId: string;

beforeAll(async () => {
  await migrate(URL_DONO);
  dono = createDatabase({ url: URL_DONO, maxConnections: 2 });
  slug = `semente-${randomUUID().slice(0, 8)}`;
  tenantId = (await seed(dono, { name: `Semente ${slug}`, slug })).tenantId;
}, 120_000);

afterAll(async () => {
  await dono.execute(sql`delete from tenant where id = ${tenantId}::uuid`);
  await closeDatabase(dono);
});

async function papeisOfAccount(userId: string): Promise<string[]> {
  const { rows } = await dono.execute<{ nome: string }>(sql`
    select p.nome from usuario_papel up
      join papel p on p.id = up.papel_id
     where up.usuario_id = ${userId}::uuid and up.escopo = 'conta'
     order by p.nome
  `);
  return rows.map((r) => r.nome);
}

async function createUser(roleOfAttendance: string | null): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}, 'Pessoa', ${`pessoa-${randomUUID().slice(0, 8)}@semente.pipe.app`})
    returning id
  `);
  const userId = rows[0]!.id;
  if (roleOfAttendance) {
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      select ${tenantId}, ${userId}::uuid, id, 'atendimento'
        from papel where tenant_id = ${tenantId}::uuid and nome = ${roleOfAttendance}
    `);
  }
  return userId;
}

describe('Assign account roles to every seeded user', () => {
  it('Assign account roles to users who have none, following migration 0021', async () => {
    const agent = await createUser('atendente');
    const gestor = await createUser('gestor');
    const administrador = await createUser('administrador');
    const semNada = await createUser(null);

    const data = await garantirRoleOfAccount(dono, tenantId);
    expect(data).toBe(4);

    expect(await papeisOfAccount(agent)).toEqual(['guest']);
    // O gestor edita fluxo (`automacao.fluxo.editar`) → `member`.
    expect(await papeisOfAccount(gestor)).toEqual(['member']);
    expect(await papeisOfAccount(administrador)).toEqual(['admin']);
    expect(await papeisOfAccount(semNada)).toEqual(['guest']);
  });

  it('Rerunning the seed adds no duplicate account roles and preserves manually assigned roles', async () => {
    const pessoa = await createUser('atendente');
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      select ${tenantId}, ${pessoa}::uuid, id, 'conta'
        from papel where tenant_id = ${tenantId}::uuid and nome = 'admin' and escopo = 'conta'
    `);

    expect(await garantirRoleOfAccount(dono, tenantId)).toBe(0);
    expect(await papeisOfAccount(pessoa)).toEqual(['admin']);

    // `semear` de novo, no mesmo tenant: nada duplica.
    const segunda = await seed(dono, { name: `Semente ${slug}`, slug });
    expect(segunda.tenantId).toBe(tenantId);
    expect(segunda.papeisOfAccountData).toBe(0);
    const { rows } = await dono.execute<{ n: string }>(sql`
      select count(*)::text as n from usuario_papel up
        join usuario u on u.id = up.usuario_id
       where u.tenant_id = ${tenantId}::uuid and up.escopo = 'conta'
       group by up.usuario_id having count(*) > 1
    `);
    expect(rows).toHaveLength(0);
  });
});
