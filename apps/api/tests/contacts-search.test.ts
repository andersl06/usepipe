import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { noTenant } = await import('../src/database.js');
const { searchContacts } = await import('../src/domain/management/contacts-search.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
let a: Cenario;
let b: Cenario;
const marca = randomUUID().slice(0, 8);

async function contato(c: Cenario, nome: string | null, telefone: string | null, email: string | null) {
  await c.dono.execute(sql`insert into contato (tenant_id, nome, telefone_e164, email) values (${c.tenantId}, ${nome}, ${telefone}, ${email})`);
}

beforeAll(async () => {
  a = await montarCenario(`cs-a-${marca}`);
  b = await montarCenario(`cs-b-${marca}`);
  await contato(a, `Zelda ${marca}`, '+5511987654321', `zelda-${marca}@x.test`);
  await contato(a, `Link_100% ${marca}`, null, null);
  await contato(a, `Linkx100 ${marca}`, null, null);
  await contato(b, `Zelda ${marca} do outro tenant`, '+5511987654321', null);
  for (let i = 0; i < 25; i++) await contato(a, `Massa ${marca} ${i}`, null, null);
}, 60_000);

describe('searchContacts', () => {
  const buscar = (c: Cenario, q: string) => noTenant(c.tenantId, (tx) => searchContacts(tx, q));

  it('acha por nome, e-mail e telefone parcial, só do tenant da sessão', async () => {
    expect((await buscar(a, `zelda ${marca}`)).map((r) => r.name)).toEqual([`Zelda ${marca}`]);
    expect((await buscar(a, `zelda-${marca}@`)).length).toBe(1);
    expect((await buscar(a, '98765')).length).toBe(1);
    expect((await buscar(b, `Zelda ${marca}`)).map((r) => r.name)).toEqual([`Zelda ${marca} do outro tenant`]);
  });

  it('escapa curingas do LIKE e exige 2 caracteres', async () => {
    expect((await buscar(a, `Link_100% ${marca}`)).length).toBe(1);
    expect(await buscar(a, '%')).toEqual([]);
    expect(await buscar(a, 'z')).toEqual([]);
  });

  it('limita a 20 resultados', async () => {
    expect((await buscar(a, `Massa ${marca}`)).length).toBe(20);
  });
});
