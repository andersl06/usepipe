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

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The contact's ANALYTICS — Dashboard, Overview, Journey and the message Log (`controladores/gestao-analise.ts`). Seeds a published flow, a conversation handled by it, and messages on two days, all through direct SQL (not through the real engine: the engine's end-to-end tests already live in `fluxo.test.ts`; what's proven here is the aggregated READ).
 *
 * DIA_1 (inside the requested period) and DIA_0 (one day before, outside it) — prove the period filter without depending on "now." They need to stay close to the real today: `mensagem`/`evento_atendimento` are partitioned by month (`packages/db/src/particoes.ts`), and `migrar()` only creates the current month's partition and the next three — a fixed past date would fall outside any partition and the insert would fail with "no partition found."
 */

/*
 * In the CLIENT'S TIMEZONE, not UTC: the API rejects a period that ends after "today" in the tenant's timezone (`intervaloDoPeriodo`, `custom` case) and falls on "today." From 9 PM Brasília onward the UTC day has already turned, and the test asked for a period in the future — it passed in the morning and failed at night.
 */
const FUSO = 'America/Sao_Paulo';
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO });
const HOJE = new Date();
const DIA_1 = iso(HOJE);
const DIA_0 = iso(new Date(HOJE.getTime() - 24 * 60 * 60 * 1000));

let cenario: Cenario;
let outro: Cenario;
let api: ApiNoAr;
let cookie: string;
let flowId: string;
let contactId: string;
let conversationId: string;

async function createCookieOfSession(c: Cenario): Promise<string> {
  const novo = createToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${c.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function cabecalho(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}` };
}

beforeAll(async () => {
  cenario = await montarCenario(`analise-${randomUUID().slice(0, 8)}`);
  outro = await montarCenario(`analise-outro-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  cookie = await createCookieOfSession(cenario);

  const flow = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
    values (${cenario.tenantId}, 'Bot de teste', 'fluxo', 'publicado', ${cenario.channelId}, 'bot-de-teste')
    returning id
  `);
  flowId = flow.rows[0]!.id;

  const versao = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
    values (${cenario.tenantId}, ${flowId}, 1, 'publicada')
    returning id
  `);
  const versaoId = versao.rows[0]!.id;

  const blocos = await cenario.dono.execute<{ id: string; code: string }>(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo)
    values (${cenario.tenantId}, ${versaoId}, 'b1', 'Boas-vindas', 'mensagem'),
           (${cenario.tenantId}, ${versaoId}, 'b2', 'Transbordo', 'transferencia')
    returning id, codigo as "code"
  `);
  const b1 = blocos.rows.find((b) => b.code === 'b1')!.id;
  const b2 = blocos.rows.find((b) => b.code === 'b2')!.id;

  const contact = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente de teste', '+5511999990000')
    returning id
  `);
  contactId = contact.rows[0]!.id;

  const conversation = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado, criada_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, 'Open', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  conversationId = conversation.rows[0]!.id;

  const execution = await cenario.dono.execute<{ id: string }>(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado, iniciada_em)
    values (${cenario.tenantId}, ${versaoId}, ${conversationId}, ${contactId}, 'concluida', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  const executionId = execution.rows[0]!.id;

  // // The journey: inbound -> b1 -> b2 -> outbound.
  await cenario.dono.execute(sql`
    insert into execucao_passo (tenant_id, execucao_id, bloco_id, em)
    values (${cenario.tenantId}, ${executionId}, ${b1}, ${`${DIA_1}T15:00:01Z`}),
           (${cenario.tenantId}, ${executionId}, ${b2}, ${`${DIA_1}T15:00:02Z`})
  `);

  // O transbordo: o evento que o Dashboard soma como "contatos em transbordo".
  await cenario.dono.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, dados, em)
    values (${cenario.tenantId}, ${conversationId}, 'enfileirada', ${JSON.stringify({ origem: 'fluxo' })}::jsonb, ${`${DIA_1}T15:00:02Z`})
  `);

  // // DIA_1 messages (inside the period): two received, one sent.
  await cenario.dono.execute(sql`
    insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'entrada', 'contato', 'texto', 'Oi, preciso de ajuda', ${`${DIA_1}T15:00:00Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'saida', 'bot', 'texto', 'Olá! Como posso ajudar?', ${`${DIA_1}T15:00:01Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'entrada', 'contato', 'imagem', 'foto.jpg', ${`${DIA_1}T15:05:00Z`})
  `);

  // // A DIA_0 message (the day before, outside the period requested in the filter tests).
  await cenario.dono.execute(sql`
    insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'entrada', 'contato', 'texto', 'Mensagem de ontem', ${`${DIA_0}T15:00:00Z`})
  `);
});

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
  await outro?.encerrar();
});

function url(caminho: string): string {
  return `${api.url}${caminho}`;
}

describe('Aggregate seeded data for the analytics dashboard', () => {
  it('Count contacts and messages in the requested period', async () => {
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/dashboard?periodo=custom&from=${DIA_1}&to=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      data: {
        contacts: { total: { atual: number }; withInteraction: { atual: number } };
        messages: { enviadas: { atual: number }; recebidas: { atual: number } };
        flow: { transbordo: { atual: number }; total: { atual: number } };
      };
    };
    expect(corpo.data.contacts.total.atual).toBe(1);
    expect(corpo.data.contacts.withInteraction.atual).toBe(1);
    expect(corpo.data.messages.enviadas.atual).toBe(1);
    expect(corpo.data.messages.recebidas.atual).toBe(2);
    expect(corpo.data.flow.transbordo.atual).toBe(1);
  });

  it('Return zero for a date with no seeded messages', async () => {
    // // Needs to fit inside the Dashboard's custom-period 90-day ceiling
    // (`intervaloDoPeriodo(..., { limiteDias: 90 })`) — fora dele a rota cai
    // // on the "today" pattern, which HAS a seeded message and would mask the test.
    const semDado = iso(new Date(HOJE.getTime() - 3 * 24 * 60 * 60 * 1000));
    const r = await fetch(
      url(
        `/v1/management/flows/${flowId}/analytics/dashboard?periodo=custom&from=${semDado}&to=${semDado}`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { data: { contacts: { total: { atual: number } } } };
    expect(corpo.data.contacts.total.atual).toBe(0);
  });

  it('Prevent one tenant\'s session from reading another\'s flow analytics', async () => {
    const cookieDoOutro = await createCookieOfSession(outro);
    const r = await fetch(url(`/v1/management/flows/${flowId}/analytics/dashboard`), {
      headers: cabecalho(cookieDoOutro),
    });
    expect(r.status).toBe(404);
  });

  it('Require a session before querying dashboard data', async () => {
    const r = await fetch(url(`/v1/management/flows/${flowId}/analytics/dashboard`));
    expect(r.status).toBe(401);
  });

  it('Return 404 for malformed UUIDs instead of a PostgreSQL error', async () => {
    const r = await fetch(url('/v1/management/flows/nao-e-um-uuid/analytics/dashboard'), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(404);
  });
});

describe('Visão Geral', () => {
  it('Count active contacts, engaged contacts, and messages in the period', async () => {
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/view-overview?from=${DIA_1}&to=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      dados: { contagens: { ativos: number; engajados: number; recebidas: number; enviadas: number } };
    };
    expect(corpo.dados.contagens.ativos).toBe(1);
    expect(corpo.dados.contagens.engajados).toBe(1);
    expect(corpo.dados.contagens.recebidas).toBe(2);
    expect(corpo.dados.contagens.enviadas).toBe(1);
  });
});

describe('Trace contact journeys through analytics', () => {
  it('Draw the entry-to-exit path through blocks b1 and b2 for the period', async () => {
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/journey?from=${DIA_1}&to=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      arestas: { de: string; para: string; passo: number; quantity: number; tipo: string }[];
    };
    expect(corpo.arestas.length).toBeGreaterThan(0);
    expect(corpo.arestas.some((a) => a.de.startsWith('Boas-vindas ['))).toBe(true);
    expect(corpo.arestas.some((a) => a.para.startsWith('Saída ['))).toBe(true);
  });

  it('Return an empty journey diagram when no execution falls within the period', async () => {
    const semDado = '2026-02-01';
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/journey?from=${semDado}&to=${semDado}`),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { arestas: unknown[] };
    expect(corpo.arestas).toHaveLength(0);
  });
});

describe('List message logs newest first', () => {
  it('List flow messages newest first', async () => {
    const r = await fetch(url(`/v1/management/flows/${flowId}/analytics/log?limit=10`), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      data: { id: string; criadaEm: string; direction: string; tipo: string }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(corpo.data).toHaveLength(4);
    expect(corpo.page_info.has_next_page).toBe(false);
    const ordenado = [...corpo.data].sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1));
    expect(corpo.data.map((m) => m.id)).toEqual(ordenado.map((m) => m.id));
  });

  it('Filter message logs by period, direction, and type', async () => {
    const r = await fetch(
      url(
        `/v1/management/flows/${flowId}/analytics/log?from=${DIA_1}&to=${DIA_1}&direction=entrada&type=imagem`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { data: { content: string | null }[] };
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]?.content).toBe('foto.jpg');
  });

  it('Ignore unknown directions without failing the query', async () => {
    const r = await fetch(url(`/v1/management/flows/${flowId}/analytics/log?direcao=nao-existe`), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: unknown[] };
    expect(corpo.data).toHaveLength(4);
  });

  it('Page message logs by cursor without duplicates or gaps', async () => {
    const first = await fetch(url(`/v1/management/flows/${flowId}/analytics/log?limit=2`), {
      headers: cabecalho(cookie),
    });
    const p1 = (await first.json()) as {
      data: { id: string }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(p1.data).toHaveLength(2);
    expect(p1.page_info.has_next_page).toBe(true);
    expect(p1.page_info.end_cursor).not.toBeNull();

    const segunda = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/log?limit=2&cursor=${p1.page_info.end_cursor}`),
      { headers: cabecalho(cookie) },
    );
    const p2 = (await segunda.json()) as { data: { id: string }[]; page_info: { has_next_page: boolean } };
    expect(p2.data).toHaveLength(2);
    expect(p2.page_info.has_next_page).toBe(false);

    const ids1 = p1.data.map((m) => m.id);
    const ids2 = p2.data.map((m) => m.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(4);
  });

  it('Hide one tenant\'s flow messages from another tenant', async () => {
    const cookieDoOutro = await createCookieOfSession(outro);
    const r = await fetch(url(`/v1/management/flows/${flowId}/analytics/log`), {
      headers: cabecalho(cookieDoOutro),
    });
    expect(r.status).toBe(404);
  });
});

describe('Analytics period limits and router aggregation', () => {
  const dias = (n: number) => iso(new Date(HOJE.getTime() - n * 24 * 60 * 60 * 1000));

  it.each(['view-overview', 'journey'])('Reject a %s range longer than 90 days', async (rota) => {
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/${rota}?from=${dias(90)}&to=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain('periodo_longo_demais');
  });

  it.each(['view-overview', 'journey'])('Accept a %s range of exactly 90 days', async (rota) => {
    const r = await fetch(
      url(`/v1/management/flows/${flowId}/analytics/${rota}?from=${dias(89)}&to=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
  });

  it('Count the service flows and label the channel of a router from its linked channels', async () => {
    const suffix = randomUUID().slice(0, 8);
    const router = await cenario.dono.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo, estado, short_name)
      values (${cenario.tenantId}, ${`router ${suffix}`}, 'roteador', 'publicado', ${`router-${suffix}`})
      returning id
    `);
    const routerId = router.rows[0]!.id;
    const channel = await cenario.dono.execute<{ id: string }>(sql`
      insert into canal (tenant_id, tipo, nome, config, numero_id)
      values (${cenario.tenantId}, 'messenger', ${`Messenger ${suffix}`},
        ${JSON.stringify({ tokenAcesso: `page-${suffix}` })}::jsonb, ${`page-${suffix}`})
      returning id
    `);
    await cenario.dono.execute(sql`
      insert into roteador_canal (tenant_id, roteador_id, canal_id)
      values (${cenario.tenantId}, ${routerId}, ${channel.rows[0]!.id})
    `);
    const query = `periodo=custom&from=${DIA_1}&to=${DIA_1}`;
    const before = await fetch(url(`/v1/management/flows/${routerId}/analytics/dashboard?${query}`), {
      headers: cabecalho(cookie),
    });
    type Body = { data: { channel: string | null; messages: { recebidas: { atual: number } } } };
    expect(((await before.json()) as Body).data.messages.recebidas.atual).toBe(0);

    await cenario.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal)
      values (${cenario.tenantId}, ${routerId}, ${flowId}, ${`servico-${suffix}`}, true)
    `);
    const after = await fetch(url(`/v1/management/flows/${routerId}/analytics/dashboard?${query}`), {
      headers: cabecalho(cookie),
    });
    const corpo = (await after.json()) as Body;
    expect(corpo.data.messages.recebidas.atual).toBe(2);
    expect(corpo.data.channel).toBe('messenger');
  });
});
