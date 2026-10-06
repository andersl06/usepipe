import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { createDatabase, closeDatabase, migrate } = await import('@pipe/db');
const { fecharBancos } = await import('../src/database.js');
const { AccountsController } = await import('../src/controllers/accounts.js');
const { registrationOfAccountEnabled, slugOfAccount } =
  await import('../src/domain/builder-of-account.js');
const { MyAccountController } = await import('../src/controllers/my-account.js');

/**
 * Account signup, closed by default (`ENABLE_ACCOUNT_SIGNUP=false`), as in the Chatwoot it was ported from. When open, it provisions through the same `provisionarCliente` as the command.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const controller = new AccountsController();
let dono: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  await migrate(URL_DONO);
  dono = createDatabase({ url: URL_DONO, maxConnections: 1 });
}, 180_000);

afterEach(() => {
  delete process.env['ENABLE_ACCOUNT_SIGNUP'];
});

afterAll(async () => {
  await dono.execute(sql`delete from tenant where slug like ${`%${S}%`}`);
  await closeDatabase(dono);
  await fecharBancos();
});

describe('a flag (global_config_service)', () => {
  it('Disable account signup when unset or set to "false" and enable it for any other value', () => {
    expect(registrationOfAccountEnabled({})).toBe(false);
    expect(registrationOfAccountEnabled({ ENABLE_ACCOUNT_SIGNUP: 'false' })).toBe(false);
    expect(registrationOfAccountEnabled({ ENABLE_ACCOUNT_SIGNUP: '' })).toBe(false);
    expect(registrationOfAccountEnabled({ ENABLE_ACCOUNT_SIGNUP: 'true' })).toBe(true);
    expect(registrationOfAccountEnabled({ ENABLE_ACCOUNT_SIGNUP: 'api_only' })).toBe(true);
  });
});

describe('Return 404 from POST /v1/accounts when signup is disabled by default (`accounts_controller`)', () => {
  it('desligada, que é o padrão: 404, e nada é criado — é a venda assistida', async () => {
    await expect(
      controller.create({ account_name: `Acme ${S}`, email: `ana@acme-${S}.com.br` }),
    ).rejects.toMatchObject({ status: 404, codigo: 'not_found' });
    const { rows } = await dono.execute<{ n: string }>(
      sql`select count(*)::text as n from tenant where slug like ${`%${S}%`}`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('Reject account signup without an account or person name when enabled', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    await expect(controller.create({ email: `ana@acme-${S}.com.br` })).rejects.toMatchObject({
      codigo: 'parameters_invalid',
    });
  });

  it('ligada, e-mail inválido ou pessoal: recusado com a frase do Chatwoot', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    await expect(
      controller.create({ account_name: 'X', email: 'sem-arroba' }),
    ).rejects.toMatchObject({
      message: 'Você digitou um email inválido',
    });
    await expect(
      controller.create({ account_name: 'X', email: `ana.${S}@gmail.com` }),
    ).rejects.toMatchObject({ codigo: 'domain_blocked' });
  });

  it('ligada: provisiona tenant e administrador, e o mesmo e-mail não entra de novo', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    const email = `ana@acme-${S}.com.br`;
    const resposta = await controller.create({
      account_name: `Acme ${S}`,
      user_full_name: 'Ana Ribeiro',
      email,
    });
    expect(resposta).toEqual({ email });

    const { rows } = await dono.execute<{ name: string; role: string }>(sql`
      select u.nome, p.nome as papel
        from usuario u
        join tenant t on t.id = u.tenant_id
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where t.slug = ${slugOfAccount(`Acme ${S}`, email)} and u.email = ${email}
       order by p.nome
    `);
    // // `admin` at the account level and `administrador` in attendance (migration 0021).
    expect(rows).toEqual([
      { nome: 'Ana Ribeiro', papel: 'admin' },
      { nome: 'Ana Ribeiro', papel: 'administrador' },
    ]);

    await expect(controller.create({ account_name: `Outra ${S}`, email })).rejects.toMatchObject({
      status: 409,
      message: `Você já se cadastrou para uma conta com ${email}`,
    });
  });
});

describe('Switch between accounts that share an e-mail (`accounts/my`, `accounts/exchange`)', () => {
  const mine = new MyAccountController();
  const email = `pessoa-${S}@multi.pipe.app`;
  const ids: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
  const userA = { id: '' };
  const userB = { id: '' };

  beforeAll(async () => {
    for (const key of ['a', 'b', 'c'] as const) {
      const { rows } = await dono.execute<{ id: string }>(
        sql`insert into tenant (nome, slug) values (${`Org ${key} ${S}`}, ${`org-${key}-${S}`}) returning id`,
      );
      ids[key] = rows[0]!.id;
    }
    for (const [key, ref] of [['a', userA], ['b', userB]] as const) {
      const { rows } = await dono.execute<{ id: string }>(
        sql`insert into usuario (tenant_id, nome, email) values (${ids[key]}::uuid, 'Pessoa', ${email}) returning id`,
      );
      ref.id = rows[0]!.id;
    }
  });

  const requestFrom = (tenantId: string, userId: string) =>
    ({ session: { tenantId, userId, origem: 'google' }, ip: '127.0.0.1', header: () => 'test' }) as never;
  const response = () => {
    const headers: Record<string, string> = {};
    return { headers, setHeader: (k: string, v: string) => void (headers[k] = v) } as never;
  };

  it('Lists both accounts, marking only the current one as in force', async () => {
    const list = await mine.minhas(requestFrom(ids.a, userA.id));
    expect(list.map((c) => [c.tenantId, c.inForce])).toEqual(
      expect.arrayContaining([[ids.a, true], [ids.b, false]]),
    );
    expect(list.some((c) => c.tenantId === ids.c)).toBe(false);
  });

  it('Exchange into the other account returns its slug and sets a session cookie', async () => {
    const res = response() as unknown as { headers: Record<string, string> };
    const out = await mine.exchange(requestFrom(ids.a, userA.id), res as never, { tenantId: ids.b });
    expect(out).toEqual({ tenantId: ids.b, slug: `org-b-${S}` });
    expect(res.headers['set-cookie']).toBeTruthy();
  });

  it('Exchange into an account without membership is 404 not_found', async () => {
    await expect(
      mine.exchange(requestFrom(ids.a, userA.id), response(), { tenantId: ids.c }),
    ).rejects.toMatchObject({ status: 404, codigo: 'not_found' });
  });

  it('A deactivated user disappears from the list and cannot be switched into', async () => {
    await dono.execute(sql`update usuario set ativo = false where id = ${userB.id}::uuid`);
    const list = await mine.minhas(requestFrom(ids.a, userA.id));
    expect(list.some((c) => c.tenantId === ids.b)).toBe(false);
    await expect(
      mine.exchange(requestFrom(ids.a, userA.id), response(), { tenantId: ids.b }),
    ).rejects.toMatchObject({ status: 404, codigo: 'not_found' });
  });
});
