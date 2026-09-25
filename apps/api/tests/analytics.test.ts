import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * A ANÁLISE do contato — Dashboard, Visão Geral, Jornada e o Log de mensagens
 * (`controladores/gestao-analise.ts`). Semeia um fluxo publicado, uma conversa
 * atendida por ele e mensagens em dois dias, tudo por SQL direto (não pelo
 * motor de verdade: os testes de ponta a ponta do motor já vivem em
 * `fluxo.test.ts`; aqui o que se prova é a LEITURA agregada).
 *
 * DIA_1 (dentro do período pedido) e DIA_0 (um dia antes, fora dele) —
 * provam o filtro por período sem depender de "agora". Precisam ficar perto
 * de hoje de verdade: `mensagem`/`evento_atendimento` são particionadas por
 * mês (`packages/db/src/particoes.ts`), e `migrar()` só cria a partição do
 * mês corrente e dos três seguintes — uma data fixa no passado cairia fora
 * de qualquer partição e o insert falharia com "no partition found".
 */

/*
 * No FUSO DO CLIENTE, não em UTC: a API recusa período que termina depois de
 * "hoje" no fuso do tenant (`intervaloDoPeriodo`, caso `custom`) e cai em
 * "hoje". Das 21h de Brasília em diante o dia UTC já virou, e o teste pedia um
 * período no futuro — passava de manhã e falhava à noite.
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
  const novo = createTokencriarTokencreateToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${c.agentId}, ${novo.hash}, ${novo.expiresAt}, 'google')
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
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id)
    values (${cenario.tenantId}, 'Bot de teste', 'fluxo', 'publicado', ${cenario.channelId})
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
    returning id, codigo
  `);
  const b1 = blocos.rows.find((b) => b.codigo === 'b1')!.id;
  const b2 = blocos.rows.find((b) => b.codigo === 'b2')!.id;

  const contact = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente de teste', '+5511999990000')
    returning id
  `);
  contactId = contact.rows[0]!.id;

  const conversation = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado, criada_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contactId}, 'em_atendimento', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  conversationId = conversation.rows[0]!.id;

  const execution = await cenario.dono.execute<{ id: string }>(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado, iniciada_em)
    values (${cenario.tenantId}, ${versaoId}, ${conversationId}, ${contactId}, 'concluida', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  const executionId = execution.rows[0]!.id;

  // A jornada: entrada -> b1 -> b2 -> saída.
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

  // Mensagens do DIA_1 (dentro do período): duas recebidas, uma enviada.
  await cenario.dono.execute(sql`
    insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'entrada', 'contato', 'texto', 'Oi, preciso de ajuda', ${`${DIA_1}T15:00:00Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'saida', 'bot', 'texto', 'Olá! Como posso ajudar?', ${`${DIA_1}T15:00:01Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversationId}, 'entrada', 'contato', 'imagem', 'foto.jpg', ${`${DIA_1}T15:05:00Z`})
  `);

  // Uma mensagem do DIA_0 (véspera, fora do período pedido nos testes de filtro).
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
      url(`/v1/management/flows/${flowId}/analytics/dashboard?periodo=custom&de=${DIA_1}&ate=${DIA_1}`),
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
    // Precisa caber no teto de 90 dias do período customizado do Dashboard
    // (`intervaloDoPeriodo(..., { limiteDias: 90 })`) — fora dele a rota cai
    // no padrão "hoje", que TEM mensagem semeada e mascararia o teste.
    const semDado = iso(new Date(HOJE.getTime() - 3 * 24 * 60 * 60 * 1000));
    const r = await fetch(
      url(
        `/v1/management/flows/${flowId}/analytics/dashboard?periodo=custom&de=${semDado}&ate=${semDado}`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { data: { contatos: { total: { atual: number } } } };
    expect(corpo.dados.contatos.total.atual).toBe(0);
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
      url(`/v1/management/flows/${flowId}/analytics/view-overview?de=${DIA_1}&ate=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      data: { contagens: { ativos: number; engajados: number; recebidas: number; enviadas: number } };
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
      url(`/v1/management/flows/${flowId}/analytics/journey?de=${DIA_1}&ate=${DIA_1}`),
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
      url(`/v1/management/flows/${flowId}/analytics/journey?de=${semDado}&ate=${semDado}`),
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
        `/v1/management/flows/${flowId}/analytics/log?de=${DIA_1}&ate=${DIA_1}&direcao=entrada&tipo=imagem`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { data: { content: string | null }[] };
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]?.conteudo).toBe('foto.jpg');
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
