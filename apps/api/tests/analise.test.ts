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

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

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
let fluxoId: string;
let contatoId: string;
let conversaId: string;

async function criarCookieDeSessao(c: Cenario): Promise<string> {
  const novo = criarToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${c.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function cabecalho(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}` };
}

beforeAll(async () => {
  cenario = await montarCenario(`analise-${randomUUID().slice(0, 8)}`);
  outro = await montarCenario(`analise-outro-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  cookie = await criarCookieDeSessao(cenario);

  const fluxo = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id)
    values (${cenario.tenantId}, 'Bot de teste', 'fluxo', 'publicado', ${cenario.canalId})
    returning id
  `);
  fluxoId = fluxo.rows[0]!.id;

  const versao = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
    values (${cenario.tenantId}, ${fluxoId}, 1, 'publicada')
    returning id
  `);
  const versaoId = versao.rows[0]!.id;

  const blocos = await cenario.dono.execute<{ id: string; codigo: string }>(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo)
    values (${cenario.tenantId}, ${versaoId}, 'b1', 'Boas-vindas', 'mensagem'),
           (${cenario.tenantId}, ${versaoId}, 'b2', 'Transbordo', 'transferencia')
    returning id, codigo
  `);
  const b1 = blocos.rows.find((b) => b.codigo === 'b1')!.id;
  const b2 = blocos.rows.find((b) => b.codigo === 'b2')!.id;

  const contato = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente de teste', '+5511999990000')
    returning id
  `);
  contatoId = contato.rows[0]!.id;

  const conversa = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, estado, criada_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, 'em_atendimento', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  conversaId = conversa.rows[0]!.id;

  const execucao = await cenario.dono.execute<{ id: string }>(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado, iniciada_em)
    values (${cenario.tenantId}, ${versaoId}, ${conversaId}, ${contatoId}, 'concluida', ${`${DIA_1}T15:00:00Z`})
    returning id
  `);
  const execucaoId = execucao.rows[0]!.id;

  // A jornada: entrada -> b1 -> b2 -> saída.
  await cenario.dono.execute(sql`
    insert into execucao_passo (tenant_id, execucao_id, bloco_id, em)
    values (${cenario.tenantId}, ${execucaoId}, ${b1}, ${`${DIA_1}T15:00:01Z`}),
           (${cenario.tenantId}, ${execucaoId}, ${b2}, ${`${DIA_1}T15:00:02Z`})
  `);

  // O transbordo: o evento que o Dashboard soma como "contatos em transbordo".
  await cenario.dono.execute(sql`
    insert into evento_atendimento (tenant_id, conversa_id, tipo, dados, em)
    values (${cenario.tenantId}, ${conversaId}, 'enfileirada', ${JSON.stringify({ origem: 'fluxo' })}::jsonb, ${`${DIA_1}T15:00:02Z`})
  `);

  // Mensagens do DIA_1 (dentro do período): duas recebidas, uma enviada.
  await cenario.dono.execute(sql`
    insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values
      (gen_random_uuid(), ${cenario.tenantId}, ${conversaId}, 'entrada', 'contato', 'texto', 'Oi, preciso de ajuda', ${`${DIA_1}T15:00:00Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversaId}, 'saida', 'bot', 'texto', 'Olá! Como posso ajudar?', ${`${DIA_1}T15:00:01Z`}),
      (gen_random_uuid(), ${cenario.tenantId}, ${conversaId}, 'entrada', 'contato', 'imagem', 'foto.jpg', ${`${DIA_1}T15:05:00Z`})
  `);

  // Uma mensagem do DIA_0 (véspera, fora do período pedido nos testes de filtro).
  await cenario.dono.execute(sql`
    insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, criada_em)
    values (gen_random_uuid(), ${cenario.tenantId}, ${conversaId}, 'entrada', 'contato', 'texto', 'Mensagem de ontem', ${`${DIA_0}T15:00:00Z`})
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

describe('Dashboard — agregação de dados semeados', () => {
  it('conta contatos e mensagens do período pedido', async () => {
    const r = await fetch(
      url(`/v1/gestao/fluxos/${fluxoId}/analise/dashboard?periodo=custom&de=${DIA_1}&ate=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      dados: {
        contatos: { total: { atual: number }; comInteracao: { atual: number } };
        mensagens: { enviadas: { atual: number }; recebidas: { atual: number } };
        fluxo: { transbordo: { atual: number }; total: { atual: number } };
      };
    };
    expect(corpo.dados.contatos.total.atual).toBe(1);
    expect(corpo.dados.contatos.comInteracao.atual).toBe(1);
    expect(corpo.dados.mensagens.enviadas.atual).toBe(1);
    expect(corpo.dados.mensagens.recebidas.atual).toBe(2);
    expect(corpo.dados.fluxo.transbordo.atual).toBe(1);
  });

  it('filtro por período: um dia sem mensagem semeada devolve zero, não a mensagem de outro dia', async () => {
    // Precisa caber no teto de 90 dias do período customizado do Dashboard
    // (`intervaloDoPeriodo(..., { limiteDias: 90 })`) — fora dele a rota cai
    // no padrão "hoje", que TEM mensagem semeada e mascararia o teste.
    const semDado = iso(new Date(HOJE.getTime() - 3 * 24 * 60 * 60 * 1000));
    const r = await fetch(
      url(
        `/v1/gestao/fluxos/${fluxoId}/analise/dashboard?periodo=custom&de=${semDado}&ate=${semDado}`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { dados: { contatos: { total: { atual: number } } } };
    expect(corpo.dados.contatos.total.atual).toBe(0);
  });

  it('isolamento entre tenants: sessão de um tenant não lê o fluxo de outro', async () => {
    const cookieDoOutro = await criarCookieDeSessao(outro);
    const r = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/dashboard`), {
      headers: cabecalho(cookieDoOutro),
    });
    expect(r.status).toBe(404);
  });

  it('permissão: sem cookie de sessão a rota nem chega a ler o banco', async () => {
    const r = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/dashboard`));
    expect(r.status).toBe(401);
  });

  it('id fora do formato uuid é 404, não 500 do Postgres', async () => {
    const r = await fetch(url('/v1/gestao/fluxos/nao-e-um-uuid/analise/dashboard'), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(404);
  });
});

describe('Visão Geral', () => {
  it('soma ativos, engajados e mensagens do período', async () => {
    const r = await fetch(
      url(`/v1/gestao/fluxos/${fluxoId}/analise/visao-geral?de=${DIA_1}&ate=${DIA_1}`),
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

describe('Jornada dos contatos', () => {
  it('desenha a aresta entrada -> b1 -> b2 -> Saída, no período', async () => {
    const r = await fetch(
      url(`/v1/gestao/fluxos/${fluxoId}/analise/jornada?de=${DIA_1}&ate=${DIA_1}`),
      { headers: cabecalho(cookie) },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      arestas: { de: string; para: string; passo: number; quantidade: number; tipo: string }[];
    };
    expect(corpo.arestas.length).toBeGreaterThan(0);
    expect(corpo.arestas.some((a) => a.de.startsWith('Boas-vindas ['))).toBe(true);
    expect(corpo.arestas.some((a) => a.para.startsWith('Saída ['))).toBe(true);
  });

  it('fora do período, sem execução, devolve o diagrama vazio', async () => {
    const semDado = '2026-02-01';
    const r = await fetch(
      url(`/v1/gestao/fluxos/${fluxoId}/analise/jornada?de=${semDado}&ate=${semDado}`),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { arestas: unknown[] };
    expect(corpo.arestas).toHaveLength(0);
  });
});

describe('Log de mensagens', () => {
  it('lista as mensagens do fluxo, mais recente primeiro', async () => {
    const r = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/log?limit=10`), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      data: { id: string; criadaEm: string; direcao: string; tipo: string }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(corpo.data).toHaveLength(4);
    expect(corpo.page_info.has_next_page).toBe(false);
    const ordenado = [...corpo.data].sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1));
    expect(corpo.data.map((m) => m.id)).toEqual(ordenado.map((m) => m.id));
  });

  it('filtra por período, direção e tipo', async () => {
    const r = await fetch(
      url(
        `/v1/gestao/fluxos/${fluxoId}/analise/log?de=${DIA_1}&ate=${DIA_1}&direcao=entrada&tipo=imagem`,
      ),
      { headers: cabecalho(cookie) },
    );
    const corpo = (await r.json()) as { data: { conteudo: string | null }[] };
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0]?.conteudo).toBe('foto.jpg');
  });

  it('direção fora da lista é ignorada, não derruba a consulta', async () => {
    const r = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/log?direcao=nao-existe`), {
      headers: cabecalho(cookie),
    });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: unknown[] };
    expect(corpo.data).toHaveLength(4);
  });

  it('pagina por cursor sem repetir nem pular mensagem', async () => {
    const primeira = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/log?limit=2`), {
      headers: cabecalho(cookie),
    });
    const p1 = (await primeira.json()) as {
      data: { id: string }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(p1.data).toHaveLength(2);
    expect(p1.page_info.has_next_page).toBe(true);
    expect(p1.page_info.end_cursor).not.toBeNull();

    const segunda = await fetch(
      url(`/v1/gestao/fluxos/${fluxoId}/analise/log?limit=2&cursor=${p1.page_info.end_cursor}`),
      { headers: cabecalho(cookie) },
    );
    const p2 = (await segunda.json()) as { data: { id: string }[]; page_info: { has_next_page: boolean } };
    expect(p2.data).toHaveLength(2);
    expect(p2.page_info.has_next_page).toBe(false);

    const ids1 = p1.data.map((m) => m.id);
    const ids2 = p2.data.map((m) => m.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(4);
  });

  it('isolamento entre tenants: outro tenant não vê estas mensagens', async () => {
    const cookieDoOutro = await criarCookieDeSessao(outro);
    const r = await fetch(url(`/v1/gestao/fluxos/${fluxoId}/analise/log`), {
      headers: cabecalho(cookieDoOutro),
    });
    expect(r.status).toBe(404);
  });
});
