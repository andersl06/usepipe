import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { fireInputExpiration, dueInputExpirations } = await import('../src/domain/input-expiration-job.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * P8 (plan 02-49), Blip `input.expiration` end to end: the customer message that leaves the contact
 * in a block with an inactivity time arms `execucao_fluxo.entrada_expira_em/_bloco`; the expiration
 * job runs the engine with the expiration input, which follows the block's default output (the
 * "input exists" output does not match); an answer first, a person owning the conversation or a
 * second firing leave nothing to run. The Builder test run simulates it with `expireInput`.
 * Invented data only.
 */

let cenario: Cenario;
let api: ApiNoAr;

function block(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    $title: id,
    $position: { top: '40px', left: '40px' },
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    ...extra,
  };
}
const say = (content: string) => ({ action: { type: 'SendMessage', settings: { type: 'text/plain', content } } });

/** `pergunta` waits one minute (`"0:1"`); answering goes to `obrigado`, expiring to `inatividade` (8 h). */
function desenho(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  return {
    flow: {
      inicio: block('inicio', {
        root: true,
        $contentActions: [{ input: { bypass: false } }],
        $defaultOutput: { stateId: 'pergunta' },
      }),
      pergunta: block('pergunta', {
        $contentActions: [say('Qual é o número do pedido?'), { input: { bypass: false, variable: 'pedido', expiration: '0:1' } }],
        $conditionOutputs: [{ stateId: 'obrigado', conditions: [{ source: 'input', comparison: 'exists', values: [] }] }],
        $defaultOutput: { stateId: 'inatividade' },
      }),
      obrigado: block('obrigado', {
        $contentActions: [say('Obrigado, pedido {{pedido}}.'), { input: { bypass: false } }],
        $defaultOutput: { stateId: 'obrigado' },
      }),
      inatividade: block('inatividade', {
        $contentActions: [say('Você ainda está aí?'), { input: { bypass: false, expiration: '8:0' } }],
        $defaultOutput: { stateId: 'obrigado' },
      }),
    },
    globals: {},
  };
}

beforeAll(async () => {
  cenario = await montarCenario(`expira-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  await cenario.dono.execute(
    sql`update status_atendente set estado = 'offline' where usuario_id = ${cenario.agentId}::uuid`,
  );
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: cenario.tenantId, name: 'Expiração', channelId: cenario.channelId, json: desenho(), publicar: true }),
  );
  expect(r.errorOfValidation).toBeNull();
  await adotarFilas(cenario, r.flowId);
  expect(r.report.naoSuportado['entrada:expiracao']).toBeUndefined();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto, {}));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Execution = {
  id: string;
  conversa_id: string;
  estado: string;
  entrada_expira_em: Date | null;
  entrada_expira_bloco: string | null;
};

async function executionOf(telefone: string): Promise<Execution> {
  const { rows } = await cenario.dono.execute<Execution>(sql`
    select e.id, e.conversa_id, e.estado, e.entrada_expira_em, e.entrada_expira_bloco
      from execucao_fluxo e join contato ct on ct.id = e.contato_id
     where e.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by e.iniciada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversationId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}

/** Pretend the minute passed: the armed expiration becomes due. */
async function makeDue(executionId: string): Promise<void> {
  await cenario.dono.execute(sql`
    update execucao_fluxo set entrada_expira_em = now() - interval '1 second' where id = ${executionId}::uuid
  `);
}

describe('input expiration in production (P8)', () => {
  it('arms on the waiting block, fires the default output once, and re-arms the next block', async () => {
    const tel = '5511922220001';
    await falar(tel, 'oi');
    const armada = await executionOf(tel);
    expect(armada.entrada_expira_bloco).toBe('pergunta');
    const seconds = (new Date(armada.entrada_expira_em!).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(50);
    expect(seconds).toBeLessThanOrEqual(61);
    expect(await doBot(armada.conversa_id)).toEqual(['Qual é o número do pedido?']);

    // Not due yet: the job finds nothing to claim.
    expect(await fireInputExpiration(cenario.tenantId, armada.id)).toBeNull();

    await makeDue(armada.id);
    expect((await dueInputExpirations()).some((d) => d.executionId === armada.id)).toBe(true);
    const [first, second] = await Promise.all([
      fireInputExpiration(cenario.tenantId, armada.id),
      fireInputExpiration(cenario.tenantId, armada.id),
    ]);
    expect([first, second].filter((r) => r?.tratou).length).toBe(1);
    expect(await doBot(armada.conversa_id)).toEqual(['Qual é o número do pedido?', 'Você ainda está aí?']);

    const depois = await executionOf(tel);
    expect(depois.entrada_expira_bloco).toBe('inatividade');
    expect(new Date(depois.entrada_expira_em!).getTime() - Date.now()).toBeGreaterThan(7 * 3600 * 1000);

    // The step records the expiration input, without a `mensagem` row of its own.
    const { rows: passos } = await cenario.dono.execute<{ entrada: Record<string, unknown> | null }>(sql`
      select entrada from execucao_passo where execucao_id = ${armada.id}::uuid and entrada ? 'id_provedor' order by em
    `);
    // The id carries the armed time (the claim reads the pre-update row, not the cleared one).
    expect(passos.some((p) => /^expiracao-entrada:[0-9a-f-]+:[1-9][0-9]+$/.test(String(p.entrada?.['id_provedor'])))).toBe(true);
    const { rows: entradas } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from mensagem where conversa_id = ${armada.conversa_id}::uuid and direcao = 'entrada'
    `);
    expect(Number(entradas[0]!.n)).toBe(1);

    // The customer answers the inactivity block: `obrigado` has no expiration, so it is cleared.
    await falar(tel, '42');
    const respondida = await executionOf(tel);
    expect(respondida.entrada_expira_em).toBeNull();
    expect(respondida.entrada_expira_bloco).toBeNull();
  });

  it('an answer before the expiration cancels it: a late job runs nothing', async () => {
    const tel = '5511922220002';
    await falar(tel, 'oi');
    const armada = await executionOf(tel);
    expect(armada.entrada_expira_bloco).toBe('pergunta');
    await falar(tel, '777');
    const respondida = await executionOf(tel);
    expect(respondida.entrada_expira_em).toBeNull();
    expect(await doBot(armada.conversa_id)).toEqual(['Qual é o número do pedido?', 'Obrigado, pedido 777.']);

    // A job that was already queued wakes up late: nothing is claimed, nothing is sent.
    expect(await fireInputExpiration(cenario.tenantId, armada.id)).toBeNull();
    expect(await doBot(armada.conversa_id)).toHaveLength(2);
  });

  it('an expiration for a block the contact already left is ignored by the engine', async () => {
    const tel = '5511922220003';
    await falar(tel, 'oi');
    const armada = await executionOf(tel);
    // A stale armed block (e.g. a row restored by a rolled-back transaction) that is not the saved one.
    await cenario.dono.execute(sql`
      update execucao_fluxo
         set entrada_expira_bloco = 'inatividade', entrada_expira_em = now() - interval '1 second'
       where id = ${armada.id}::uuid
    `);
    const r = await fireInputExpiration(cenario.tenantId, armada.id);
    expect(r?.respostas ?? 0).toBe(0);
    expect(await doBot(armada.conversa_id)).toEqual(['Qual é o número do pedido?']);
  });

  it('does nothing once a person owns the conversation', async () => {
    const tel = '5511922220004';
    await falar(tel, 'oi');
    const armada = await executionOf(tel);
    await cenario.dono.execute(sql`
      update conversa set atendente_id = ${cenario.agentId}::uuid where id = ${armada.conversa_id}::uuid
    `);
    await makeDue(armada.id);
    const r = await fireInputExpiration(cenario.tenantId, armada.id);
    expect(r?.tratou ?? false).toBe(false);
    expect(await doBot(armada.conversa_id)).toEqual(['Qual é o número do pedido?']);
    // Claimed and cleared: the sweep will not pick it up again.
    const depois = await executionOf(tel);
    expect(depois.entrada_expira_em).toBeNull();
    expect((await dueInputExpirations()).some((d) => d.executionId === armada.id)).toBe(false);
  });

  it('keeps tenants apart: another tenant cannot fire this execution', async () => {
    const tel = '5511922220005';
    await falar(tel, 'oi');
    const armada = await executionOf(tel);
    await makeDue(armada.id);
    const outro = await montarCenario(`expira-b-${randomUUID().slice(0, 8)}`);
    try {
      expect(await fireInputExpiration(outro.tenantId, armada.id)).toBeNull();
    } finally {
      await outro.encerrar();
    }
    expect((await executionOf(tel)).entrada_expira_bloco).toBe('pergunta');
  });
});

describe('input expiration in the Builder test run (P8)', () => {
  it('reports the pending expiration and fires it on "expireInput" without touching production tables', async () => {
    const marca = randomUUID().slice(0, 8);
    const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${cenario.tenantId}, ${`Editor ${marca}`}, ${`editor-${marca}@e2e.pipe.app`}) returning id
    `);
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo) values ('automacao.fluxo.editar', 'editar', 'teste') on conflict (codigo) do nothing
    `);
    const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
    `);
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${cenario.tenantId}, ${papeis[0]!.id}, 'automacao.fluxo.editar')
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${cenario.tenantId}, ${users[0]!.id}, ${papeis[0]!.id})
    `);
    const token = createToken();
    await cenario.dono.execute(sql`
      insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
      values (${cenario.tenantId}, ${users[0]!.id}, ${token.hash}, ${token.expiraEm}, 'google')
    `);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${token.token}`, 'content-type': 'application/json' };
    const pedir = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${api.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: r.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
    };

    const criado = await pedir('POST', '/v1/management/flows', {
      recados: { tamanho: 't', comecoInvalido: 'c', nomeEmUso: 'u', withoutPermission: 'p' },
      name: `Teste expira ${marca}`,
      type: 'fluxo',
    });
    expect(criado.status).toBe(200);
    const id = criado.body['id'] as string;
    expect((await pedir('PUT', `/v1/management/flows/${id}/builder`, desenho())).status).toBe(200);

    const count = async () => {
      const { rows } = await cenario.dono.execute<{ n: string }>(sql`
        select count(*)::text as n from execucao_fluxo where tenant_id = ${cenario.tenantId}::uuid
      `);
      return Number(rows[0]!.n);
    };
    const antes = await count();

    // Nothing waits yet at the root without expiration: 409.
    const cedo = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: '', expireInput: true });
    expect(cedo.status).toBe(409);

    const primeira = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'oi' });
    expect(primeira.status).toBe(200);
    expect(primeira.body['debug']['inputExpiration']).toEqual({ stateId: 'pergunta', seconds: 60 });

    const expirou = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'ignorado', expireInput: true });
    expect(expirou.status).toBe(200);
    expect(expirou.body['messages'].map((m: { texto: string }) => m.texto)).toEqual(['Você ainda está aí?']);
    expect(expirou.body['debug']['currentStateId']).toBe('inatividade');
    expect(expirou.body['debug']['inputExpiration']).toEqual({ stateId: 'inatividade', seconds: 28_800 });
    expect(expirou.body['debug']['variables']['pedido']).toBeUndefined();

    const respondeu = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: '9' });
    expect(respondeu.body['debug']['inputExpiration']).toBeUndefined();
    expect(await count()).toBe(antes);
  });
});
