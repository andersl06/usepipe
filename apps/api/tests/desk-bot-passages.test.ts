import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { ItemOfConversation, PassagemDoBot } from '@pipe/contracts';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { dubleWhatsApp } = await import('@pipe/workers');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { splitBotPassages } = await import('../src/domain/desk/consultas.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage, sessaoDoBot } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * A contact's passes through the bot that never became a ticket show up in the Desk history: the
 * messages have no `conversa_id`, only the bot execution (`execucao_fluxo.contato_id`). A pass starts
 * where the customer's message finds the bot at the root block; the pass that asked for attendance
 * belongs to the ticket and is not listed twice. The reading respects `historico.ativo` and the
 * tenant and contact scoping.
 */
const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL('../../../packages/core/src/flow/fixtures/editor-sintetico.json', import.meta.url), 'utf8'),
);
const ANA = '5511911110071';
const BIA = '5511911110072';

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let cookieA: string;
let cookieB: string;

async function sessao(cenario: Cenario): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return `${NOME_DO_COOKIE}=${novo.token}`;
}

beforeAll(async () => {
  a = await montarCenario(`passagens-a-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`passagens-b-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  cookieA = await sessao(a);
  cookieB = await sessao(b);
  const r = await noTenant(a.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: a.tenantId, name: 'Passagens', channelId: a.channelId, json: FIXTURE, publicar: true }),
  );
  await adotarFilas(a, r.flowId);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

async function falar(texto: string, telefone: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(telefone, texto));
  const r = await fetch(`${api.url}/webhooks/whatsapp/${a.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(r.status).toBe(200);
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function contatoDe(telefone: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    select id from contato where tenant_id = ${a.tenantId}::uuid and telefone_e164 = ${`+${telefone}`}
  `);
  return rows[0]!.id;
}

async function ler<T>(cookie: string, caminho: string): Promise<{ status: number; corpo: T }> {
  const r = await fetch(`${api.url}${caminho}`, { headers: { cookie } });
  return { status: r.status, corpo: (await r.json()) as T };
}

type RespostaDoContato = { history: { id: string }[]; botPassages: PassagemDoBot[] };

async function mensagensDa(cookie: string, contatoId: string, p: PassagemDoBot) {
  const consulta = `inicio=${encodeURIComponent(p.iniciadaEm)}&fim=${encodeURIComponent(p.encerradaEm)}`;
  return ler<{ itens: ItemOfConversation[] }>(cookie, `/v1/desk/contacts/${contatoId}/bot-passages/${p.executionId}?${consulta}`);
}

async function definirHistorico(ativo: boolean): Promise<void> {
  await a.dono.execute(sql`
    update tenant set configuracao_atendimento = ${JSON.stringify({ historico: { ativo } })}::jsonb where id = ${a.tenantId}::uuid
  `);
}

describe('passagens do bot sem ticket no histórico do contato', () => {
  it('lista só a passagem que não virou ticket, com início, fim, último bloco e as mensagens', async () => {
    // Passagem 1: menu, Financeiro, volta ao bloco raiz. Passagem 2: pede atendimento (vira ticket).
    await falar('oi', ANA);
    await falar('Ana', ANA);
    await falar('1', ANA);
    const execucao = await sessaoDoBot(a, ANA);
    const { rows: primeira } = await a.dono.execute<{ id: string }>(sql`
      select id from mensagem where execucao_id = ${execucao.id}::uuid order by criada_em, id
    `);
    await esperar(1200);
    await falar('oi', ANA);
    await falar('Ana', ANA);
    await falar('2', ANA);
    const depois = await sessaoDoBot(a, ANA);
    expect(depois.conversa_id).not.toBeNull();

    const contatoId = await contatoDe(ANA);
    const { status, corpo } = await ler<RespostaDoContato>(cookieA, `/v1/desk/contacts/${contatoId}`);
    expect(status).toBe(200);
    expect(corpo.history.map((h) => h.id)).toEqual([depois.conversa_id]);
    expect(corpo.botPassages).toHaveLength(1);
    const passagem = corpo.botPassages[0]!;
    expect(passagem.executionId).toBe(execucao.id);
    expect(passagem.mensagens).toBe(primeira.length);
    expect(passagem.id).toBe(primeira[0]!.id);
    expect(new Date(passagem.iniciadaEm).getTime()).toBeLessThanOrEqual(new Date(passagem.encerradaEm).getTime());
    expect(passagem.ultimoBlocoNome).not.toBeNull();
    expect(passagem.ultimoBlocoCodigo).not.toBeNull();

    const lidas = await mensagensDa(cookieA, contatoId, passagem);
    expect(lidas.status).toBe(200);
    expect(lidas.corpo.itens.map((i) => i.id)).toEqual(primeira.map((m) => m.id));
    const direcoes = lidas.corpo.itens.map((i) => (i.genero === 'mensagem' ? i.direction : null));
    expect(direcoes).toContain('entrada');
    expect(direcoes).toContain('saida');

    // The conversation view carries the same list for the open ticket's contact.
    const aberta = await ler<{ aberta: { botPassages: PassagemDoBot[] } }>(cookieA, `/v1/desk/conversations/${depois.conversa_id}`);
    expect(aberta.corpo.aberta.botPassages.map((p) => p.id)).toEqual([passagem.id]);
  });

  it('duas passagens sem ticket viram duas entradas, a mais recente primeiro, sem mensagens em comum', async () => {
    await falar('oi', BIA);
    await falar('Bia', BIA);
    await falar('1', BIA);
    await esperar(1200);
    await falar('oi', BIA);
    await falar('Bia', BIA);
    await falar('1', BIA);

    const contatoId = await contatoDe(BIA);
    const { corpo } = await ler<RespostaDoContato>(cookieA, `/v1/desk/contacts/${contatoId}`);
    expect(corpo.history).toEqual([]);
    expect(corpo.botPassages).toHaveLength(2);
    const [recente, antiga] = corpo.botPassages as [PassagemDoBot, PassagemDoBot];
    expect(new Date(recente.iniciadaEm).getTime()).toBeGreaterThan(new Date(antiga.encerradaEm).getTime());

    const idsRecente = (await mensagensDa(cookieA, contatoId, recente)).corpo.itens.map((i) => i.id);
    const idsAntiga = (await mensagensDa(cookieA, contatoId, antiga)).corpo.itens.map((i) => i.id);
    expect(idsRecente).toHaveLength(recente.mensagens);
    expect(idsAntiga).toHaveLength(antiga.mensagens);
    expect(idsRecente.filter((id) => idsAntiga.includes(id))).toEqual([]);
    const { rows } = await a.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from mensagem m join execucao_fluxo e on e.id = m.execucao_id
       where e.contato_id = ${contatoId}::uuid and m.conversa_id is null
    `);
    expect(rows[0]!.n).toBe(idsRecente.length + idsAntiga.length);
  });

  it('respeita historico.ativo: desligado, a lista e a leitura das mensagens vêm vazias', async () => {
    const contatoId = await contatoDe(BIA);
    const { corpo: antes } = await ler<RespostaDoContato>(cookieA, `/v1/desk/contacts/${contatoId}`);
    expect(antes.botPassages.length).toBeGreaterThan(0);
    try {
      await definirHistorico(false);
      const { corpo } = await ler<RespostaDoContato>(cookieA, `/v1/desk/contacts/${contatoId}`);
      expect(corpo.botPassages).toEqual([]);
      expect((await mensagensDa(cookieA, contatoId, antes.botPassages[0]!)).corpo.itens).toEqual([]);
    } finally {
      await definirHistorico(true);
    }
  });

  it('não vaza entre tenants nem entre contatos', async () => {
    const contatoId = await contatoDe(BIA);
    const { botPassages } = (await ler<RespostaDoContato>(cookieA, `/v1/desk/contacts/${contatoId}`)).corpo;
    const passagem = botPassages[0]!;

    // Another tenant cannot even see the contact.
    expect((await ler<unknown>(cookieB, `/v1/desk/contacts/${contatoId}`)).status).toBe(404);
    expect((await mensagensDa(cookieB, contatoId, passagem)).status).toBe(404);

    // The execution must belong to the contact named in the route.
    const outroContato = await contatoDe(ANA);
    expect((await mensagensDa(cookieA, outroContato, passagem)).corpo.itens).toEqual([]);
    // A foreign contact in the tenant's own session does not show up as a pass of this one.
    const { rows: alheio } = await b.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164) values (${b.tenantId}, 'Alheio', '+5511900001234') returning id
    `);
    const doOutroTenant = await ler<RespostaDoContato>(cookieB, `/v1/desk/contacts/${alheio[0]!.id}`);
    expect(doOutroTenant.corpo.botPassages).toEqual([]);

    const invalida = await ler<unknown>(cookieA, `/v1/desk/contacts/${contatoId}/bot-passages/${passagem.executionId}`);
    expect(invalida.status).toBe(400);
  });
});

describe('splitBotPassages', () => {
  const linha = (id: string, direction: string, em: string, anterior: string | null = null, atual: string | null = null, execucao = 'e1') => ({
    id,
    executionId: execucao,
    direction,
    at: new Date(em),
    previousCode: anterior,
    currentCode: atual,
    currentName: atual ? `nome ${atual}` : null,
  });
  const raizes = new Set(['raiz']);

  it('abre uma passagem quando a primeira resposta do turno parte do bloco raiz, levando as mensagens do cliente', () => {
    const passagens = splitBotPassages(
      [
        linha('m1', 'entrada', '2026-01-01T10:00:00Z'),
        linha('m2', 'saida', '2026-01-01T10:00:01Z', 'raiz', 'menu'),
        linha('m3', 'entrada', '2026-01-01T10:00:10Z'),
        linha('m4', 'saida', '2026-01-01T10:00:11Z', 'menu', 'financeiro'),
        linha('m5', 'saida', '2026-01-01T10:00:11Z', 'financeiro', 'fim'),
        linha('m6', 'entrada', '2026-01-01T11:00:00Z'),
        linha('m7', 'entrada', '2026-01-01T11:00:02Z'),
        linha('m8', 'saida', '2026-01-01T11:00:03Z', 'raiz', 'menu'),
      ],
      raizes,
    );
    expect(passagens.map((p) => [p.id, p.mensagens, p.ultimoBlocoCodigo])).toEqual([
      ['m1', 5, 'fim'],
      ['m6', 3, 'menu'],
    ]);
  });

  it('uma nova execução abre outra passagem, mesmo sem passar pela raiz', () => {
    const passagens = splitBotPassages(
      [
        linha('m1', 'entrada', '2026-01-01T10:00:00Z', null, null, 'e1'),
        linha('m2', 'saida', '2026-01-01T10:00:01Z', 'menu', 'x', 'e1'),
        linha('m3', 'entrada', '2026-01-01T10:05:00Z', null, null, 'e2'),
        linha('m4', 'saida', '2026-01-01T10:05:01Z', 'menu', 'y', 'e2'),
      ],
      raizes,
    );
    expect(passagens.map((p) => [p.id, p.executionId, p.mensagens])).toEqual([
      ['m1', 'e1', 2],
      ['m3', 'e2', 2],
    ]);
  });

  it('sem mensagens, sem passagens', () => {
    expect(splitBotPassages([], raizes)).toEqual([]);
  });
});
