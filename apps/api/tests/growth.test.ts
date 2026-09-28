import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { forgetChannel } = await import('../src/database.js');
const { urlCurtaDe } = await import('../src/domain/rastreador-de-cliques.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Growth: the click tracker (short link + public redirect) and what was still missing from active-message coverage (`mensagens-ativas.test.ts` already covers the bulk of the dispatch itself).
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let flowId: string;
let templateId: string;

beforeAll(async () => {
  cenario = await montarCenario(`growth-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: bot } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, short_name) values (${cenario.tenantId}, 'Bot de teste', 'bot-de-teste') returning id
  `);
  flowId = bot[0]!.id;

  const { rows: tp } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                   status_meta, cabecalho_tipo)
    values (${cenario.tenantId}, ${cenario.channelId}, 'growth_teste', 'pt_BR', 'utilidade',
            'Olá', 'aprovado', 'nenhum')
    returning id
  `);
  templateId = tp[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

function comCookie(caminho: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${api.url}${caminho}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      cookie: `${NOME_DO_COOKIE}=${cookie}`,
      ...(init.headers ?? {}),
    },
  });
}

describe('Register tracked links and generate short codes', () => {
  it('cadastra o link e gera o código curto', async () => {
    const resposta = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Anúncio de setembro', destination: 'https://exemplo.com/promo' }),
    });
    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      code: string;
      urlCurta: string;
      cliques: number;
    };
    expect(corpo.code).toBeTruthy();
    expect(corpo.urlCurta.endsWith(`/l/${corpo.code}`)).toBe(true);
    expect(corpo.cliques).toBe(0);
  });

  it('Reject an empty tracked-link name', async () => {
    const resposta = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: '   ', destination: 'https://exemplo.com' }),
    });
    expect(resposta.status).toBe(400);
  });

  it('Reject tracked-link destinations that do not use HTTPS', async () => {
    const resposta = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: 'x', destination: 'http://exemplo.com' }),
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: { code: string } }).error.code).toBe(
      'url_needs_https',
    );
  });

  it('Reject tracked-link destinations on localhost or private networks', async () => {
    const local = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: 'x', destination: 'https://localhost/x' }),
    });
    expect(local.status).toBe(400);

    const privado = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: 'x', destination: 'https://192.168.0.5/x' }),
    });
    expect(privado.status).toBe(400);
    expect(((await privado.json()) as { error: { code: string } }).error.code).toBe(
      'url_forbidden',
    );
  });

  it('Return 404 for another tenant\'s flow without exposing its tracked links', async () => {
    const outro = await montarCenario(`growth-outro-${randomUUID().slice(0, 8)}`);
    try {
      const { rows } = await outro.dono.execute<{ id: string }>(sql`
        insert into fluxo (tenant_id, nome, short_name) values (${outro.tenantId}, 'Bot de outra conta', 'bot-de-outra-conta')
        returning id
      `);
      const resposta = await comCookie(`/v1/management/flows/${rows[0]!.id}/links-tracked`);
      expect(resposta.status).toBe(404);
    } finally {
      await outro.encerrar();
    }
  });
});

describe('Redirect public tracked links and count clicks', () => {
  let codigo: string;
  const destination = 'https://exemplo.com/pagina-do-clique';

  beforeAll(async () => {
    const resposta = await comCookie(`/v1/management/flows/${flowId}/links-tracked`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Redirecionamento', destination }),
    });
    codigo = ((await resposta.json()) as { code: string }).code;
  });

  it('Redirect publicly with 302 and record a click without a session', async () => {
    const resposta = await fetch(`${api.url}/l/${codigo}?origin=campanha-x`, {
      redirect: 'manual',
      headers: { 'user-agent': 'TesteAgente/1.0' },
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toBe(destination);

    const { rows } = await cenario.dono.execute<{
      n: string;
      userAgent: string | null;
      origin: string | null;
    }>(sql`
      select count(*)::text as n, max(c.agente_usuario) as "userAgent", max(c.origem) as "origin"
        from clique_link c
        join link_rastreado l on l.id = c.link_id
       where l.codigo = ${codigo}
    `);
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.userAgent).toBe('TesteAgente/1.0');
    expect(rows[0]!.origin).toBe('campanha-x');
  });

  it('Return 404 for an unknown short code', async () => {
    const resposta = await fetch(`${api.url}/l/nao-existe-mesmo`, { redirect: 'manual' });
    expect(resposta.status).toBe(404);
  });

  it('Return click counts when listing tracked links', async () => {
    const resposta = await comCookie(`/v1/management/flows/${flowId}/links-tracked`);
    const corpo = (await resposta.json()) as { data: { code: string; cliques: number }[] };
    const linha = corpo.data.find((item) => item.code === codigo);
    expect(linha?.cliques).toBeGreaterThanOrEqual(1);
  });

  it('Count only clicks within the requested period', async () => {
    const { rows: linkRow } = await cenario.dono.execute<{ id: string; tenant_id: string }>(sql`
      select id, tenant_id from link_rastreado where codigo = ${codigo}
    `);
    // A click from 10 days ago, written directly — outside the "since today" window.
    await cenario.dono.execute(sql`
      insert into clique_link (tenant_id, link_id, criado_em)
      values (${linkRow[0]!.tenant_id}, ${linkRow[0]!.id}::uuid, now() - interval '10 days')
    `);

    const hoje = new Date().toISOString().slice(0, 10);
    const geral = await comCookie(`/v1/management/flows/${flowId}/links-tracked`);
    const ofPeriod = await comCookie(
      `/v1/management/flows/${flowId}/links-tracked?desde=${hoje}T00:00:00Z`,
    );

    const cliquesGeral = (
      (await geral.json()) as { data: { code: string; cliques: number }[] }
    ).data.find((item) => item.code === codigo)?.cliques;
    const clicksOfPeriod = (
      (await ofPeriod.json()) as { data: { code: string; cliques: number }[] }
    ).data.find((item) => item.code === codigo)?.cliques;

    expect(cliquesGeral).toBeGreaterThanOrEqual((clicksOfPeriod ?? 0) + 1);
  });

  it('Rate-limit repeated clicks from one IP with 429', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let viu429 = false;
    for (let i = 0; i < 35 && !viu429; i++) {
      const resposta = await fetch(`${api.url}/l/${codigo}`, {
        redirect: 'manual',
        headers: { 'x-forwarded-for': ip },
      });
      if (resposta.status === 429) viu429 = true;
    }
    expect(viu429).toBe(true);
  });
});

describe('Reject active messages without a contact phone or contact ID', () => {
  it('Reject active messages without a contact phone or contact ID (`contato_id`)', async () => {
    const resposta = await comCookie('/v1/messages-active', {
      method: 'POST',
      body: JSON.stringify({
        channelId: cenario.channelId,
        template_id: templateId,
        contacts: [{ name: 'sem telefone nem id' }],
      }),
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: { code: string } }).error.code).toBe(
      'destination_invalid',
    );
  });

  it('Reject active-message sends through a disabled channel', async () => {
    await cenario.dono.execute(sql`update canal set ativo = false where id = ${cenario.channelId}::uuid`);
    forgetChannel(cenario.channelId); // `resolverCanal` guarda em memória; sem isto o teste veria o cache antigo.
    try {
      const resposta = await comCookie('/v1/messages-active', {
        method: 'POST',
        body: JSON.stringify({
          channelId: cenario.channelId,
          template_id: templateId,
          contacts: [{ phone: '+5511988880001' }],
        }),
      });
      expect(resposta.status).toBe(409);
      expect(((await resposta.json()) as { error: { code: string } }).error.code).toBe(
        'channel_inactive',
      );
    } finally {
      await cenario.dono.execute(sql`update canal set ativo = true where id = ${cenario.channelId}::uuid`);
      forgetChannel(cenario.channelId);
    }
  });

  it('Allow API keys with the required scope and return 403 without it', async () => {
    const withScope = await fetch(`${api.url}/v1/messages-active/limits`, {
      headers: { authorization: `Bearer ${cenario.token}` },
    });
    expect(withScope.status).toBe(200);

    const withoutScope = await fetch(`${api.url}/v1/messages-active/limits`, {
      headers: { authorization: `Bearer ${cenario.tokenWithoutScope}` },
    });
    expect(withoutScope.status).toBe(403);
    expect(((await withoutScope.json()) as { error: { code: string } }).error.code).toBe(
      'without_scope',
    );
  });
});

describe('Short tracked-link URL reads the public API base', () => {
  const chave = 'PIPE_URL_API_PUBLICA';
  const antes = process.env[chave];

  afterAll(() => {
    if (antes === undefined) delete process.env[chave];
    else process.env[chave] = antes;
  });

  it('uses PIPE_URL_API_PUBLICA, not the placeholder, once it is configured', () => {
    process.env[chave] = 'https://api.usepipe.com.br';
    expect(urlCurtaDe('abc123')).toBe('https://api.usepipe.com.br/l/abc123');
  });

  it('falls back to the documented placeholder when unset', () => {
    delete process.env[chave];
    expect(urlCurtaDe('abc123')).toBe('https://api.pipe.app/l/abc123');
  });
});
