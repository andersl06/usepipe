import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { criarBanco, fecharBanco, migrar } = await import('@pipe/db');
const { fecharBancos } = await import('../src/banco.js');
const { ControladorContas } = await import('../src/controladores/contas.js');
const { cadastroDeContaHabilitado, slugDaConta } =
  await import('../src/dominio/construtor-de-conta.js');

/**
 * O cadastro de conta, fechado por padrão (`ENABLE_ACCOUNT_SIGNUP=false`), como
 * no Chatwoot de onde a flag foi portada. Aberto, ele provisiona pelo mesmo
 * `provisionarCliente` do comando.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const controlador = new ControladorContas();
let dono: ReturnType<typeof criarBanco>;

beforeAll(async () => {
  await migrar(URL_DONO);
  dono = criarBanco({ url: URL_DONO, maxConexoes: 1 });
}, 180_000);

afterEach(() => {
  delete process.env['ENABLE_ACCOUNT_SIGNUP'];
});

afterAll(async () => {
  await dono.execute(sql`delete from tenant where slug like ${`%${S}%`}`);
  await fecharBanco(dono);
  await fecharBancos();
});

describe('a flag (global_config_service)', () => {
  it('ausente ou "false" é desligada; qualquer outro valor liga', () => {
    expect(cadastroDeContaHabilitado({})).toBe(false);
    expect(cadastroDeContaHabilitado({ ENABLE_ACCOUNT_SIGNUP: 'false' })).toBe(false);
    expect(cadastroDeContaHabilitado({ ENABLE_ACCOUNT_SIGNUP: '' })).toBe(false);
    expect(cadastroDeContaHabilitado({ ENABLE_ACCOUNT_SIGNUP: 'true' })).toBe(true);
    expect(cadastroDeContaHabilitado({ ENABLE_ACCOUNT_SIGNUP: 'api_only' })).toBe(true);
  });
});

describe('POST /v1/contas (accounts_controller#create)', () => {
  it('desligada, que é o padrão: 404, e nada é criado — é a venda assistida', async () => {
    await expect(
      controlador.criar({ account_name: `Acme ${S}`, email: `ana@acme-${S}.com.br` }),
    ).rejects.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
    const { rows } = await dono.execute<{ n: string }>(
      sql`select count(*)::text as n from tenant where slug like ${`%${S}%`}`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('ligada, sem nome de conta nem de pessoa: recusado', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    await expect(controlador.criar({ email: `ana@acme-${S}.com.br` })).rejects.toMatchObject({
      codigo: 'parametros_invalidos',
    });
  });

  it('ligada, e-mail inválido ou pessoal: recusado com a frase do Chatwoot', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    await expect(
      controlador.criar({ account_name: 'X', email: 'sem-arroba' }),
    ).rejects.toMatchObject({
      message: 'Você digitou um email inválido',
    });
    await expect(
      controlador.criar({ account_name: 'X', email: `ana.${S}@gmail.com` }),
    ).rejects.toMatchObject({ codigo: 'dominio_bloqueado' });
  });

  it('ligada: provisiona tenant e administrador, e o mesmo e-mail não entra de novo', async () => {
    process.env['ENABLE_ACCOUNT_SIGNUP'] = 'true';
    const email = `ana@acme-${S}.com.br`;
    const resposta = await controlador.criar({
      account_name: `Acme ${S}`,
      user_full_name: 'Ana Ribeiro',
      email,
    });
    expect(resposta).toEqual({ email });

    const { rows } = await dono.execute<{ nome: string; papel: string }>(sql`
      select u.nome, p.nome as papel
        from usuario u
        join tenant t on t.id = u.tenant_id
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where t.slug = ${slugDaConta(`Acme ${S}`, email)} and u.email = ${email}
       order by p.nome
    `);
    // `admin` na conta e `administrador` no atendimento (migração 0021).
    expect(rows).toEqual([
      { nome: 'Ana Ribeiro', papel: 'admin' },
      { nome: 'Ana Ribeiro', papel: 'administrador' },
    ]);

    await expect(controlador.criar({ account_name: `Outra ${S}`, email })).rejects.toMatchObject({
      status: 409,
      message: `Você já se cadastrou para uma conta com ${email}`,
    });
  });
});
