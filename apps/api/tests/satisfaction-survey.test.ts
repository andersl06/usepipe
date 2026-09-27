import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
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
 * `GET v1/management/satisfaction-surveys/responses` (D-08.3/D-08.4/D-08.5): who has
 * `relatorio.ver` reads their own tenant's answers, filtered by period/queue/agent/rating and a
 * comment search that must stay literal text (T-2-22, no SQL injection via `%`/`_`/quotes) with a
 * 200-character ceiling; anyone else gets 401/403; another tenant's rows never leak through RLS
 * even when the filters name that tenant's own ids (T-2-10).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionViewer: string;
let sessionWithoutPermission: string;
let sessionOfOtherTenant: string;

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return userId;

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

function comCookie(token?: string): Record<string, string> {
  return token ? { cookie: `${NOME_DO_COOKIE}=${token}` } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

async function pedir(
  session: string | undefined,
  querystring = '',
): Promise<{ status: number; body: Corpo }> {
  const resposta = await fetch(`${api.url}/v1/management/satisfaction-surveys/responses${querystring}`, {
    headers: comCookie(session),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? (JSON.parse(texto) as Corpo) : {} };
}

async function contatoDe(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, ${nome}, ${`+55119${randomUUID().slice(0, 8)}`})
    returning id
  `);
  return rows[0]!.id;
}

async function conversaEncerradaDe(cenario: Cenario, contatoId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, encerrada_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.queueId}, ${cenario.agentId}, 'encerrada', now())
    returning id
  `);
  return rows[0]!.id;
}

async function inserirResposta(
  cenario: Cenario,
  opts: { nota: number | null; comentario: string | null; estado: string; comentarioTexto?: string },
): Promise<void> {
  const contatoId = await contatoDe(cenario, `Cliente ${randomUUID().slice(0, 6)}`);
  const conversaId = await conversaEncerradaDe(cenario, contatoId);
  await cenario.dono.execute(sql`
    insert into pesquisa_satisfacao_resposta (
      tenant_id, conversa_id, conversa_atendimento_id, fila_id, atendente_id, contato_id,
      nota, comentario, estado, respondida_em
    ) values (
      ${cenario.tenantId}, ${conversaId}, ${conversaId}, ${cenario.queueId}, ${cenario.agentId},
      ${contatoId}, ${opts.nota}, ${opts.comentario}, ${opts.estado},
      ${opts.estado === 'sem_resposta' ? null : new Date()}
    )
  `);
}

beforeAll(async () => {
  a = await montarCenario(`sat-${Date.now()}-a`);
  b = await montarCenario(`sat-${Date.now()}-b`);
  api = await upApi(0);

  const viewerId = await pessoaCom(a, ['relatorio.ver']);
  sessionViewer = await openSession(a, viewerId);
  const semPermissaoId = await pessoaCom(a, []);
  sessionWithoutPermission = await openSession(a, semPermissaoId);
  const outroTenantId = await pessoaCom(b, ['relatorio.ver']);
  sessionOfOtherTenant = await openSession(b, outroTenantId);

  await inserirResposta(a, { nota: 5, comentario: 'atendimento excelente', estado: 'completa' });
  await inserirResposta(a, { nota: 2, comentario: null, estado: 'so_nota' });
  await inserirResposta(a, { nota: null, comentario: null, estado: 'sem_resposta' });
  await inserirResposta(a, { nota: 4, comentario: 'gostei muito, 100% satisfeito', estado: 'completa' });
  await inserirResposta(b, { nota: 1, comentario: 'péssimo', estado: 'completa' });
});

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET v1/management/satisfaction-surveys/responses', () => {
  it('401 sem sessão', async () => {
    const { status } = await pedir(undefined);
    expect(status).toBe(401);
  });

  it('403 sem a permissão relatorio.ver', async () => {
    const { status, body } = await pedir(sessionWithoutPermission);
    expect(status).toBe(403);
    expect(body['error']['code']).toBe('without_permission');
  });

  it('200 com relatorio.ver, devolvendo só as respostas do próprio tenant', async () => {
    const { status, body } = await pedir(sessionViewer);
    expect(status).toBe(200);
    expect(body['data']).toHaveLength(4);
    const notas = (body['data'] as Corpo[]).map((r) => r.rating as number | null).sort((x, y) => (x ?? -1) - (y ?? -1));
    expect(notas).toEqual([null, 2, 4, 5]);
  });

  it('filtra por nota', async () => {
    const { status, body } = await pedir(sessionViewer, '?rating=5');
    expect(status).toBe(200);
    expect(body['data']).toHaveLength(1);
    expect(body['data'][0]['rating']).toBe(5);
    expect(body['data'][0]['category']).toBe('satisfeito');
  });

  it('rating fora de 1-5 é recusado com 400', async () => {
    const { status, body } = await pedir(sessionViewer, '?rating=9');
    expect(status).toBe(400);
    expect(body['error']['code']).toBe('filtro_invalido');
  });

  it('nunca devolve resposta de outro tenant, mesmo filtrando pelos ids dele', async () => {
    const { status, body } = await pedir(sessionViewer, `?queueId=${b.queueId}&agentId=${b.agentId}`);
    expect(status).toBe(200);
    expect(body['data']).toHaveLength(0);

    const { status: statusB, body: bodyB } = await pedir(sessionOfOtherTenant);
    expect(statusB).toBe(200);
    expect(bodyB['data']).toHaveLength(1);
    expect(bodyB['data'][0]['comment']).toBe('péssimo');
  });

  it('T-2-22: treats comment search as literal text (SQL injection)', async () => {
    const injeção = encodeURIComponent("%' OR 1=1 --");
    const { status, body } = await pedir(sessionViewer, `?search=${injeção}`);
    expect(status).toBe(200);
    // The literal text never matches any seeded comment; a real injection would return all rows.
    expect(body['data']).toHaveLength(0);

    const curinga = encodeURIComponent('_');
    const { body: bodyCuringa } = await pedir(sessionViewer, `?search=${curinga}`);
    expect(bodyCuringa['data']).toHaveLength(0);

    const literal = encodeURIComponent('100% satisfeito');
    const { status: statusLiteral, body: bodyLiteral } = await pedir(sessionViewer, `?search=${literal}`);
    expect(statusLiteral).toBe(200);
    expect(bodyLiteral['data']).toHaveLength(1);
    expect(bodyLiteral['data'][0]['comment']).toContain('100% satisfeito');
  });

  it('busca acima de 200 caracteres é recusada com 400', async () => {
    const longa = encodeURIComponent('a'.repeat(201));
    const { status, body } = await pedir(sessionViewer, `?search=${longa}`);
    expect(status).toBe(400);
    expect(body['error']['code']).toBe('filtro_invalido');
  });
});
