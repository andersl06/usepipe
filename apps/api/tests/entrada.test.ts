import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_URL_APP'] = 'http://telas.teste';
process.env['PIPE_URL_ENTRADA'] = 'http://telas.teste/entrar';
process.env['PIPE_ORIGENS'] = 'http://telas.teste,http://gestao.teste';
process.env['GOOGLE_CLIENTE_ID'] = 'cliente-de-teste.apps.googleusercontent.com';
process.env['GOOGLE_CLIENTE_SEGREDO'] = 'segredo-de-teste';
process.env['GOOGLE_URL_RETORNO'] = 'http://127.0.0.1:3100/v1/auth/google/callback';
process.env['PIPE_METRICS_TOKEN'] = 'token-de-metricas';

const { InboundRefusedEntradaRecusadaInboundRefused, LoginErrorLoginErroLoginError, NOME_DO_COOKIE, createTokencriarTokencreateToken } =
  await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { baseDoApp, codigoDaRecusa, destinationAbsolute, urlOfError } = await import(
  '../src/controladores/entrar.js',
);
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Entrar, `GET /v1/eu`, sair, `/saude` e `/metrics`.
 *
 * O que não está aqui e é de propósito: a conversa com o Google. `trocarCodigo` e
 * `entrarComGoogle` já têm teste em `packages/autenticacao`, e repetir a troca de
 * código aqui exigiria dublar o JWKS para provar de novo o que já está provado. O
 * que este arquivo cobre é a casca: o guarda, o formato do `Eu`, a tradução dos
 * códigos de recusa e o que sai em cookie e em redirecionamento.
 */

let cenario: Cenario;
let api: ApiNoAr;
let sessionToken: string;
const PERMISSIONS = ['conversa.responder', 'conversa.ver', 'relatorio.ver'];

/** Dois papéis com permissão em comum: prova que a união vem sem repetido. */
async function seedIdentity(): Promise<void> {
  const dono = cenario.dono;
  for (const codigo of PERMISSIONS) {
    await dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }

  const papeis: string[] = [];
  for (const [nome, codigos] of [
    ['Atendente e2e', ['conversa.ver', 'conversa.responder']],
    ['Supervisor e2e', ['conversa.ver', 'relatorio.ver']],
  ] as const) {
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
    `);
    const roleId = rows[0]!.id;
    papeis.push(roleId);
    for (const codigo of codigos) {
      await dono.execute(sql`
        insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
        values (${cenario.tenantId}, ${roleId}, ${codigo})
      `);
    }
  }

  for (const roleId of papeis) {
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.agentId}, ${roleId})
    `);
  }
}

/** Grava uma sessão viva e devolve o token que iria para o cookie. */
async function openSession(durationMs?: number): Promise<string> {
  const novo = createTokencriarTokencreateToken(durationMs);
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiresAt},
            'google')
  `);
  return novo.token;
}

function comCookie(token: string | undefined): Record<string, string> {
  return token ? { cookie: `${NOME_DO_COOKIE}=${token}` } : {};
}

beforeAll(async () => {
  cenario = await montarCenario(randomUUID().slice(0, 8));
  await seedIdentity();
  api = await upApi(0);
  sessionToken = await openSession();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('Require a session cookie for protected routes', () => {
  it('sem cookie, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`);
    expect(resposta.status).toBe(401);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.codigo).toBe('not_authorized');
  });

  it('cookie com token inexistente, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: comCookie('token-que-nunca-existiu'),
    });
    expect(resposta.status).toBe(401);
  });

  it('Return the same 401 for expired and absent sessions', async () => {
    const vencida = await openSession(-1_000);
    const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(vencida) });
    expect(resposta.status).toBe(401);
  });
});

describe('GET /v1/eu', () => {
  it('Return the contracted current-user object with role permissions', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(sessionToken) });
    expect(resposta.status).toBe(200);

    const eu = (await resposta.json()) as {
      user: { id: string; name: string; email: string; avatarUrl: string | null };
      tenant: { id: string; name: string; slug: string; plan: string };
      permissions: string[];
      origin: string;
    };

    expect(eu.user.id).toBe(cenario.agentId);
    expect(eu.user.nome).toBe('Ana Ribeiro');
    expect(eu.user.avatarUrl).toBeNull();
    expect(eu.tenant.id).toBe(cenario.tenantId);
    expect(eu.tenant.plano).toBe('essencial');
    expect(eu.origem).toBe('google');

    // União dos dois papéis, sem repetir `conversa.ver`.
    expect(eu.permissions).toEqual(PERMISSIONS);
  });

  it('Reject sessions belonging to disabled users', async () => {
    const token = await openSession();
    await cenario.dono.execute(
      sql`update usuario set ativo = false where id = ${cenario.agentId}::uuid`,
    );
    try {
      const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(token) });
      expect(resposta.status).toBe(401);
    } finally {
      await cenario.dono.execute(
        sql`update usuario set ativo = true where id = ${cenario.agentId}::uuid`,
      );
    }
  });
});

describe('POST /v1/auth/sair', () => {
  it('Close the session, clear its cookie, and invalidate the token', async () => {
    const token = await openSession();
    const resposta = await fetch(`${api.url}/v1/auth/sair`, {
      method: 'POST',
      headers: comCookie(token),
    });
    expect(resposta.status).toBe(204);
    expect(resposta.headers.get('set-cookie')).toContain('Max-Age=0');

    expect((await fetch(`${api.url}/v1/eu`, { headers: comCookie(token) })).status).toBe(401);
  });

  it('Allow logout without a cookie', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/sair`, { method: 'POST' });
    expect(resposta.status).toBe(204);
  });
});

describe('GET /v1/auth/google', () => {
  it('Store a short-lived challenge cookie and redirect to Google with PKCE', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google?returnTo=/conversas/42`, {
      redirect: 'manual',
    });
    expect(resposta.status).toBe(302);

    const destination = new URL(resposta.headers.get('location') ?? '');
    expect(destination.origin + destination.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(destination.searchParams.get('code_challenge_method')).toBe('S256');
    expect(destination.searchParams.get('code_challenge')).toBeTruthy();
    expect(destination.searchParams.get('state')).toBeTruthy();

    const cookie = resposta.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('pipe_challenge=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=300');
    expect(cookie).toContain('Path=/v1/auth');

    // O `state` do cookie tem que ser o mesmo que foi para o Google, senão a volta
    // nunca confere.
    const desafio = lerDesafioDoCookie(cookie);
    expect(desafio.state).toBe(destination.searchParams.get('state'));
    expect(desafio.destination).toBe('/conversas/42');
  });

  it('Discard absolute redirect destinations to prevent phishing', async () => {
    const resposta = await fetch(
      `${api.url}/v1/auth/google?returnTo=${encodeURIComponent('https://malvado.example/roubar')}`,
      { redirect: 'manual' },
    );
    expect(lerDesafioDoCookie(resposta.headers.get('set-cookie') ?? '').destination).toBe('/');
  });
});

describe('GET /v1/auth/google/callback', () => {
  it('Redirect to login when the challenge cookie is missing instead of returning 500', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google/callback?code=qualquer`, {
      redirect: 'manual',
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toBe(
      'http://telas.teste/entrar?error=falha_no_provedor',
    );
  });

  it('Treat a corrupt challenge cookie as a login refusal', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google/callback?code=x`, {
      redirect: 'manual',
      headers: { cookie: 'pipe_challenge=nao-e-base64-de-json' },
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toContain('erro=falha_no_provedor');
  });
});

describe('códigos de recusa', () => {
  it('Preserve the original login refusal code', () => {
    for (const codigo of [
      'domain_public',
      'domain_unknown',
      'without_invitation',
      'user_inactive',
    ] as const) {
      expect(codigoDaRecusa(new InboundRefusedEntradaRecusadaInboundRefused(codigo, 'motivo'))).toBe(codigo);
    }
  });

  it('e-mail não verificado pelo Google tem código próprio', () => {
    expect(codigoDaRecusa(new LoginErrorLoginErroLoginError('email_nao_verificado', 'sem confirmação'))).toBe(
      'email_nao_verificado',
    );
  });

  it('tudo o mais vira falha_no_provedor', () => {
    expect(codigoDaRecusa(new LoginErrorLoginErroLoginError('state_invalido', 'forjado'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(new LoginErrorLoginErroLoginError('troca_falhou', 'timeout'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(new Error('qualquer coisa'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(undefined)).toBe('falha_no_provedor');
  });
});

describe('CORS', () => {
  it('libera origem da lista, com credencial', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: { origin: 'http://telas.teste', ...comCookie(sessionToken) },
    });
    expect(resposta.headers.get('access-control-allow-origin')).toBe('http://telas.teste');
    expect(resposta.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('origem de fora da lista não recebe o cabeçalho — e nunca curinga', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: { origin: 'http://malvado.example', ...comCookie(sessionToken) },
    });
    expect(resposta.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET /saude', () => {
  it('Return 200 from health when the database is available', async () => {
    const resposta = await fetch(`${api.url}/saude`);
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      ok: boolean;
      version: string;
      database: string;
      redis: string;
    };
    expect(corpo.ok).toBe(true);
    expect(corpo.database).toBe('ok');
    expect(corpo.versao).toBeTruthy();
    expect(['ok', 'falha']).toContain(corpo.redis);
  });

  it('Allow unauthenticated health checks', async () => {
    expect((await fetch(`${api.url}/saude`)).status).toBe(200);
  });
});

describe('GET /metrics', () => {
  it('sem o token, 401 — métrica aberta vaza volume de cliente', async () => {
    const resposta = await fetch(`${api.url}/metrics`);
    expect(resposta.status).toBe(401);
  });

  it('Return Prometheus metrics with a valid token', async () => {
    const resposta = await fetch(`${api.url}/metrics`, {
      headers: { authorization: 'Bearer token-de-metricas' },
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toContain('text/plain');

    const texto = await resposta.text();
    expect(texto).toContain('# TYPE pipe_http_requests_total counter');
    expect(texto).toContain('# TYPE http_request_duration_seconds histogram');
    expect(texto).toContain('http_request_duration_seconds_bucket{');
    expect(texto).toContain('le="+Inf"');
    // O rótulo é o PADRÃO da rota, nunca o caminho com o uuid dentro.
    expect(texto).toContain('rota="/v1/eu"');
    expect(texto).not.toContain(`rota="/v1/conversations/${cenario.tenantId}`);

    // O balde acumulado nunca pode passar da contagem total da mesma série.
    const infinito = /http_request_duration_seconds_bucket\{[^}]*le="\+Inf"\} (\d+)/.exec(texto);
    const count = /http_request_duration_seconds_count\{[^}]*\} (\d+)/.exec(texto);
    expect(Number(infinito?.[1])).toBe(Number(count?.[1]));
  });
});

function lerDesafioDoCookie(cabecalho: string): {
  state: string;
  destination: string;
  origin?: string;
} {
  const value = /pipe_challenge=([^;]*)/.exec(cabecalho)?.[1] ?? '';
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
    state: string;
    destino: string;
    origin?: string;
  };
}

/**
 * A volta do login com TRÊS fronts.
 *
 * `PIPE_URL_APP` é um valor só e a API atende Gestão, Desk e CRM. Sem a origem
 * viajando no desafio, quem entra pelo CRM volta na Gestão — e o sintoma na VPS
 * seria "o login funciona, mas me joga no aplicativo errado".
 */
describe('a origem de quem começou o login', () => {
  it('origem da lista manda a volta para o aplicativo certo', () => {
    expect(destinationAbsolute('/leads', 'http://gestao.teste')).toBe('http://gestao.teste/leads');
    expect(urlOfError('without_invitation', 'http://gestao.teste')).toBe(
      'http://gestao.teste/entrar?error=sem_convite',
    );
  });

  it('Ignore unapproved origins to prevent open redirects during login', () => {
    expect(baseDoApp('https://malvado.example')).toBe('http://telas.teste');
    expect(destinationAbsolute('/', 'https://malvado.example')).toBe('http://telas.teste/');
  });

  it('sem origem, cai no fallback do ambiente', () => {
    expect(destinationAbsolute('/conversas')).toBe('http://telas.teste/conversas');
  });

  it('a barra final não separa a mesma origem em duas', () => {
    expect(baseDoApp('http://gestao.teste/')).toBe('http://gestao.teste');
  });

  it('Store the request origin in the challenge cookie', async () => {
    const resposta = await fetch(
      `${api.url}/v1/auth/google?origin=${encodeURIComponent('http://gestao.teste')}`,
      { redirect: 'manual' },
    );
    expect(lerDesafioDoCookie(resposta.headers.get('set-cookie') ?? '').origem).toBe(
      'http://gestao.teste',
    );
  });
});
