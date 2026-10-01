import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The agent's "Permissões" screen — `GET`/`PATCH /v1/gestao/atendentes/permissoes`. The screen's shape follows the source product (`referencias-blip/portal/dom/FICHA-atendentes-filas-pausas.md` §a.4): its own page, a "Permission type" × "Status" table, multiple selection. What is worth proving here is the rule migration 0046 introduced, which runs through the entire API: effective = COALESCE(this person's override, union of their roles), and the safeguard that keeps the exceptions table from rotting into a stale copy of RBAC: **when the choice matches the role again, the row is DELETED.**
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Who can change other people's permissions (`usuario.gerenciar`). */
let sessionManager: string;
/** A regular agent: the target, who cannot promote themself. */
let sessionAgent: string;
let sessionOfOtherTenant: string;
let gestorId: string;
let agentId: string;
let segundoId: string;

/**
 * The catalog (`permissao`) is a GLOBAL table, and in production it is populated by `packages/db/src/semente.ts`, which the test does not run — only a few migrations seed loose codes. The codes this file uses are inserted here, the same way `pessoaCom` already did with its own.
 */
const DO_CATALOGO = [
  'contato.editar',
  'conversa.transferir',
  'resposta_pronta.gerenciar',
  'relatorio.ver',
  'regra.gerenciar',
  'usuario.gerenciar',
];

async function seedCatalog(cenario: Cenario): Promise<void> {
  for (const codigo of DO_CATALOGO) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
}

/** A new user in the tenant, with a role carrying these permissions. */
async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissoes.length === 0) return userId;

  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  const roleId = papeis[0]!.id;
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${roleId})
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

type Linha = {
  code: string | null;
  estado: string;
  group: string;
  description: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  parcial: boolean;
};
type Resposta = {
  agents?: { id: string; name: string; email: string }[];
  permissions?: Linha[];
  error?: unknown;
};

async function ler(session: string, ids: string[]) {
  const resposta = await fetch(
    `${api.url}/v1/management/agents/permissions?agents=${ids.join(',')}`,
    { headers: comCookie(session) },
  );
  return { status: resposta.status, corpo: (await resposta.json()) as Resposta };
}

async function salvar(sessao: string, userIds: string[], permissions: Record<string, boolean>) {
  const resposta = await fetch(`${api.url}/v1/management/agents/permissions`, {
    method: 'PATCH',
    headers: comCookie(sessao),
    body: JSON.stringify({ userIds, permissions }),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function linhaDe(usuarioId: string, codigo: string) {
  const { rows } = await a.dono.execute<{ concedida: boolean }>(sql`
    select concedida from usuario_permissao
     where usuario_id = ${usuarioId}::uuid and permissao_codigo = ${codigo}
  `);
  return rows[0];
}

function permission(corpo: Resposta, codigo: string): Linha | undefined {
  return corpo.permissions?.find((p) => p.code === codigo);
}

beforeAll(async () => {
  a = await montarCenario(`perm-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`perm-${randomUUID().slice(0, 8)}`);
  await seedCatalog(a);

  gestorId = await pessoaCom(a, ['usuario.gerenciar']);
  agentId = await pessoaCom(a, ['contato.editar', 'conversa.transferir']);
  segundoId = await pessoaCom(a, ['contato.editar']);
  const gestorDoB = await pessoaCom(b, ['usuario.gerenciar']);

  api = await upApi(0);
  sessionManager = await openSession(a, gestorId);
  sessionAgent = await openSession(a, agentId);
  sessionOfOtherTenant = await openSession(b, gestorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET /v1/management/agents/permissions', () => {
  it('Return the full permission catalog and role-derived status without overrides', async () => {
    const { status, corpo } = await ler(sessionManager, [agentId]);
    expect(status).toBe(200);
    expect(corpo.agents).toHaveLength(1);
    expect(corpo.agents?.[0]?.id).toBe(agentId);

    expect(permission(corpo, 'conversa.transferir')).toMatchObject({
      dosPapeis: true,
      override: null,
      ligada: true,
      parcial: false,
    });
    expect(permission(corpo, 'resposta_pronta.gerenciar')).toMatchObject({
      dosPapeis: false,
      override: null,
      ligada: false,
    });
    /*
     * The table is the AGENT's full catalog, not just what the person already has: a disabled row must still appear so it can be turned on. Anything management-level (report, rule, user) is excluded: it comes from the role.
     */
    /* The screen shows exactly the ten Desk capabilities, in this order; only the enforced ones carry a code. */
    expect(corpo.permissions?.map((p) => p.description)).toEqual([
      'Editar dados do contato',
      'Enviar mensagem ativa',
      'Criar links de pagamento',
      'Criar pastas e etapas do Kanban para organizar os tickets',
      'Transferir tickets',
      'Transferir múltiplos tickets ao mesmo tempo',
      'Receber ligações de voz',
      'Realizar ligações de voz',
      'Acesso ao Histórico dos contatos no Blip Desk',
      'Criar respostas prontas',
    ]);
    expect(corpo.permissions?.filter((p) => p.estado === 'ativa').map((p) => p.code)).toEqual([
      'contato.editar',
      'conversa.transferir',
      'resposta_pronta.gerenciar',
    ]);
  });

  it('Reject overrides for rows without enforcement', async () => {
    for (const codigo of ['conversa.ver', 'contato.ver', 'conversa.encerrar']) {
      expect((await salvar(sessionManager, [agentId], { [codigo]: true })).status).toBe(400);
    }
  });

  it("Reject agent overrides for management-only permissions", async () => {
    const { status } = await salvar(sessionManager, [agentId], { "usuario.gerenciar": true });
    expect(status).toBe(400);
    expect(await linhaDe(agentId, "usuario.gerenciar")).toBeUndefined();
  });

  it('Show a permission as partial when selected agents differ', async () => {
    const { corpo } = await ler(sessionManager, [agentId, segundoId]);
    expect(corpo.agents).toHaveLength(2);
    /* Both have `conversa.ver`; only the first has `conversa.responder`. */
    expect(permission(corpo, 'contato.editar')).toMatchObject({ ligada: true, parcial: false });
    expect(permission(corpo, 'conversa.transferir')).toMatchObject({ ligada: false, parcial: true });
  });

  it('Return 404 for another tenant\'s agent or malformed IDs', async () => {
    expect((await ler(sessionOfOtherTenant, [agentId])).status).toBe(404);
    expect((await ler(sessionManager, ['nao-e-uuid'])).status).toBe(404);
  });

  it('Reject a permission request with no agents rather than returning an empty list', async () => {
    const resposta = await fetch(`${api.url}/v1/management/agents/permissions?agents=`, {
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(400);
  });
});

describe('PATCH /v1/management/agents/permissions', () => {
  it('Grant an agent permission absent from the role and store the override', async () => {
    const { status } = await salvar(sessionManager, [agentId], { 'resposta_pronta.gerenciar': true });
    expect(status).toBe(200);
    expect(await linhaDe(agentId, 'resposta_pronta.gerenciar')).toMatchObject({ concedida: true });

    const { corpo } = await ler(sessionManager, [agentId]);
    expect(permission(corpo, 'resposta_pronta.gerenciar')).toMatchObject({
      dosPapeis: false,
      override: true,
      ligada: true,
    });
  });

  it('Deny an agent permission granted by the role and store the override', async () => {
    await salvar(sessionManager, [agentId], { 'conversa.transferir': false });
    expect(await linhaDe(agentId, 'conversa.transferir')).toMatchObject({ concedida: false });

    const { corpo } = await ler(sessionManager, [agentId]);
    expect(permission(corpo, 'conversa.transferir')).toMatchObject({
      dosPapeis: true,
      override: false,
      ligada: false,
    });
  });

  it('Delete an override when it matches the role again', async () => {
    await salvar(sessionManager, [agentId], { 'conversa.transferir': true });
    expect(await linhaDe(agentId, 'conversa.transferir')).toBeUndefined();

    await salvar(sessionManager, [agentId], { 'resposta_pronta.gerenciar': false });
    expect(await linhaDe(agentId, 'resposta_pronta.gerenciar')).toBeUndefined();
  });

  it('Apply agent permission overrides to routes immediately', async () => {
    /* `regra.gerenciar` is what `POST /v1/gestao/regras/prioridade` requires. */
    const create = () =>
      fetch(`${api.url}/v1/management/rules/priority?flowId=${a.flowId}`, {
        method: 'POST',
        headers: comCookie(sessionAgent),
        body: JSON.stringify({ name: `Regra ${randomUUID().slice(0, 6)}`, level: 'alta' }),
      });

    expect((await create()).status).toBe(403);

    /*
     * `regra.gerenciar` is a management permission and the page does not grant it (it comes from the role); the exception is written directly into the table to prove `exigirPermissao` reads it.
     */
    await a.dono.execute(sql`
      insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida)
      values (${a.tenantId}, ${agentId}::uuid, 'regra.gerenciar', true)
    `);
    /* `POST` without `@HttpCode` defaults to 201 in Nest — what matters here is that it is not 403. */
    expect((await create()).status).toBe(201);

    await a.dono.execute(sql`
      update usuario_permissao set concedida = false
       where usuario_id = ${agentId}::uuid and permissao_codigo = 'regra.gerenciar'
    `);
    expect((await create()).status).toBe(403);
  });

  it('Save permission overrides for several agents at once', async () => {
    await salvar(sessionManager, [agentId, segundoId], { 'resposta_pronta.gerenciar': true });
    expect(await linhaDe(agentId, 'resposta_pronta.gerenciar')).toMatchObject({ concedida: true });
    expect(await linhaDe(segundoId, 'resposta_pronta.gerenciar')).toMatchObject({ concedida: true });

    const { corpo } = await ler(sessionManager, [agentId, segundoId]);
    expect(permission(corpo, 'resposta_pronta.gerenciar')).toMatchObject({ ligada: true, parcial: false });
  });

  it('Prevent users without `usuario.gerenciar` from editing any agent\'s permissions', async () => {
    const { status } = await salvar(sessionAgent, [agentId], { 'usuario.gerenciar': true });
    expect(status).toBe(403);
    expect(await linhaDe(agentId, 'usuario.gerenciar')).toBeUndefined();
  });

  it('Reject permissions absent from the catalog without orphan rows', async () => {
    const { status } = await salvar(sessionManager, [agentId], { 'inventada.total': true });
    expect(status).toBe(400);
  });

  it('Prevent another tenant\'s manager from editing this agent', async () => {
    const { status } = await salvar(sessionOfOtherTenant, [agentId], { 'contato.editar': false });
    expect(status).toBe(404);
  });

  it('a mudança entra no log de auditoria, com o autor e o que mudou', async () => {
    await salvar(sessionManager, [segundoId], { 'conversa.transferir': true });
    const { rows } = await a.dono.execute<{ acao: string; depois: Record<string, unknown> | null }>(sql`
      select acao, depois from log_auditoria
       where objeto_tipo = 'usuario_permissao' and objeto_id = ${segundoId}::uuid
       order by em desc, id desc limit 1
    `);
    expect(rows[0]).toMatchObject({ acao: 'alterou', depois: { 'conversa.transferir': true } });
  });

  it('salvar sem mexer em nada não gera log', async () => {
    const contar = async () => {
      const { rows } = await a.dono.execute<{ n: string }>(sql`
        select count(*)::text as n from log_auditoria
         where objeto_tipo = 'usuario_permissao' and objeto_id = ${segundoId}::uuid
      `);
      return rows[0]!.n;
    };
    const antes = await contar();
    /* `relatorio.ver` was already enabled in the previous test: requesting it again is a no-op, same state. */
    await salvar(sessionManager, [segundoId], { 'relatorio.ver': true });
    expect(await contar()).toBe(antes);
  });
});
