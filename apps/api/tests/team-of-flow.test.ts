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
const { noTenant } = await import('../src/database.js');
const { requirePermissionInFlow, permissionsOfRole } =
  await import('../src/domain/management/team-of-flow.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The flow's OWN team — `/v1/gestao/fluxos/:id/equipe` — and the guard it exists to feed, `exigirPermissaoNoFluxo`. What is worth proving is what the source product decides and what Pipe decided on top of it: the higher level SETS the lower radios (`selectAllPermissions()`), anyone outside the contract is rejected with the source's own wording, the double gate accepts anyone with the permission on the FLOW **or** on the account (and rejects anyone with neither), and the flow's last administrator cannot leave — this last rule is ours, because the source has `owner` and we do not.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem edita fluxo pela CONTA (`automacao.fluxo.editar`) — o `member` deles. */
let sessionEditor: string;
/** People from tenant A with no flow permission at all, and not even a member. */
let sessionWithoutAuthority: string;
let semPoderId: string;
/** An editor from tenant B: proves the tenant comes from the session, never from the URL. */
let sessionOfOtherTenant: string;
/** Three people from tenant A with no account-level permission, so they enter through the flow. */
let ana: { id: string; email: string };
let bruno: { id: string; email: string };
let carla: { id: string; email: string };
/** O fluxo sobre o qual quase tudo acontece. */
let flowId: string;

/** A new user in the tenant, with a role carrying these permissions. */
async function pessoaCom(
  cenario: Cenario,
  permissions: string[],
): Promise<{ id: string; email: string }> {
  const marca = randomUUID().slice(0, 8);
  const email = `pessoa-${marca}@e2e.pipe.app`;
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${email})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return { id: userId, email };

  for (const codigo of permissions) {
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
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${roleId})
  `);
  return { id: userId, email };
}

async function openSession(cenario: Cenario, usuarioId: string): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${usuarioId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

async function createFlowInDatabase(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado)
    values (${cenario.tenantId}, ${nome}, 'fluxo', 'publicado')
    returning id
  `);
  return rows[0]!.id;
}

type Resposta = { status: number; body: Record<string, unknown> };

async function chamar(session: string, caminho: string, init: RequestInit = {}): Promise<Resposta> {
  const resposta = await fetch(`${api.url}${caminho}`, { ...init, headers: comCookie(session) });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {},
  };
}

const listar = (sessao: string, id = flowId) => chamar(sessao, `/v1/management/flows/${id}/team`);

const adicionar = (sessao: string, corpo: Record<string, unknown>, id = flowId) =>
  chamar(sessao, `/v1/management/flows/${id}/team`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });

const editar = (sessao: string, alvo: string, corpo: Record<string, unknown>, id = flowId) =>
  chamar(sessao, `/v1/management/flows/${id}/team/${alvo}`, {
    method: 'PATCH',
    body: JSON.stringify(corpo),
  });

const remover = (sessao: string, alvo: string, id = flowId) =>
  chamar(sessao, `/v1/management/flows/${id}/team/${alvo}`, { method: 'DELETE' });

/** Inserts someone directly in the database, bypassing the route, to set up the scenario. */
async function seed(
  cenario: Cenario,
  flow: string,
  userId: string,
  role: string,
): Promise<void> {
  const permissions = JSON.stringify(
    permissionsOfRole(role as 'visualizar' | 'personalizado' | 'editar' | 'admin'),
  );
  await cenario.dono.execute(sql`
    insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
    values (${cenario.tenantId}, ${flow}::uuid, ${userId}::uuid, ${role}, ${permissions}::jsonb)
    on conflict (fluxo_id, usuario_id) do update
      set papel_no_fluxo = excluded.papel_no_fluxo, permissoes = excluded.permissoes
  `);
}

async function auditoriaDe(usuarioId: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'fluxo_membro' and objeto_id = ${usuarioId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`eq-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`eq-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  semPoderId = semPoder.id;
  ana = await pessoaCom(a, []);
  bruno = await pessoaCom(a, []);
  carla = await pessoaCom(a, []);
  const editorDoB = await pessoaCom(b, ['automacao.fluxo.editar']);

  flowId = await createFlowInDatabase(a, `Equipe ${randomUUID().slice(0, 6)}`);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor.id);
  sessionWithoutAuthority = await openSession(a, semPoder.id);
  sessionOfOtherTenant = await openSession(b, editorDoB.id);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('POST /v1/management/flows/:id/team', () => {
  it('Add an existing account member to a flow with role-based permissions', async () => {
    const { status, body: corpo } = await adicionar(sessionEditor, {
      email: ana.email,
      papelNoFluxo: 'editar',
    });
    expect(status).toBe(201);
    expect(corpo).toMatchObject({ userId: ana.id, email: ana.email, roleInFlow: 'editar' });
    /* `selectAllPermissions()`: "View and edit" sets EVERY row to `readWrite`. */
    expect(corpo['permissions']).toMatchObject({ builder: 'escrever', analysis: 'escrever' });

    const log = await auditoriaDe(ana.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { roleInFlow: 'editar' } });
  });

  it('"Visualizar" põe tudo em ler e "Personalizado" respeita linha a linha', async () => {
    const visita = await adicionar(sessionEditor, {
      email: bruno.email,
      papelNoFluxo: 'visualizar',
    });
    expect(visita.status).toBe(201);
    expect(visita.body['permissions']).toMatchObject({ builder: 'ler', channels: 'ler' });

    const solta = await editar(sessionEditor, bruno.id, {
      papelNoFluxo: 'personalizado',
      permissoes: { builder: 'escrever', channels: 'ler' },
    });
    expect(solta.status).toBe(200);
    expect(solta.body['permissions']).toMatchObject({
      builder: 'escrever',
      channels: 'ler',
      /* Whatever is absent falls into "No permission" — the source's zero radio option. */
      analysis: 'nenhum',
    });
  });

  it('Reject users who are not account members with the expected message', async () => {
    const { status, body: corpo } = await adicionar(sessionEditor, {
      email: 'ninguem@e2e.pipe.app',
      papelNoFluxo: 'visualizar',
    });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ error: { code: 'person_outside_of_contract' } });
    expect(String((corpo['error'] as { message: string }).message)).toContain(
      'não faz parte do contrato',
    );
  });

  it('recusa a mesma pessoa duas vezes e nível que a origem não tem', async () => {
    const repetida = await adicionar(sessionEditor, { email: ana.email, papelNoFluxo: 'editar' });
    expect(repetida.status).toBe(409);
    expect(repetida.body).toMatchObject({ error: { code: 'already_member' } });

    const inventado = await adicionar(sessionEditor, {
      email: carla.email,
      papelNoFluxo: 'super-admin',
    });
    expect(inventado.status).toBe(400);
    expect(inventado.body).toMatchObject({ error: { code: 'role_in_flow_invalid' } });
  });
});

describe('Require permission to manage the flow team', () => {
  it('Return 403 without either flow or account team permission', async () => {
    const lista = await listar(sessionWithoutAuthority);
    expect(lista.status).toBe(403);
    expect(lista.body).toMatchObject({ error: { code: 'without_permission' } });

    const posta = await adicionar(sessionWithoutAuthority, {
      email: carla.email,
      papelNoFluxo: 'visualizar',
    });
    expect(posta.status).toBe(403);
  });

  it('Allow flow admins with no account-level permission', async () => {
    await seed(a, flowId, semPoderId, 'admin');
    const lista = await listar(sessionWithoutAuthority);
    expect(lista.status).toBe(200);
    expect(lista.body['podeGerir']).toBe(true);
    /* Back to how it was: the remaining cases rely on him having no permission at all. */
    await a.dono.execute(sql`
      delete from fluxo_membro where fluxo_id = ${flowId}::uuid
        and usuario_id = ${semPoderId}::uuid
    `);
  });

  it('List team editor resources in their expected order', async () => {
    const { status, body: corpo } = await listar(sessionEditor);
    expect(status).toBe(200);
    const chaves = (corpo['recursos'] as { key: string }[]).map((r) => r.key);
    expect(chaves.slice(0, 4)).toEqual(['payments', 'channels', 'desk', 'users']);
    expect(chaves).toContain('team');
  });

  it('Return 404 for cross-tenant or malformed flow IDs', async () => {
    expect((await listar(sessionOfOtherTenant)).status).toBe(404);
    expect((await listar(sessionEditor, 'isto-nao-e-uuid')).status).toBe(404);
    expect((await listar(sessionEditor, randomUUID())).status).toBe(404);
  });
});

describe('PATCH e DELETE /v1/management/flows/:id/team/:usuarioId', () => {
  it('altera o nível, registra no log e não grava quando nada mudou', async () => {
    const mudou = await editar(sessionEditor, ana.id, { papelNoFluxo: 'visualizar' });
    expect(mudou.status).toBe(200);
    expect(mudou.body['roleInFlow']).toBe('visualizar');

    const antes = (await auditoriaDe(ana.id)).length;
    const igual = await editar(sessionEditor, ana.id, { papelNoFluxo: 'visualizar' });
    expect(igual.status).toBe(200);
    expect((await auditoriaDe(ana.id)).length).toBe(antes);

    const log = await auditoriaDe(ana.id);
    expect(log.at(-1)).toMatchObject({
      acao: 'alterou',
      antes: { papelNoFluxo: 'editar' },
      depois: { papelNoFluxo: 'visualizar' },
    });
  });

  it('Return 404 for absent members or members of another flow', async () => {
    const outro = await createFlowInDatabase(a, `Outro ${randomUUID().slice(0, 6)}`);
    expect((await editar(sessionEditor, ana.id, { papelNoFluxo: 'admin' }, outro)).status).toBe(404);
    expect((await remover(sessionEditor, randomUUID())).status).toBe(404);
  });

  it('Prevent the last flow admin from leaving or being demoted', async () => {
    const so = await createFlowInDatabase(a, `Só um admin ${randomUUID().slice(0, 6)}`);
    await seed(a, so, ana.id, 'admin');
    await seed(a, so, bruno.id, 'visualizar');

    const rebaixa = await editar(sessionEditor, ana.id, { papelNoFluxo: 'editar' }, so);
    expect(rebaixa.status).toBe(409);
    expect(rebaixa.body).toMatchObject({ error: { code: 'last_admin' } });
    expect((await remover(sessionEditor, ana.id, so)).status).toBe(409);

    /* Com um segundo administrador, os dois gestos passam. */
    await seed(a, so, bruno.id, 'admin');
    expect((await remover(sessionEditor, ana.id, so)).status).toBe(204);
  });

  it('remove e limpa o log com o que a pessoa tinha', async () => {
    expect((await remover(sessionEditor, ana.id)).status).toBe(204);
    const log = await auditoriaDe(ana.id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
    const lista = await listar(sessionEditor);
    const emails = (lista.body['members'] as { email: string }[]).map((m) => m.email);
    expect(emails).not.toContain(ana.email);
  });
});

describe('Check flow and account permissions at both access gates', () => {
  /** Runs the raw function inside the tenant's transaction, the same way the routes do. */
  const tentar = (usuarioId: string, fluxo: string, codigo: string) =>
    noTenant(a.tenantId, (tx) => requirePermissionInFlow(tx, usuarioId, fluxo, codigo))
      .then(() => 'passou')
      .catch((error: Error & { codigo?: string }) => error.codigo ?? error.message);

  it('Allow flow-only permission without account permission', async () => {
    const flow = await createFlowInDatabase(a, `Portão A ${randomUUID().slice(0, 6)}`);
    await seed(a, flow, carla.id, 'editar');
    expect(await tentar(carla.id, flow, 'builder.escrever')).toBe('passou');
    expect(await tentar(carla.id, flow, 'channels.ler')).toBe('passou');
  });

  it('Allow account permission even without flow membership', async () => {
    const fluxo = await createFlowInDatabase(a, `Portão B ${randomUUID().slice(0, 6)}`);
    const { rows } = await a.dono.execute<{ id: string }>(sql`
      select u.id from usuario u
        join usuario_papel up on up.usuario_id = u.id
        join papel_permissao pp on pp.papel_id = up.papel_id
       where u.tenant_id = ${a.tenantId} and pp.permissao_codigo = 'automacao.fluxo.editar'
       limit 1
    `);
    expect(await tentar(rows[0]!.id, fluxo, 'builder.escrever')).toBe('passou');
  });

  it('Reject missing permissions and prevent `ler` access from granting `escrever` access', async () => {
    const fluxo = await createFlowInDatabase(a, `Portão C ${randomUUID().slice(0, 6)}`);
    expect(await tentar(semPoderId, fluxo, 'builder.escrever')).toBe('without_permission');

    await seed(a, fluxo, semPoderId, 'visualizar');
    expect(await tentar(semPoderId, fluxo, 'builder.ler')).toBe('passou');
    expect(await tentar(semPoderId, fluxo, 'builder.escrever')).toBe('without_permission');
  });

  it('Allow flow-only members to edit basic flow settings', async () => {
    /*
     * `PATCH /v1/gestao/fluxos/:id` is "Basic configurations" (`basicConfigurations`): before migration 0035 it required `automacao.fluxo.editar` on the account, and anyone without it got a 403.
     */
    const fluxo = await createFlowInDatabase(a, `Básicas ${randomUUID().slice(0, 6)}`);
    const antes = await fetch(`${api.url}/v1/management/flows/${fluxo}`, {
      method: 'PATCH',
      headers: comCookie(sessionWithoutAuthority),
      body: JSON.stringify({ description: 'sem poder nenhum' }),
    });
    expect(antes.status).toBe(403);

    await seed(a, fluxo, semPoderId, 'editar');
    const depois = await fetch(`${api.url}/v1/management/flows/${fluxo}`, {
      method: 'PATCH',
      headers: comCookie(sessionWithoutAuthority),
      body: JSON.stringify({ description: 'agora sou membro' }),
    });
    expect(depois.status).toBe(200);
  });

  it('Allow flow admins through every permission check', async () => {
    const fluxo = await createFlowInDatabase(a, `Portão D ${randomUUID().slice(0, 6)}`);
    await a.dono.execute(sql`
      insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
      values (${a.tenantId}, ${fluxo}::uuid, ${semPoderId}::uuid, 'admin', '{}'::jsonb)
    `);
    expect(await tentar(semPoderId, fluxo, 'team.escrever')).toBe('passou');
    expect(await tentar(semPoderId, fluxo, 'payments.escrever')).toBe('passou');
  });
});
