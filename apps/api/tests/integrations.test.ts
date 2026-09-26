import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 29).toString('base64')}`;

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The flow's three Integrations screens (`dominio/gestao/integracoes.ts`): per-flow access keys, connection information and the outbound webhook. Worth proving: the two distinct permissions (`chave_api.gerenciar` for the key, `automacao.integracao.gerenciar` for webhook/connection — reading the connection uses `automacao.fluxo.editar`), the 3-key limit, the secret/token appearing only at creation and never again, SSRF rejection (http, localhost, private IP), cross-tenant and malformed uuid both returning 404, and `webhook_saida` belonging to the ACCOUNT (it does not filter by flow).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Has all three permissions — key, integration and flow editing. */
let sessionComplete: string;
/** Only edits the flow: proves that reading the connection does not require the integration permission. */
let sessionOnlyEditor: string;
/** None of the three. */
let sessionWithoutPoder: string;
/** Tenant B, with all three permissions — proves the tenant comes from the session. */
let sessionOfOtherTenant: string;
let flowId: string;

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
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiresAt}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

async function createFlow(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
  `);
  return rows[0]!.id;
}

type Resposta<T> = { status: number; body: T };

async function pedir<T>(
  caminho: string,
  session: string,
  init: RequestInit = {},
): Promise<Resposta<T>> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    ...init,
    headers: comCookie(session),
  });
  return { status: resposta.status, corpo: (await resposta.json().catch(() => null)) as T };
}

const get = <T>(caminho: string, sessao: string) => pedir<T>(caminho, sessao);
const post = <T>(caminho: string, sessao: string, corpo?: unknown) =>
  pedir<T>(caminho, sessao, { method: 'POST', body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
const patch = <T>(caminho: string, sessao: string, corpo: unknown) =>
  pedir<T>(caminho, sessao, { method: 'PATCH', body: JSON.stringify(corpo) });
const put = <T>(caminho: string, sessao: string, corpo: unknown) =>
  pedir<T>(caminho, sessao, { method: 'PUT', body: JSON.stringify(corpo) });
const del = <T>(caminho: string, sessao: string) => pedir<T>(caminho, sessao, { method: 'DELETE' });

beforeAll(async () => {
  a = await montarCenario(`ig-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ig-${randomUUID().slice(0, 8)}`);

  const completo = await pessoaCom(a, [
    'chave_api.gerenciar',
    'automacao.integracao.gerenciar',
    'automacao.fluxo.editar',
  ]);
  const soEditor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  const completoDoB = await pessoaCom(b, [
    'chave_api.gerenciar',
    'automacao.integracao.gerenciar',
    'automacao.fluxo.editar',
  ]);

  api = await upApi(0);
  sessionComplete = await openSession(a, completo);
  sessionOnlyEditor = await openSession(a, soEditor);
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, completoDoB);
  flowId = await createFlow(a, `Fluxo de integração ${randomUUID().slice(0, 6)}`);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('Manage flow access keys', () => {
  it('Show a flow access token only at creation and its prefix in later lists', async () => {
    const { status, corpo } = await post<{
      id: string;
      nome: string;
      prefix: string;
      token: string;
    }>(`/v1/management/flows/${flowId}/keys`, sessionComplete, { nome: 'Integração CRM' });
    expect(status).toBe(201);
    expect(corpo.token).toMatch(/^pipe_[0-9a-f]{12}_[0-9a-f]{48}$/);
    expect(corpo.prefix).toBe(corpo.token.split('_')[1]);

    const linha = (
      await a.dono.execute<{ hash: string; flowId: string }>(sql`
        select hash, fluxo_id from chave_api where id = ${corpo.id}::uuid
      `)
    ).rows[0];
    expect(linha?.fluxo_id).toBe(flowId);
    // The database stores the sha256 HASH, not the plaintext secret that came in the token.
    expect(linha?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(linha?.hash).not.toBe(corpo.token.split('_')[2]);

    const lista = await get<Array<Record<string, unknown>>>(
      `/v1/management/flows/${flowId}/keys`,
      sessionComplete,
    );
    expect(lista.status).toBe(200);
    const criada = lista.corpo.find((c) => c['id'] === corpo.id);
    expect(criada).toBeDefined();
    expect(criada).not.toHaveProperty('token');
    expect(criada).not.toHaveProperty('hash');
    expect(criada?.['prefixo']).toBe(corpo.prefix);
  });

  it('sem nome é 400; no limite de 3 chaves vivas, a quarta é 400', async () => {
    const flowOfLimit = await createFlow(a, `Limite ${randomUUID().slice(0, 6)}`);
    const semNome = await post(`/v1/management/flows/${flowOfLimit}/keys`, sessionComplete, {
      nome: '   ',
    });
    expect(semNome.status).toBe(400);
    expect((semNome.corpo as { error: { code: string } }).error.codigo).toBe('name_missing');

    for (let i = 0; i < 3; i += 1) {
      const criada = await post(`/v1/management/flows/${flowOfLimit}/keys`, sessionComplete, {
        nome: `Chave ${i}`,
      });
      expect(criada.status).toBe(201);
    }
    const quarta = await post(`/v1/management/flows/${flowOfLimit}/keys`, sessionComplete, {
      nome: 'Quarta',
    });
    expect(quarta.status).toBe(400);
    expect((quarta.corpo as { error: { code: string } }).erro.codigo).toBe('limit_of_keys');
  });

  it('Return 403 without `chave_api.gerenciar` and 404 for invalid or cross-tenant IDs', async () => {
    const semPoder = await post(`/v1/management/flows/${flowId}/keys`, sessionWithoutPoder, {
      nome: 'Proibida',
    });
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo as { error: { detalhe: { permission: string } } }).erro.detalhe.permission).toBe(
      'chave_api.gerenciar',
    );

    const outroTenant = await post(`/v1/management/flows/${flowId}/keys`, sessionOfOtherTenant, {
      nome: 'Vizinho',
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await get(`/v1/management/flows/nao-e-uuid/keys`, sessionComplete);
    expect(malformado.status).toBe(404);
  });

  it('Revoke access keys idempotently and reject cross-tenant or unauthorized requests', async () => {
    const criada = await post<{ id: string }>(`/v1/management/flows/${flowId}/keys`, sessionComplete, {
      nome: `A revogar ${randomUUID().slice(0, 6)}`,
    });
    expect(criada.status).toBe(201);
    const keyId = criada.corpo.id;

    const outroTenant = await del(`/v1/management/flows/${flowId}/keys/${keyId}`, sessionOfOtherTenant);
    expect(outroTenant.status).toBe(404);

    const semPoder = await del(`/v1/management/flows/${flowId}/keys/${keyId}`, sessionWithoutPoder);
    expect(semPoder.status).toBe(403);

    const first = await del(`/v1/management/flows/${flowId}/keys/${keyId}`, sessionComplete);
    expect(first.status).toBe(204);

    const linha = (
      await a.dono.execute<{ revogada_em: Date | null }>(
        sql`select revogada_em from chave_api where id = ${keyId}::uuid`,
      )
    ).rows[0];
    expect(linha).toBeDefined();
    expect(linha?.revogada_em).not.toBeNull();

    // Idempotent: revoking again is not an error, and it does not duplicate the audit record.
    const segunda = await del(`/v1/management/flows/${flowId}/keys/${keyId}`, sessionComplete);
    expect(segunda.status).toBe(204);
    const log = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from log_auditoria
       where objeto_tipo = 'chave_api' and objeto_id = ${keyId}::uuid and acao = 'desativou'
    `);
    expect(log.rows[0]?.n).toBe('1');

    const visiveis = await get<Array<{ id: string }>>(
      `/v1/management/flows/${flowId}/keys`,
      sessionComplete,
    );
    expect(visiveis.corpo.some((key) => key.id === keyId)).toBe(false);

    const nova = await post(`/v1/management/flows/${flowId}/keys`, sessionComplete, {
      nome: 'Depois de revogar',
    });
    expect(nova.status).toBe(201);
  });
});

describe('Read flow connection details', () => {
  it('Read real flow connection identifiers and endpoints with `automacao.fluxo.editar`', async () => {
    const connectionFlow = await createFlow(a, `Conexão ${randomUUID().slice(0, 6)}`);
    const { status, corpo } = await get<{
      flowId: string;
      endpoint: string;
      keyPrefix: string | null;
      urlMessages: string | null;
      urlNotifications: string | null;
    }>(`/v1/management/flows/${connectionFlow}/connection`, sessionOnlyEditor);
    expect(status).toBe(200);
    expect(corpo.flowId).toBe(connectionFlow);
    expect(corpo.endpoint).toMatch(/\/v1$/);
    expect(corpo.urlMessages).toBeNull();
    expect(corpo.urlNotifications).toBeNull();
  });

  it('recusa SSRF: http, localhost e IP privado; aceita https e some ao apagar', async () => {
    const conexaoFluxo = await createFlow(a, `SSRF ${randomUUID().slice(0, 6)}`);

    for (const urlProibida of [
      'http://exemplo.pipe.app/webhook',
      'https://localhost/webhook',
      'https://127.0.0.1/webhook',
      'https://10.0.0.5/webhook',
      'https://192.168.1.1/webhook',
    ]) {
      const resposta = await put(`/v1/management/flows/${conexaoFluxo}/connection`, sessionComplete, {
        urlMensagens: urlProibida,
      });
      expect(resposta.status, urlProibida).toBe(400);
    }

    const salva = await put<{ urlMensagens: string | null }>(
      `/v1/management/flows/${conexaoFluxo}/connection`,
      sessionComplete,
      { urlMensagens: 'https://exemplo.pipe.app/mensagens' },
    );
    expect(salva.status).toBe(200);
    expect(salva.corpo.urlMensagens).toBe('https://exemplo.pipe.app/mensagens');

    const relida = await get<{ urlMensagens: string | null }>(
      `/v1/management/flows/${conexaoFluxo}/connection`,
      sessionOnlyEditor,
    );
    expect(relida.corpo.urlMensagens).toBe('https://exemplo.pipe.app/mensagens');

    const apagada = await put<{ urlMensagens: string | null }>(
      `/v1/management/flows/${conexaoFluxo}/connection`,
      sessionComplete,
      { urlMensagens: null },
    );
    expect(apagada.status).toBe(200);
    expect(apagada.corpo.urlMensagens).toBeNull();
  });

  it('Require `automacao.integracao.gerenciar` to save a flow connection, even for flow editors', async () => {
    const conexaoFluxo = await createFlow(a, `Sem integração ${randomUUID().slice(0, 6)}`);
    const resposta = await put(`/v1/management/flows/${conexaoFluxo}/connection`, sessionOnlyEditor, {
      urlMensagens: 'https://exemplo.pipe.app/mensagens',
    });
    expect(resposta.status).toBe(403);
    expect((resposta.corpo as { error: { detalhe: { permissao: string } } }).erro.detalhe.permissao).toBe(
      'automacao.integracao.gerenciar',
    );
  });

  it('cross-tenant e uuid malformado são 404', async () => {
    const outroTenant = await get(`/v1/management/flows/${flowId}/connection`, sessionOfOtherTenant);
    expect(outroTenant.status).toBe(404);
    const malformado = await get(`/v1/management/flows/nao-e-uuid/connection`, sessionComplete);
    expect(malformado.status).toBe(404);
  });
});

describe('Send outgoing webhooks for integrations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Show a webhook secret once and reject SSRF targets or unsupported events', async () => {
    const semEventos = await post(`/v1/management/webhooks`, sessionComplete, {
      url: 'https://exemplo.pipe.app/hook',
      eventos: [],
    });
    expect(semEventos.status).toBe(400);
    expect((semEventos.corpo as { error: { code: string } }).erro.codigo).toBe('events_missing');

    const eventoInvalido = await post(`/v1/management/webhooks`, sessionComplete, {
      url: 'https://exemplo.pipe.app/hook',
      eventos: ['isto.nao.existe'],
    });
    expect(eventoInvalido.status).toBe(400);
    expect((eventoInvalido.corpo as { error: { code: string } }).erro.codigo).toBe('event_invalid');

    const http = await post(`/v1/management/webhooks`, sessionComplete, {
      url: 'http://exemplo.pipe.app/hook',
      eventos: ['mensagem.criada'],
    });
    expect(http.status).toBe(400);

    const privado = await post(`/v1/management/webhooks`, sessionComplete, {
      url: 'https://169.254.169.254/hook',
      eventos: ['mensagem.criada'],
    });
    expect(privado.status).toBe(400);

    const criado = await post<{ id: string; url: string; eventos: string[]; secret: string }>(
      `/v1/management/webhooks`,
      sessionComplete,
      { url: `https://exemplo.pipe.app/hook-${randomUUID().slice(0, 8)}`, eventos: ['mensagem.criada', 'conversa.criada'] },
    );
    expect(criado.status).toBe(201);
    expect(criado.corpo.secret).toMatch(/^[0-9a-f]{64}$/);

    const lista = await get<Array<Record<string, unknown>>>(`/v1/management/webhooks`, sessionComplete);
    const linha = lista.corpo.find((w) => w['id'] === criado.corpo.id);
    expect(linha).not.toHaveProperty('segredo');
    expect(linha?.['ativo']).toBe(true);
  });

  it('Audit webhook activation and deletion and remove deleted rows', async () => {
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/toggle-${randomUUID().slice(0, 8)}`,
      eventos: ['contato.criado'],
    });
    const id = criado.corpo.id;

    const desativado = await patch<{ active: boolean }>(`/v1/management/webhooks/${id}`, sessionComplete, {
      active: false,
    });
    expect(desativado.status).toBe(200);
    expect(desativado.corpo.ativo).toBe(false);

    const ativado = await patch<{ active: boolean }>(`/v1/management/webhooks/${id}`, sessionComplete, {
      active: true,
    });
    expect(ativado.corpo.ativo).toBe(true);

    const log = await a.dono.execute<{ acao: string }>(sql`
      select acao from log_auditoria
       where objeto_tipo = 'webhook_saida' and objeto_id = ${id}::uuid
       order by em asc
    `);
    expect(log.rows.map((l) => l.acao)).toEqual(['criou', 'desativou', 'ativou']);

    const excluido = await del(`/v1/management/webhooks/${id}`, sessionComplete);
    expect(excluido.status).toBe(204);
    const restante = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from webhook_saida where id = ${id}::uuid`,
    );
    expect(restante.rows[0]?.n).toBe('0');
  });

  it('Sign and send test webhooks and return a network failure without recording a delivery', async () => {
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/teste-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
    });
    const id = criado.corpo.id;

    // The global `fetch` is used both by the domain code (to "deliver" to the webhook)
    // and by THIS test itself (to call the `api` process) — the same process,
    // the same global. The stub intercepts only the fake webhook URL and lets
    // everything bound for `api.url` (the test server) pass through the real fetch,
    // otherwise the test would be talking to itself.
    const fetchOfTruth = fetch;
    const chamadas: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchOfTruth(url, init);
        chamadas.push([url, init]);
        return new Response('ok', { status: 200 });
      }),
    );

    const ok = await post<{ ok: boolean; status?: number }>(
      `/v1/management/webhooks/${id}/test`,
      sessionComplete,
    );
    expect(ok.status).toBe(200);
    expect(ok.corpo.ok).toBe(true);
    expect(ok.corpo.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    const [, init] = chamadas[0]!;
    const cabecalhos = init?.headers as Record<string, string>;
    expect(cabecalhos['x-pipe-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchOfTruth(url, init);
        throw new Error('falha de rede simulada');
      }),
    );
    const falhou = await post<{ ok: boolean; error?: string }>(
      `/v1/management/webhooks/${id}/test`,
      sessionComplete,
    );
    expect(falhou.status).toBe(200);
    expect(falhou.corpo.ok).toBe(false);
    expect(falhou.corpo.erro).toContain('falha de rede simulada');

    const entregas = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from entrega_webhook where webhook_id = ${id}::uuid`,
    );
    expect(entregas.rows[0]?.n).toBe('0');
  });

  it('Return 403 without `automacao.integracao.gerenciar` and 404 for invalid or cross-tenant IDs', async () => {
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/perm-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
    });
    const id = criado.corpo.id;

    const semPoder = await get(`/v1/management/webhooks`, sessionWithoutPoder);
    expect(semPoder.status).toBe(403);

    const outroTenant = await patch(`/v1/management/webhooks/${id}`, sessionOfOtherTenant, { active: false });
    expect(outroTenant.status).toBe(404);

    const malformado = await del(`/v1/management/webhooks/nao-e-uuid`, sessionComplete);
    expect(malformado.status).toBe(404);
  });
});

describe('Authenticate outgoing webhooks and attach custom headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Encrypt Basic-auth passwords and use them without returning them', async () => {
    const criado = await post<{ id: string; authentication: Record<string, unknown> }>(
      `/v1/management/webhooks`,
      sessionComplete,
      {
        url: `https://exemplo.pipe.app/basica-${randomUUID().slice(0, 8)}`,
        eventos: ['mensagem.criada'],
        autenticacao: { tipo: 'basica', usuario: 'robo', senha: 'segredo-123' },
      },
    );
    expect(criado.status).toBe(201);
    expect(criado.corpo.authentication).toEqual({
      tipo: 'basica',
      usuario: 'robo',
      urlAutorizacao: null,
      clientId: null,
    });
    const id = criado.corpo.id;

    const linha = (
      await a.dono.execute<{ authenticationPassword: string }>(
        sql`select autenticacao_senha from webhook_saida where id = ${id}::uuid`,
      )
    ).rows[0];
    expect(linha?.authenticationPassword).toMatch(/^pipev1\./);
    expect(linha?.authenticationPassword).not.toContain('segredo-123');

    const lista = await get<Array<Record<string, unknown>>>(`/v1/management/webhooks`, sessionComplete);
    const naLista = lista.corpo.find((w) => w['id'] === id);
    expect(JSON.stringify(naLista)).not.toContain('segredo-123');
    expect(JSON.stringify(naLista)).not.toContain('pipev1.');

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        return new Response('recebido', { status: 200 });
      }),
    );
    const test = await post<{ ok: boolean; body?: string }>(
      `/v1/management/webhooks/${id}/test`,
      sessionComplete,
    );
    expect(test.status).toBe(200);
    expect(test.corpo.ok).toBe(true);
    expect(test.corpo.corpo).toBe('recebido');
    const cabecalhos = chamadas[0]?.[1]?.headers as Record<string, string>;
    expect(cabecalhos['authorization']).toBe(
      `Basic ${Buffer.from('robo:segredo-123').toString('base64')}`,
    );
  });

  it('Fetch an OAuth client_credentials token and use it as a Bearer token', async () => {
    const urlToken = `https://exemplo.pipe.app/oauth-${randomUUID().slice(0, 8)}/token`;
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/oauth-destino-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: {
        tipo: 'oauth2_client_credentials',
        urlAutorizacao: urlToken,
        clientId: 'cliente-abc',
        clientSecret: 'segredo-oauth-xyz',
      },
    });
    expect(criado.status).toBe(201);
    const id = criado.corpo.id;

    const linha = (
      await a.dono.execute<{ oauth2_client_secret: string }>(
        sql`select oauth2_client_secret from webhook_saida where id = ${id}::uuid`,
      )
    ).rows[0];
    expect(linha?.oauth2_client_secret).toMatch(/^pipev1\./);
    expect(linha?.oauth2_client_secret).not.toContain('segredo-oauth-xyz');

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        if (url === urlToken) {
          return new Response(JSON.stringify({ access_token: 'token-de-mentira' }), { status: 200 });
        }
        return new Response('ok', { status: 200 });
      }),
    );
    const teste = await post<{ ok: boolean }>(`/v1/management/webhooks/${id}/test`, sessionComplete);
    expect(teste.status).toBe(200);
    expect(teste.corpo.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
    const [chamadaToken, chamadaDestination] = chamadas as [
      [string, RequestInit | undefined],
      [string, RequestInit | undefined],
    ];
    expect(chamadaToken[0]).toBe(urlToken);
    expect(String(chamadaToken[1]?.body)).toContain('grant_type=client_credentials');
    expect(String(chamadaToken[1]?.body)).toContain('client_secret=segredo-oauth-xyz');
    const headersDestination = chamadaDestination[1]?.headers as Record<string, string>;
    expect(headersDestination['authorization']).toBe('Bearer token-de-mentira');
  });

  it('Include custom headers in webhook deliveries without breaking the signature', async () => {
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/cabecalhos-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [{ chave: 'X-Minha-Chave', valor: 'valor-customizado' }],
    });
    expect(criado.status).toBe(201);
    const id = criado.corpo.id;

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        return new Response('ok', { status: 200 });
      }),
    );
    const teste = await post<{ ok: boolean }>(`/v1/management/webhooks/${id}/test`, sessionComplete);
    expect(teste.status).toBe(200);
    expect(teste.corpo.ok).toBe(true);
    const cabecalhos = chamadas[0]?.[1]?.headers as Record<string, string>;
    expect(cabecalhos['X-Minha-Chave']).toBe('valor-customizado');
    expect(cabecalhos['x-pipe-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('Reject reserved or duplicate headers and incomplete authentication', async () => {
    const reservado = await post(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/reservado-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [{ chave: 'Content-Type', valor: 'text/plain' }],
    });
    expect(reservado.status).toBe(400);
    expect((reservado.corpo as { error: { code: string } }).erro.codigo).toBe('header_reserved');

    const repetido = await post(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/repetido-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [
        { chave: 'X-A', valor: '1' },
        { chave: 'x-a', valor: '2' },
      ],
    });
    expect(repetido.status).toBe(400);
    expect((repetido.corpo as { error: { code: string } }).erro.codigo).toBe('header_repeated');

    const semSenha = await post(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/incompleta-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: { tipo: 'basica', usuario: 'robo' },
    });
    expect(semSenha.status).toBe(400);
    expect((semSenha.corpo as { error: { code: string } }).erro.codigo).toBe('authentication_incomplete');

    const oauthSsrf = await post(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/oauth-ssrf-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: {
        tipo: 'oauth2_client_credentials',
        urlAutorizacao: 'http://169.254.169.254/token',
        clientId: 'x',
        clientSecret: 'y',
      },
    });
    expect(oauthSsrf.status).toBe(400);
  });

  it('Replace webhook authentication as a whole on edit and return 404 across tenants', async () => {
    const criado = await post<{ id: string }>(`/v1/management/webhooks`, sessionComplete, {
      url: `https://exemplo.pipe.app/editar-auth-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: { tipo: 'basica', usuario: 'robo', senha: 'senha-1' },
    });
    const id = criado.corpo.id;

    const editado = await patch<{ autenticacao: Record<string, unknown> }>(
      `/v1/management/webhooks/${id}`,
      sessionComplete,
      { autenticacao: { tipo: 'nenhuma' } },
    );
    expect(editado.status).toBe(200);
    expect(editado.corpo.autenticacao).toEqual({
      tipo: 'nenhuma',
      usuario: null,
      urlAutorizacao: null,
      clientId: null,
    });

    const outroTenant = await patch(`/v1/management/webhooks/${id}`, sessionOfOtherTenant, {
      autenticacao: { tipo: 'nenhuma' },
    });
    expect(outroTenant.status).toBe(404);
  });
});
