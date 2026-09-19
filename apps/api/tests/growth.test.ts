import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { esquecerCanal } = await import('../src/banco.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Growth: o rastreador de cliques (link curto + redirecionamento público) e o que
 * faltava cobrir de mensagens ativas (`mensagens-ativas.test.ts` já cobre o grosso
 * do disparo em si).
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let fluxoId: string;
let templateId: string;

beforeAll(async () => {
  cenario = await montarCenario(`growth-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: bot } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome) values (${cenario.tenantId}, 'Bot de teste') returning id
  `);
  fluxoId = bot[0]!.id;

  const { rows: tp } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                   status_meta, cabecalho_tipo)
    values (${cenario.tenantId}, ${cenario.canalId}, 'growth_teste', 'pt_BR', 'utilidade',
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

describe('Rastreador de cliques — cadastro do link', () => {
  it('cadastra o link e gera o código curto', async () => {
    const resposta = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'Anúncio de setembro', destino: 'https://exemplo.com/promo' }),
    });
    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      codigo: string;
      urlCurta: string;
      cliques: number;
    };
    expect(corpo.codigo).toBeTruthy();
    expect(corpo.urlCurta.endsWith(`/l/${corpo.codigo}`)).toBe(true);
    expect(corpo.cliques).toBe(0);
  });

  it('recusa nome vazio', async () => {
    const resposta = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: '   ', destino: 'https://exemplo.com' }),
    });
    expect(resposta.status).toBe(400);
  });

  it('recusa destino sem HTTPS', async () => {
    const resposta = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'x', destino: 'http://exemplo.com' }),
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'url_precisa_https',
    );
  });

  it('recusa destino para localhost e para IP de rede privada', async () => {
    const local = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'x', destino: 'https://localhost/x' }),
    });
    expect(local.status).toBe(400);

    const privado = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'x', destino: 'https://192.168.0.5/x' }),
    });
    expect(privado.status).toBe(400);
    expect(((await privado.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'url_proibida',
    );
  });

  it('fluxo de outro tenant é 404 — o link não vaza entre contas', async () => {
    const outro = await montarCenario(`growth-outro-${randomUUID().slice(0, 8)}`);
    try {
      const { rows } = await outro.dono.execute<{ id: string }>(sql`
        insert into fluxo (tenant_id, nome) values (${outro.tenantId}, 'Bot de outra conta')
        returning id
      `);
      const resposta = await comCookie(`/v1/gestao/fluxos/${rows[0]!.id}/links-rastreados`);
      expect(resposta.status).toBe(404);
    } finally {
      await outro.encerrar();
    }
  });
});

describe('Rastreador de cliques — redirecionamento público e contagem', () => {
  let codigo: string;
  const destino = 'https://exemplo.com/pagina-do-clique';

  beforeAll(async () => {
    const resposta = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`, {
      method: 'POST',
      body: JSON.stringify({ nome: 'Redirecionamento', destino }),
    });
    codigo = ((await resposta.json()) as { codigo: string }).codigo;
  });

  it('redireciona com 302 para o destino e registra o clique — sem sessão nenhuma', async () => {
    const resposta = await fetch(`${api.url}/l/${codigo}?origem=campanha-x`, {
      redirect: 'manual',
      headers: { 'user-agent': 'TesteAgente/1.0' },
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toBe(destino);

    const { rows } = await cenario.dono.execute<{
      n: string;
      agente_usuario: string | null;
      origem: string | null;
    }>(sql`
      select count(*)::text as n, max(c.agente_usuario) as agente_usuario, max(c.origem) as origem
        from clique_link c
        join link_rastreado l on l.id = c.link_id
       where l.codigo = ${codigo}
    `);
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.agente_usuario).toBe('TesteAgente/1.0');
    expect(rows[0]!.origem).toBe('campanha-x');
  });

  it('código inexistente é 404, não erro interno', async () => {
    const resposta = await fetch(`${api.url}/l/nao-existe-mesmo`, { redirect: 'manual' });
    expect(resposta.status).toBe(404);
  });

  it('a leitura devolve a contagem de cliques', async () => {
    const resposta = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`);
    const corpo = (await resposta.json()) as { data: { codigo: string; cliques: number }[] };
    const linha = corpo.data.find((item) => item.codigo === codigo);
    expect(linha?.cliques).toBeGreaterThanOrEqual(1);
  });

  it('contagem por período: um clique de fora da janela pedida não entra', async () => {
    const { rows: linkRow } = await cenario.dono.execute<{ id: string; tenant_id: string }>(sql`
      select id, tenant_id from link_rastreado where codigo = ${codigo}
    `);
    // Um clique de 10 dias atrás, escrito direto — fora da janela "desde hoje".
    await cenario.dono.execute(sql`
      insert into clique_link (tenant_id, link_id, criado_em)
      values (${linkRow[0]!.tenant_id}, ${linkRow[0]!.id}::uuid, now() - interval '10 days')
    `);

    const hoje = new Date().toISOString().slice(0, 10);
    const geral = await comCookie(`/v1/gestao/fluxos/${fluxoId}/links-rastreados`);
    const doPeriodo = await comCookie(
      `/v1/gestao/fluxos/${fluxoId}/links-rastreados?desde=${hoje}T00:00:00Z`,
    );

    const cliquesGeral = (
      (await geral.json()) as { data: { codigo: string; cliques: number }[] }
    ).data.find((item) => item.codigo === codigo)?.cliques;
    const cliquesDoPeriodo = (
      (await doPeriodo.json()) as { data: { codigo: string; cliques: number }[] }
    ).data.find((item) => item.codigo === codigo)?.cliques;

    expect(cliquesGeral).toBeGreaterThanOrEqual((cliquesDoPeriodo ?? 0) + 1);
  });

  it('limite de taxa: muitos cliques do mesmo IP em pouco tempo devolvem 429', async () => {
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

describe('Mensagens ativas — casos que faltavam', () => {
  it('recusa contato sem telefone e sem contato_id', async () => {
    const resposta = await comCookie('/v1/mensagens-ativas', {
      method: 'POST',
      body: JSON.stringify({
        canal_id: cenario.canalId,
        template_id: templateId,
        contatos: [{ nome: 'sem telefone nem id' }],
      }),
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'destino_invalido',
    );
  });

  it('canal desativado recusa o disparo', async () => {
    await cenario.dono.execute(sql`update canal set ativo = false where id = ${cenario.canalId}::uuid`);
    esquecerCanal(cenario.canalId); // `resolverCanal` guarda em memória; sem isto o teste veria o cache antigo.
    try {
      const resposta = await comCookie('/v1/mensagens-ativas', {
        method: 'POST',
        body: JSON.stringify({
          canal_id: cenario.canalId,
          template_id: templateId,
          contatos: [{ telefone: '+5511988880001' }],
        }),
      });
      expect(resposta.status).toBe(409);
      expect(((await resposta.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
        'canal_inativo',
      );
    } finally {
      await cenario.dono.execute(sql`update canal set ativo = true where id = ${cenario.canalId}::uuid`);
      esquecerCanal(cenario.canalId);
    }
  });

  it('chave de API com o escopo certo entra; sem ele, 403', async () => {
    const comEscopo = await fetch(`${api.url}/v1/mensagens-ativas/limites`, {
      headers: { authorization: `Bearer ${cenario.token}` },
    });
    expect(comEscopo.status).toBe(200);

    const semEscopo = await fetch(`${api.url}/v1/mensagens-ativas/limites`, {
      headers: { authorization: `Bearer ${cenario.tokenSemEscopo}` },
    });
    expect(semEscopo.status).toBe(403);
    expect(((await semEscopo.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'sem_escopo',
    );
  });
});
