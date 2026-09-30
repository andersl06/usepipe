import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const { dubleWhatsApp } = await import('@pipe/workers');
const { subflowRuntimeId } = await import('@pipe/core');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

/**
 * P12: Blip subflows through the api, in both paths that run the engine. The export fixture is the
 * core one (`export-with-subflows.json`, invented content in the Blip editor format): a `subflow:`
 * block calls `coletadados`, which asks the name, sets `dadosOk` and returns through its `end`
 * block; the caller's exits then pick `confirmado`. Production must keep the chain in
 * `execucao_fluxo.contexto` with Blip's keys and write subflow steps without a `bloco` row; the
 * Builder test run must behave the same over the draft; a Builder save without `subflows` keeps
 * the stored ones.
 */

const CLIENTE = '5511922220051';
const CALLER = 'subflow:7c0e4a52-1b8d-4f7e-9a61-2d3c4b5a6e70';

const EXPORT = JSON.parse(
  readFileSync(new URL('../../../packages/core/src/flow/fixtures/export-with-subflows.json', import.meta.url), 'utf8'),
) as { flow: Record<string, unknown>; globalActions: Record<string, unknown>; subflows: Record<string, { flow: Record<string, unknown>; globalActions: Record<string, unknown> }> };

let cenario: Cenario;
let api: ApiNoAr;
let flowId: string;
let sessionEditor: string;

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(CLIENTE, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function conversa(): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    select c.id from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
       and c.estado <> 'encerrada'
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!.id;
}

async function textosDoBot(conversationId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string | null }>(sql`
    select conteudo from mensagem
     where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot'
     order by criada_em, id
  `);
  return rows.map((r) => r.conteudo ?? '');
}

async function execucao(conversationId: string): Promise<{ id: string; contexto: Record<string, string>; estado: string }> {
  const { rows } = await cenario.dono.execute<{ id: string; contexto: Record<string, string>; estado: string }>(sql`
    select id, contexto, estado from execucao_fluxo where conversa_id = ${conversationId}::uuid
     order by iniciada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function editorSession(): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Editor ${marca}`}, ${`editor-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values ('automacao.fluxo.editar', 'automacao.fluxo.editar', 'teste') on conflict (codigo) do nothing
  `);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${papeis[0]!.id}, 'automacao.fluxo.editar')
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
  `);
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

async function pedir(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; body: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionEditor}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? (JSON.parse(texto) as Corpo) : {} };
}

beforeAll(async () => {
  cenario = await montarCenario(`subflows-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Subfluxos',
      channelId: cenario.channelId,
      json: EXPORT,
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  expect(r.report.naoSuportado).toEqual({});
  flowId = r.flowId;
  sessionEditor = await editorSession();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('import', () => {
  it('stores the subflows in the version document, next to the flow', async () => {
    const { rows } = await cenario.dono.execute<{ global: Corpo }>(sql`
      select global from fluxo_versao where fluxo_id = ${flowId}::uuid and estado = 'publicada'
    `);
    const subflow = rows[0]!.global['subflows']['coletadados'];
    expect(subflow.type).toBe('subflow');
    expect(subflow.states.map((s: Corpo) => s.id).sort()).toEqual(['end', 'fallback', 'onboarding', 'pergunta-nome', 'valida']);
    expect(Object.keys(subflow.editor.flow)).toContain('end');
  });

  it('accepts subflows exported separately and refuses to publish a flow whose subflow is missing', async () => {
    const semSubfluxos = { flow: EXPORT.flow, globalActions: EXPORT.globalActions };
    await expect(
      noTenant(cenario.tenantId, (tx) =>
        importFlowOfBlip(tx, { tenantId: cenario.tenantId, name: `Sem ${randomUUID().slice(0, 6)}`, channelId: null, json: semSubfluxos, publicar: true }),
      ),
    ).rejects.toThrow(/O subfluxo 'coletadados' chamado pelo bloco/);

    const separado = await noTenant(cenario.tenantId, (tx) =>
      importFlowOfBlip(tx, {
        tenantId: cenario.tenantId,
        name: `Separado ${randomUUID().slice(0, 6)}`,
        channelId: null,
        json: semSubfluxos,
        publicar: false,
        subflows: { coletadados: EXPORT.subflows['coletadados'] },
      }),
    );
    expect(separado.errorOfValidation).toBeNull();
  });
});

describe('production conversation', () => {
  it('enters the subflow, keeps Blip keys in the execution context and returns through the end block', async () => {
    await falar('oi');
    const id = await conversa();
    expect(await textosDoBot(id)).toEqual(['Olá! Antes de continuar, preciso de alguns dados.', 'Qual é o seu nome?']);
    const primeira = await execucao(id);
    expect(primeira.estado).toBe('aguardando');
    expect(primeira.contexto[`stateId@${flowId}`]).toBe(CALLER);
    expect(primeira.contexto[`currentFlowSession@${flowId}`]).toBe('coletadados');
    expect(primeira.contexto[`stateId@${subflowRuntimeId(flowId, 'coletadados')}`]).toBe('pergunta-nome');

    // Subflow blocks have no `bloco` row: the step names them in `saida`.
    const { rows: passos } = await cenario.dono.execute<{ bloco_id: string | null; saida: Corpo }>(sql`
      select bloco_id, saida from execucao_passo where execucao_id = ${primeira.id}::uuid order by em, id
    `);
    const doSubfluxo = passos.filter((p) => p.saida['subfluxo'] === 'coletadados');
    expect(doSubfluxo.map((p) => p.saida['estado'])).toEqual(['onboarding', 'pergunta-nome']);
    expect(doSubfluxo.every((p) => p.bloco_id === null)).toBe(true);

    await falar('Ana');
    expect((await textosDoBot(id)).at(-1)).toBe('Obrigado, Ana! Seus dados foram salvos.');
    const segunda = await execucao(id);
    expect(segunda.contexto[`stateId@${flowId}`]).toBe('confirmado');
    expect(segunda.contexto['nomeCliente']).toBe('Ana');
    expect(segunda.contexto).not.toHaveProperty(`currentFlowSession@${flowId}`);
    expect(segunda.contexto).not.toHaveProperty(`stateId@${subflowRuntimeId(flowId, 'coletadados')}`);
  });
});

describe('Builder', () => {
  const desenho = () => ({
    flow: EXPORT.flow,
    globals: EXPORT.globalActions,
    subflows: { coletadados: { flow: EXPORT.subflows['coletadados']!.flow, globals: EXPORT.subflows['coletadados']!.globalActions } },
  });

  async function criado(): Promise<string> {
    const { status, body } = await pedir('POST', '/v1/management/flows', {
      recados: { tamanho: 't', comecoInvalido: 'c', nomeEmUso: 'u', withoutPermission: 'p' },
      name: `Subfluxo ${randomUUID().slice(0, 6)}`,
      type: 'fluxo',
    });
    expect(status).toBe(200);
    return body['id'] as string;
  }

  it('test run behaves as production over the draft', async () => {
    const id = await criado();
    const salvo = await pedir('PUT', `/v1/management/flows/${id}/builder`, desenho());
    expect(salvo.status).toBe(200);

    const primeira = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'oi' });
    expect(primeira.status).toBe(200);
    expect(primeira.body['messages'].map((m: Corpo) => m['texto'])).toEqual([
      'Olá! Antes de continuar, preciso de alguns dados.',
      'Qual é o seu nome?',
    ]);
    expect(primeira.body['debug']['currentStateId']).toBe('pergunta-nome');
    expect(primeira.body['debug']['currentSubflow']).toBe('coletadados');
    expect(primeira.body['debug']['variables'][`currentFlowSession@${id}`]).toBe('coletadados');

    const segunda = await pedir('POST', `/v1/management/flows/${id}/builder/test-runs`, { input: 'Ana' });
    expect(segunda.body['messages'].map((m: Corpo) => m['texto'])).toEqual(['Obrigado, Ana! Seus dados foram salvos.']);
    expect(segunda.body['debug']['currentStateId']).toBe('confirmado');
    expect(segunda.body['debug']['currentSubflow']).toBeUndefined();
    expect(segunda.body['debug']['states'].map((s: Corpo) => [s['stateId'], s['subflow'] ?? null])).toEqual([
      ['pergunta-nome', 'coletadados'],
      ['valida', 'coletadados'],
      ['end', 'coletadados'],
      [CALLER, null],
      ['confirmado', null],
    ]);
  });

  it('a save without subflows keeps the stored ones; a broken subflow is reported on its calling block', async () => {
    const id = await criado();
    await pedir('PUT', `/v1/management/flows/${id}/builder`, desenho());
    const semSubfluxos = await pedir('PUT', `/v1/management/flows/${id}/builder`, { flow: EXPORT.flow, globals: EXPORT.globalActions });
    expect(semSubfluxos.status).toBe(200);
    const aberto = await pedir('GET', `/v1/management/flows/${id}/builder`);
    expect(Object.keys(aberto.body['desenho']['subflows'])).toEqual(['coletadados']);
    expect(aberto.body['errors']).toEqual([]);

    const quebrado = desenho();
    const semRaiz = structuredClone(quebrado.subflows.coletadados.flow) as Record<string, Corpo>;
    semRaiz['onboarding']!['root'] = false;
    const salvo = await pedir('PUT', `/v1/management/flows/${id}/builder`, {
      ...quebrado,
      subflows: { coletadados: { ...quebrado.subflows.coletadados, flow: semRaiz } },
    });
    expect(salvo.status).toBe(200);
    const depois = await pedir('GET', `/v1/management/flows/${id}/builder`);
    expect(depois.body['errors']).toContainEqual({
      block: CALLER,
      mensagem: "Subfluxo 'coletadados': O fluxo precisa de exatamente um estado raiz.",
    });
  });
});
