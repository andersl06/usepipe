import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 31).toString('base64')}`;

const { NOME_DO_COOKIE, createToken } = await import('@pipe/authentication');
const { checkFlowOfKey, flowOfRoute } = await import('../src/authentication.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
import type { Request } from 'express';

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The access key created on the flow's "Chaves de acesso" screen (`chave_api.fluxo_id`, migration 0032) is a FENCED credential, not just a label: the key guard (`conferirFluxoDaChave`, `autenticacao.ts`) carries the key's session `fluxoId` and
 *
 * - on a route PER FLOW, only lets it act on its own flow (another flow is 403);
 * - on a route that is NOT per flow, it refuses (403 `chave_de_fluxo`) — a Pipe decision, explained in the guard itself;
 * - an ACCOUNT key (`fluxo_id` null) behaves as always: the whole tenant;
 * - revoked is 401, and the scope is still checked before the fence.
 *
 * The key is created through the real route (`POST /v1/gestao/fluxos/:id/chaves`), with a browser session, to prove it's THIS key — the one the screen hands the client — that comes out fenced.
 */

let a: Cenario;
let api: ApiNoAr;
let session: string;
let flowA: string;
let flowB: string;
/** Chave criada na tela do fluxo A: `conversas:*`, `mensagens:*`, `contatos:ler`. */
let keyOfFlowA: string;

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
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

async function createFlow(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
  `);
  return rows[0]!.id;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

function withKey(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

type Resposta = { status: number; body: Record<string, unknown> };

async function chamar(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  cabecalhos: Record<string, string>,
  corpo?: unknown,
): Promise<Resposta> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return {
    status: resposta.status,
    body: ((await resposta.json().catch(() => null)) ?? {}) as Record<string, unknown>,
  };
}

/** O erro estruturado de `erros.ts`: `{ erro: { codigo, mensagem, detalhe? } }`. */
function errorOf(resposta: Resposta): { code: string; message: string; detalhe?: Record<string, unknown> } {
  return resposta.body['erro'] as { code: string; message: string; detalhe?: Record<string, unknown> };
}

/** Creates the flow key through the screen's ROUTE, and returns the `pipe_…` token. */
async function keyOfScreen(flowId: string, nome: string): Promise<{ id: string; token: string }> {
  const criada = await chamar('POST', `/v1/management/flows/${flowId}/keys`, comCookie(session), { nome });
  expect(criada.status).toBe(201);
  return { id: criada.body['id'] as string, token: criada.body['token'] as string };
}

/** An Express request already matched to the route — what the guard sees. */
function requestMatched(padrao: string, params: Record<string, string>): Request {
  return { params, route: { path: padrao } } as unknown as Request;
}

beforeAll(async () => {
  a = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  const gestor = await pessoaCom(a, ['chave_api.gerenciar']);
  api = await upApi(0);
  session = await openSession(a, gestor);
  flowA = await createFlow(a, `Fluxo A ${randomUUID().slice(0, 6)}`);
  flowB = await createFlow(a, `Fluxo B ${randomUUID().slice(0, 6)}`);
  keyOfFlowA = (await keyOfScreen(flowA, 'Integração do fluxo A')).token;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('Enforce the flow-key boundary using the key flow and matched route', () => {
  it('Allow a flow A key only on flow A and return 403 on flow B', () => {
    const key = { flowId: flowA };
    expect(() => checkFlowOfKey(key, flowA)).not.toThrow();
    // // A uuid arrives in different case depending on who wrote it; the fence isn't sensitive to that.
    expect(() => checkFlowOfKey(key, flowA.toUpperCase())).not.toThrow();

    let error: unknown;
    try {
      checkFlowOfKey(key, flowB);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      status: 403,
      codigo: 'chave_de_outro_fluxo',
      detalhe: { fluxoId: flowA },
    });
    expect((error as Error).message).toBe('Esta chave pertence a outro fluxo e não pode agir neste.');
  });

  it('Return 403 with `chave_de_fluxo` for flow keys on nonflow routes while allowing account keys', () => {
    let erro: unknown;
    try {
      checkFlowOfKey({ flowId: flowA }, null);
    } catch (e) {
      erro = e;
    }
    expect(erro).toMatchObject({ status: 403, codigo: 'chave_de_fluxo' });
    expect((erro as Error).message).toContain('/v1/management/flows/:id/');

    expect(() => checkFlowOfKey({ flowId: null }, null)).not.toThrow();
    expect(() => checkFlowOfKey({ flowId: null }, flowA)).not.toThrow();
    expect(() => checkFlowOfKey({ flowId: null }, flowB)).not.toThrow();
  });

  it('Read `:id` after /fluxos/ or `:flowId` elsewhere without matching unrelated routes', () => {
    expect(flowOfRoute(requestMatched('/v1/management/flows/:id/keys', { id: flowA }))).toBe(flowA);
    expect(flowOfRoute(requestMatched('/v1/management/flows/:id', { id: flowB }))).toBe(flowB);
    expect(
      flowOfRoute(
        requestMatched('/v1/management/flows/:fluxoId/links-tracked/:linkId', {
          fluxoId: flowA,
          linkId: randomUUID(),
        }),
      ),
    ).toBe(flowA);
    // // A conversation `:id` isn't a flow, even if the value happens to match a flow's id.
    expect(flowOfRoute(requestMatched('/v1/conversations/:id/messages', { id: flowA }))).toBeNull();
    expect(flowOfRoute(requestMatched('/v1/conversations', {}))).toBeNull();
  });
});

describe('Constrain flow API keys to flow routes', () => {
  it('Return 403 for flow keys on nonflow routes while allowing account keys', async () => {
    const recusada = await chamar('GET', '/v1/conversations', withKey(keyOfFlowA));
    expect(recusada.status).toBe(403);
    expect(errorOf(recusada).code).toBe('key_of_flow');
    expect(errorOf(recusada).message).toContain('só vale nas rotas desse fluxo');
    expect(errorOf(recusada).detalhe).toEqual({ flowId: flowA });

    const escrita = await chamar('POST', `/v1/conversations/${randomUUID()}/messages`, withKey(keyOfFlowA), {
      texto: 'oi',
    });
    expect(escrita.status).toBe(403);
    expect(errorOf(escrita).code).toBe('key_of_flow');

    // Chave de CONTA: o tenant inteiro, como hoje.
    const account = await chamar('GET', '/v1/conversations', withKey(a.token));
    expect(account.status).toBe(200);
    expect(account.body).toHaveProperty('data');
  });

  it('Check the scope before enforcing the flow-key boundary', async () => {
    // // The flow key is born without `filas:ler`: the refusal is a SCOPE one, not a flow one.
    const withoutScope = await chamar('GET', '/v1/queues', withKey(keyOfFlowA));
    expect(withoutScope.status).toBe(403);
    expect(errorOf(withoutScope).code).toBe('without_scope');
    expect(errorOf(withoutScope).detalhe).toEqual({ escopo: 'filas:ler' });

    // // An account key with only `filas:ler`: gets into queues, blocked on conversations — as always.
    const queues = await chamar('GET', '/v1/queues', withKey(a.tokenWithoutScope));
    expect(queues.status).toBe(200);
    const conversations = await chamar('GET', '/v1/conversations', withKey(a.tokenWithoutScope));
    expect(conversations.status).toBe(403);
    expect(errorOf(conversations).code).toBe('without_scope');
  });

  it('Return 401 for revoked flow keys before checking scope or flow', async () => {
    const { id, token } = await keyOfScreen(flowB, 'A revogar');
    const viva = await chamar('GET', '/v1/conversations', withKey(token));
    expect(viva.status).toBe(403); // válida, só cercada
    expect(errorOf(viva).code).toBe('key_of_flow');

    const revogada = await chamar('DELETE', `/v1/management/flows/${flowB}/keys/${id}`, comCookie(session));
    expect(revogada.status).toBe(204);

    const depois = await chamar('GET', '/v1/conversations', withKey(token));
    expect(depois.status).toBe(401);
    expect(errorOf(depois).code).toBe('not_authorized');
    expect(errorOf(depois).message).toBe('Chave revogada.');

    const filas = await chamar('GET', '/v1/queues', withKey(token));
    expect(filas.status).toBe(401);
  });

  it('Bind the access key row to its flow for authorization', async () => {
    const { rows } = await a.dono.execute<{ flowId: string | null; scopes: string[] }>(sql`
      select fluxo_id, escopos from chave_api
       where tenant_id = ${a.tenantId} and prefixo = ${keyOfFlowA.split('_')[1]}
    `);
    expect(rows[0]?.flowId).toBe(flowA);
    expect(rows[0]?.scopes).toContain('conversas:ler');
    expect(rows[0]?.scopes).not.toContain('filas:ler');
  });
});
