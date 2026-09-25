import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/autenticacao');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * A tela "Permissões" do atendente — `GET`/`PATCH /v1/gestao/atendentes/permissoes`.
 *
 * A forma da tela é a da origem (`referencias-blip/portal/dom/
 * FICHA-atendentes-filas-pausas.md` §a.4): página própria, tabela "Tipo de
 * permissão" × "Status", seleção múltipla. O que vale a pena provar aqui é a
 * regra que a migração 0046 introduziu e que atravessa a API inteira:
 *
 *   efetiva = COALESCE(override desta pessoa, união dos papéis)
 *
 * e o cuidado que impede a tabela de exceções de virar cópia podre do RBAC:
 * **quando a escolha volta a coincidir com o papel, a linha é APAGADA.**
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem pode mexer na permissão dos outros (`usuario.gerenciar`). */
let sessionManager: string;
/** Atendente comum: é o alvo, e não pode se promover. */
let sessionAgent: string;
let sessionOfOtherTenant: string;
let gestorId: string;
let agentId: string;
let segundoId: string;

/**
 * O catálogo (`permissao`) é tabela GLOBAL e quem o preenche em produção é
 * `packages/db/src/semente.ts`, que o teste não roda — só algumas migrações
 * semeiam código solto. Os códigos que este arquivo usa entram aqui, como
 * `pessoaCom` já fazia com os dele.
 */
const DO_CATALOGO = [
  'conversa.ver',
  'conversa.responder',
  'conversa.encerrar',
  'conversa.nota_interna',
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

/** Um usuário novo no tenant, com um papel que carrega estas permissões. */
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
  const novo = createTokencriarTokencreateToken();
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
  codigo: string;
  grupo: string;
  description: string;
  dosPapeis: boolean;
  override: boolean | null;
  ligada: boolean;
  parcial: boolean;
};
type Resposta = {
  agents?: { id: string; nome: string; email: string }[];
  permissions?: Linha[];
  error?: unknown;
};

async function ler(session: string, ids: string[]) {
  const resposta = await fetch(
    `${api.url}/v1/gestao/atendentes/permissoes?atendentes=${ids.join(',')}`,
    { headers: comCookie(session) },
  );
  return { status: resposta.status, corpo: (await resposta.json()) as Resposta };
}

async function salvar(sessao: string, userIds: string[], permissions: Record<string, boolean>) {
  const resposta = await fetch(`${api.url}/v1/gestao/atendentes/permissoes`, {
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
  return corpo.permissions?.find((p) => p.codigo === codigo);
}

beforeAll(async () => {
  a = await montarCenario(`perm-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`perm-${randomUUID().slice(0, 8)}`);
  await seedCatalog(a);

  gestorId = await pessoaCom(a, ['usuario.gerenciar']);
  agentId = await pessoaCom(a, ['conversa.ver', 'conversa.responder']);
  segundoId = await pessoaCom(a, ['conversa.ver']);
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

describe('GET /v1/gestao/atendentes/permissoes', () => {
  it('devolve o catálogo inteiro e o Status vindo do papel, sem exceção nenhuma', async () => {
    const { status, corpo } = await ler(sessionManager, [agentId]);
    expect(status).toBe(200);
    expect(corpo.agents).toHaveLength(1);
    expect(corpo.agents?.[0]?.id).toBe(agentId);

    expect(permission(corpo, 'conversa.responder')).toMatchObject({
      dosPapeis: true,
      override: null,
      ligada: true,
      parcial: false,
    });
    expect(permission(corpo, 'conversa.encerrar')).toMatchObject({
      dosPapeis: false,
      override: null,
      ligada: false,
    });
    /* A tabela é o catálogo DO ATENDENTE, não só o que a pessoa tem: a linha
       desligada precisa aparecer para poder ser ligada. O que é de gestão
       (relatório, regra, usuário) fica de fora: vem do papel. */
    const codigos = corpo.permissions?.map((p) => p.codigo) ?? [];
    for (const codigo of DO_CATALOGO) {
      if (/^(conversa|contato)./.test(codigo)) expect(codigos).toContain(codigo);
      else expect(codigos).not.toContain(codigo);
    }
  });

  it("não concede por atendente o que é de gestão", async () => {
    const { status } = await salvar(sessionManager, [agentId], { "usuario.gerenciar": true });
    expect(status).toBe(400);
    expect(await linhaDe(agentId, "usuario.gerenciar")).toBeUndefined();
  });

  it('com dois atendentes, o que um tem e o outro não vem como parcial', async () => {
    const { corpo } = await ler(sessionManager, [agentId, segundoId]);
    expect(corpo.agents).toHaveLength(2);
    /* Os dois têm `conversa.ver`; só o primeiro tem `conversa.responder`. */
    expect(permission(corpo, 'conversa.ver')).toMatchObject({ ligada: true, parcial: false });
    expect(permission(corpo, 'conversa.responder')).toMatchObject({ ligada: false, parcial: true });
  });

  it('atendente de outro tenant é 404, e id que não é uuid também', async () => {
    expect((await ler(sessionOfOtherTenant, [agentId])).status).toBe(404);
    expect((await ler(sessionManager, ['nao-e-uuid'])).status).toBe(404);
  });

  it('sem atendente nenhum é recusa de requisição, não lista vazia', async () => {
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/permissoes?atendentes=`, {
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(400);
  });
});

describe('PATCH /v1/gestao/atendentes/permissoes', () => {
  it('liga o que o papel não dá e grava a exceção', async () => {
    const { status } = await salvar(sessionManager, [agentId], { 'conversa.encerrar': true });
    expect(status).toBe(200);
    expect(await linhaDe(agentId, 'conversa.encerrar')).toMatchObject({ concedida: true });

    const { corpo } = await ler(sessionManager, [agentId]);
    expect(permission(corpo, 'conversa.encerrar')).toMatchObject({
      dosPapeis: false,
      override: true,
      ligada: true,
    });
  });

  it('desliga o que o papel dá e grava a negativa', async () => {
    await salvar(sessionManager, [agentId], { 'conversa.responder': false });
    expect(await linhaDe(agentId, 'conversa.responder')).toMatchObject({ concedida: false });

    const { corpo } = await ler(sessionManager, [agentId]);
    expect(permission(corpo, 'conversa.responder')).toMatchObject({
      dosPapeis: true,
      override: false,
      ligada: false,
    });
  });

  it('voltar a coincidir com o papel APAGA a exceção — a tabela só guarda o que difere', async () => {
    await salvar(sessionManager, [agentId], { 'conversa.responder': true });
    expect(await linhaDe(agentId, 'conversa.responder')).toBeUndefined();

    await salvar(sessionManager, [agentId], { 'conversa.encerrar': false });
    expect(await linhaDe(agentId, 'conversa.encerrar')).toBeUndefined();
  });

  it('a exceção vale de verdade: desligar tira o acesso da rota, religar devolve', async () => {
    /* `regra.gerenciar` é o que `POST /v1/gestao/regras/prioridade` cobra. */
    const create = () =>
      fetch(`${api.url}/v1/gestao/regras/prioridade`, {
        method: 'POST',
        headers: comCookie(sessionAgent),
        body: JSON.stringify({ nome: `Regra ${randomUUID().slice(0, 6)}`, nivel: 'alta' }),
      });

    expect((await create()).status).toBe(403);

    /* `regra.gerenciar` é de gestão e a página não o concede (vem do papel);
       a exceção vai direto na tabela para provar que `exigirPermissao` a lê. */
    await a.dono.execute(sql`
      insert into usuario_permissao (tenant_id, usuario_id, permissao_codigo, concedida)
      values (${a.tenantId}, ${agentId}::uuid, 'regra.gerenciar', true)
    `);
    /* `POST` sem `@HttpCode` é 201 no Nest — o que importa aqui é não ser 403. */
    expect((await create()).status).toBe(201);

    await a.dono.execute(sql`
      update usuario_permissao set concedida = false
       where usuario_id = ${agentId}::uuid and permissao_codigo = 'regra.gerenciar'
    `);
    expect((await create()).status).toBe(403);
  });

  it('salva para vários atendentes de uma vez', async () => {
    await salvar(sessionManager, [agentId, segundoId], { 'conversa.nota_interna': true });
    expect(await linhaDe(agentId, 'conversa.nota_interna')).toMatchObject({ concedida: true });
    expect(await linhaDe(segundoId, 'conversa.nota_interna')).toMatchObject({ concedida: true });

    const { corpo } = await ler(sessionManager, [agentId, segundoId]);
    expect(permission(corpo, 'conversa.nota_interna')).toMatchObject({ ligada: true, parcial: false });
  });

  it('quem não tem usuario.gerenciar não mexe na permissão de ninguém — nem na própria', async () => {
    const { status } = await salvar(sessionAgent, [agentId], { 'usuario.gerenciar': true });
    expect(status).toBe(403);
    expect(await linhaDe(agentId, 'usuario.gerenciar')).toBeUndefined();
  });

  it('permissão que não está no catálogo é recusa, não linha órfã', async () => {
    const { status } = await salvar(sessionManager, [agentId], { 'inventada.total': true });
    expect(status).toBe(400);
  });

  it('gestor de outro tenant não alcança o atendente daqui', async () => {
    const { status } = await salvar(sessionOfOtherTenant, [agentId], { 'conversa.ver': false });
    expect(status).toBe(404);
  });

  it('a mudança entra no log de auditoria, com o autor e o que mudou', async () => {
    await salvar(sessionManager, [segundoId], { 'conversa.encerrar': true });
    const { rows } = await a.dono.execute<{ acao: string; depois: Record<string, unknown> | null }>(sql`
      select acao, depois from log_auditoria
       where objeto_tipo = 'usuario_permissao' and objeto_id = ${segundoId}::uuid
       order by em desc, id desc limit 1
    `);
    expect(rows[0]).toMatchObject({ acao: 'alterou', depois: { 'conversa.encerrar': true } });
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
    /* `relatorio.ver` já foi ligado no teste anterior: pedir de novo é o mesmo estado. */
    await salvar(sessionManager, [segundoId], { 'relatorio.ver': true });
    expect(await contar()).toBe(antes);
  });
});
