import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 41).toString('base64')}`;

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The Builder's Test panel (BUILDER-04, D-14): the owner unblocked local simulation over the
 * flow's current draft, with an isolated test contact — the real engine (`processInbound`,
 * `PROVEDOR_PADRAO`) never a real channel, never mixed with real conversations. Worth proving:
 * the bot answers with `toChannelOutput`-shaped messages; state and test variables persist
 * across messages for the SAME (tenant, user, flow); reset clears both; nothing here ever writes
 * to `mensagem`, `outbox_mensagem`, `conversa` or `execucao_fluxo`; the gates (403/404/429); and
 * T-2-06, ProcessHttp against a private/metadata address is refused by the same SSRF guard as
 * production, with no outbound request and the refusal visible in the debug trail.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionWithoutAuthority: string;
let sessionOfOtherTenant: string;

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
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

async function pedir(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? (JSON.parse(texto) as Corpo) : {} };
}

async function criado(nome: string): Promise<string> {
  const { status, body } = await pedir(sessionEditor, 'POST', '/v1/management/flows', {
    recados: {
      tamanho: 'recado: tamanho',
      comecoInvalido: 'recado: começo',
      nomeEmUso: 'recado: em uso',
      withoutPermission: 'recado: sem permissão',
    },
    name: nome,
    type: 'fluxo',
  });
  expect(status).toBe(200);
  expect(body['error']).toBeUndefined();
  return body['id'] as string;
}

const salvar = (sessao: string, id: string, desenho: unknown) =>
  pedir(sessao, 'PUT', `/v1/management/flows/${id}/builder`, desenho);
const testRun = (sessao: string, id: string, corpo: unknown) =>
  pedir(sessao, 'POST', `/v1/management/flows/${id}/builder/test-runs`, corpo);
const resetTestRun = (sessao: string, id: string) =>
  pedir(sessao, 'DELETE', `/v1/management/flows/${id}/builder/test-runs`);

/**
 * The root only waits for the first message (Blip semantics: a state's own `$contentActions`
 * message never fires without a transition INTO it, so `inicio` stays silent); `pergunta` asks
 * the name; `confirma` echoes it back together with a test variable, matching
 * `builder-by-flow.test.ts`'s proven fixture shape.
 */
function desenho(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  return {
    flow: {
      inicio: {
        id: 'inicio',
        root: true,
        $title: 'Início',
        $position: { top: '40px', left: '40px' },
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'pergunta' },
      },
      pergunta: {
        id: 'pergunta',
        $title: 'Pergunta',
        $position: { top: '200px', left: '40px' },
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: 'Oi! Qual é o seu nome?' } } },
          { input: { bypass: false, variable: 'nome' } },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'confirma' },
      },
      confirma: {
        id: 'confirma',
        $title: 'Confirma',
        $position: { top: '360px', left: '40px' },
        $contentActions: [
          {
            action: {
              type: 'SendMessage',
              settings: { type: 'text/plain', content: 'Prazer, {{nome}}! Modo: {{modo}}.' },
            },
          },
          { input: { bypass: false } },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'confirma' },
      },
    },
    globals: {},
  };
}

/** Same root, with `ProcessHttp` as a GLOBAL entering action, so it runs on every message (T-2-06). */
function desenhoComHttpPrivado(): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
  return {
    flow: {
      inicio: {
        id: 'inicio',
        root: true,
        $title: 'Início',
        $position: { top: '40px', left: '40px' },
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'inicio' },
      },
    },
    globals: {
      $enteringCustomActions: [
        {
          type: 'ProcessHttp',
          settings: { method: 'GET', uri: 'http://169.254.169.254/latest/meta-data' },
        },
      ],
    },
  };
}

/**
 * P9: the same V2 script as `flow-actions.test.ts` (production path): writes, deletes and reads the
 * flow context, reads a secret (must come back empty), parses and formats a date, and sleeps.
 */
function scriptV2Action(): Record<string, unknown> {
  return {
    type: 'ExecuteScriptV2',
    settings: {
      source: `async function run() {
        await context.setVariableAsync('v2Texto', 'gravado');
        await context.setVariableAsync('v2Tmp', 'x');
        await context.deleteVariableAsync('v2Tmp');
        const quando = time.dateToString(time.parseDate('2026-02-03 11:05', { timeZone: 'America/Sao_Paulo' }), { format: 'dd/MM HH:mm' });
        time.sleep(10);
        return [await context.getVariableAsync('input.content'), await context.getVariableAsync('v2Tmp'),
          await context.getVariableAsync('secret.apiToken'), quando].join('|');
      }`,
      inputVariables: [],
      outputVariable: 'v2Saida',
    },
  };
}
const SCRIPT_V2_OUTPUT = 'script-v2|||03/02 14:05';

/** P9 `ExecuteTemplate`: a JSON variable, `#each`/`#if`, a nested path, a missing variable and a secret. */
function templatePedidoAction(): Record<string, unknown> {
  return {
    type: 'SetVariable',
    settings: { variable: 'tplPedido', value: '{"numero":7,"itens":[{"nome":"Caneta"},{"nome":"Caderno"}]}' },
  };
}
function templateAction(): Record<string, unknown> {
  return {
    type: 'ExecuteTemplate',
    settings: {
      template: '{{input.content}} #{{tplPedido.numero}}:{{#each tplPedido.itens}}{{#if @index}},{{/if}} {{nome}}{{/each}} [{{faltando}}][{{secret.apiToken}}]',
      inputVariables: ['input.content', 'tplPedido', 'faltando', 'secret.apiToken'],
      outputVariable: 'tplSaida',
    },
  };
}
const TEMPLATE_OUTPUT = 'template #7: Caneta, Caderno [][]';

type ContagemDeProducao = {
  mensagem: number;
  outbox_mensagem: number;
  conversa: number;
  execucao_fluxo: number;
};

async function contagemDeProducao(tenantId: string): Promise<ContagemDeProducao> {
  const um = async (tabela: string): Promise<number> => {
    const { rows } = await a.dono.execute<{ n: string }>(
      sql.raw(`select count(*)::text as n from ${tabela} where tenant_id = '${tenantId}'`),
    );
    return Number(rows[0]!.n);
  };
  return {
    mensagem: await um('mensagem'),
    outbox_mensagem: await um('outbox_mensagem'),
    conversa: await um('conversa'),
    execucao_fluxo: await um('execucao_fluxo'),
  };
}

beforeAll(async () => {
  a = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  const doB = await pessoaCom(b, ['automacao.fluxo.editar']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, doB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('POST /v1/management/flows/:id/builder/test-runs', () => {
  it('runs the draft with the real engine, keeps test state between messages, and never touches production tables', async () => {
    const id = await criado(`Teste ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho());

    const antes = await contagemDeProducao(a.tenantId);

    const primeira = await testRun(sessionEditor, id, { input: 'oi' });
    expect(primeira.status).toBe(200);
    expect(primeira.body['messages']).toEqual([
      { tipo: 'texto', texto: 'Oi! Qual é o seu nome?', dados: null },
    ]);
    expect(primeira.body['debug']['currentStateId']).toBe('pergunta');

    // // The test contact's position is saved: the next message continues from `inicio`, waiting
    // // for the name, and the reply substitutes the test variable set alongside the input.
    const segunda = await testRun(sessionEditor, id, { input: 'Ana', testVariables: { modo: 'simulação' } });
    expect(segunda.status).toBe(200);
    expect(segunda.body['messages']).toEqual([
      { tipo: 'texto', texto: 'Prazer, Ana! Modo: simulação.', dados: null },
    ]);
    expect(segunda.body['debug']['currentStateId']).toBe('confirma');
    expect(segunda.body['debug']['variables']).toMatchObject({ nome: 'Ana', modo: 'simulação' });

    const depois = await contagemDeProducao(a.tenantId);
    expect(depois).toEqual(antes);
  });

  it('reset clears the test contact and its variables; the next message starts from the root again', async () => {
    const id = await criado(`Reset ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho());

    await testRun(sessionEditor, id, { input: 'oi' });
    await testRun(sessionEditor, id, { input: 'Bia' });

    const zerado = await resetTestRun(sessionEditor, id);
    expect(zerado.status).toBe(200);
    expect(zerado.body).toEqual({ reset: true });

    const depoisDoReset = await testRun(sessionEditor, id, { input: 'oi de novo' });
    expect(depoisDoReset.body['messages']).toEqual([
      { tipo: 'texto', texto: 'Oi! Qual é o seu nome?', dados: null },
    ]);
    expect(depoisDoReset.body['debug']['variables']['nome']).toBeUndefined();
  });

  it('blocks private URL in test-run HTTP (SSRF): no outbound request, and the refusal is visible in the debug trail (T-2-06)', async () => {
    const id = await criado(`SSRF ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenhoComHttpPrivado());

    const antes = await contagemDeProducao(a.tenantId);
    const { status, body } = await testRun(sessionEditor, id, { input: 'oi' });
    expect(status).toBe(200);
    const globalActions = body['debug']['actionsGlobal'] as { tipo: string; error?: string }[];
    const processHttp = globalActions.find((acao) => acao.tipo === 'ProcessHttp');
    expect(processHttp?.error).toBeDefined();
    expect(processHttp?.error).toMatch(/http|url/i);
    expect(body['debug']['error']).toBeDefined();
    expect(await contagemDeProducao(a.tenantId)).toEqual(antes);
  });

  it('shares the production engine services: a ticket transfer is validated exactly as in production', async () => {
    const comTransferencia = (queueId: string) => {
      const d = desenhoComHttpPrivado();
      d.globals = {
        $enteringCustomActions: [
          { type: 'ProcessCommand', settings: { method: 'set', uri: '/tickets/atual/transfer', resource: { queueId }, variable: 'r' } },
        ],
      };
      return d;
    };
    const id = await criado(`Comando ${randomUUID().slice(0, 6)}`);

    await salvar(sessionEditor, id, comTransferencia('fila-vendas'));
    const invalida = await testRun(sessionEditor, id, { input: 'oi' });
    expect(invalida.body['debug']['error']).toMatch(/queueId.*inválido/);

    // Another tenant's queue: the same tenant check production runs (the test run used to accept it).
    await salvar(sessionEditor, id, comTransferencia(b.queueId));
    await resetTestRun(sessionEditor, id);
    const alheia = await testRun(sessionEditor, id, { input: 'oi' });
    expect(alheia.body['debug']['error']).toMatch(/não existe neste Pipe/);
  });

  it('ExecuteScriptV2 context.*Async and time.* behave as in production, and never reveal secret.* (P9)', async () => {
    const id = await criado(`Script V2 ${randomUUID().slice(0, 6)}`);
    const segredo = 'tok-INVENTED-v2-98765';
    const criadoSegredo = await pedir(sessionEditor, 'POST', `/v1/management/flows/${id}/secrets`, { name: 'apiToken', value: segredo });
    expect(criadoSegredo.status).toBe(201);
    const d = desenhoComHttpPrivado();
    d.globals = { $enteringCustomActions: [scriptV2Action()] };
    await salvar(sessionEditor, id, d);

    const { status, body } = await testRun(sessionEditor, id, { input: 'script-v2' });
    expect(status).toBe(200);
    expect(body['debug']['error']).toBeUndefined();
    expect(body['debug']['variables']).toMatchObject({ v2Texto: 'gravado', v2Saida: SCRIPT_V2_OUTPUT });
    expect(body['debug']['variables']['v2Tmp']).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(segredo);
  });

  it('ExecuteTemplate renders Handlebars as in production and never sees secret.* (P9)', async () => {
    const id = await criado(`Template ${randomUUID().slice(0, 6)}`);
    const segredo = 'tok-INVENTED-tpl-24680';
    const criadoSegredo = await pedir(sessionEditor, 'POST', `/v1/management/flows/${id}/secrets`, { name: 'apiToken', value: segredo });
    expect(criadoSegredo.status).toBe(201);
    const d = desenhoComHttpPrivado();
    d.globals = { $enteringCustomActions: [templatePedidoAction(), templateAction()] };
    await salvar(sessionEditor, id, d);

    const { status, body } = await testRun(sessionEditor, id, { input: 'template' });
    expect(status).toBe(200);
    expect(body['debug']['error']).toBeUndefined();
    expect(body['debug']['variables']).toMatchObject({ tplSaida: TEMPLATE_OUTPUT });
    expect(JSON.stringify(body)).not.toContain(segredo);
  });

  it('ForwardToDesk availability exits run the production checks over the queue chosen by extras.teams (P6)', async () => {
    // The export's attendance block: MergeContact extras.teams, ForwardToDesk with empty settings,
    // entered on Success, plus the Builder's availability exits.
    const block = (teams: string) => ({
      flow: {
        inicio: {
          id: 'inicio',
          root: true,
          $title: 'Início',
          $position: { top: '40px', left: '40px' },
          $contentActions: [{ input: { bypass: false } }],
          $conditionOutputs: [],
          $enteringCustomActions: [],
          $leavingCustomActions: [],
          $defaultOutput: { stateId: 'desk:suporte' },
        },
        'desk:suporte': {
          id: 'desk:suporte',
          $title: 'Atendimento humano',
          $position: { top: '200px', left: '40px' },
          $contentActions: [
            {
              input: {
                bypass: false,
                conditions: [{ source: 'context', variable: 'desk_forwardToDeskState_status', comparison: 'equals', values: ['Success'] }],
              },
            },
          ],
          $conditionOutputs: ['OutOfAttendanceHour', 'NoAgentAvailable', 'Error'].map((status) => ({
            stateId: status === 'Error' ? 'erro' : status === 'NoAgentAvailable' ? 'ninguem' : 'fechado',
            conditions: [{ source: 'context', variable: 'desk_forwardToDeskState_status', comparison: 'equals', values: [status] }],
          })),
          $enteringCustomActions: [
            { type: 'MergeContact', settings: { extras: { teams } } },
            { type: 'ForwardToDesk', settings: {} },
          ],
          $leavingCustomActions: [],
          $defaultOutput: { stateId: 'desk:suporte' },
        },
        ...Object.fromEntries(
          [['fechado', 'Fora do horário.'], ['ninguem', 'Ninguém online.'], ['erro', 'Erro.']].map(([id, texto], i) => [
            id,
            {
              id,
              $title: id,
              $position: { top: `${360 + i * 160}px`, left: '40px' },
              $contentActions: [
                { action: { type: 'SendMessage', settings: { type: 'text/plain', content: texto } } },
                { input: { bypass: false } },
              ],
              $conditionOutputs: [],
              $enteringCustomActions: [],
              $leavingCustomActions: [],
              $defaultOutput: { stateId: id },
            },
          ]),
        ),
      },
      globals: {},
    });
    // A queue nobody serves, and the scenario's queue, served by an online agent.
    const vazia = `Sem ninguém ${randomUUID().slice(0, 6)}`;
    await a.dono.execute(sql`insert into fila (tenant_id, nome) values (${a.tenantId}, ${vazia})`);
    const { rows } = await a.dono.execute<{ nome: string }>(sql`select nome from fila where id = ${a.queueId}::uuid`);
    const suporte = rows[0]!.nome;
    const id = await criado(`Transbordo ${randomUUID().slice(0, 6)}`);

    await salvar(sessionEditor, id, block(vazia));
    const semNinguem = await testRun(sessionEditor, id, { input: 'quero atendimento' });
    expect(semNinguem.body['messages']).toEqual([{ tipo: 'texto', texto: 'Ninguém online.', dados: null }]);
    expect(semNinguem.body['debug']['variables']).toMatchObject({ desk_forwardToDeskState_status: 'NoAgentAvailable' });

    await salvar(sessionEditor, id, block(suporte));
    await resetTestRun(sessionEditor, id);
    const atendido = await testRun(sessionEditor, id, { input: 'quero atendimento' });
    expect(atendido.body['messages']).toEqual([]);
    expect(atendido.body['debug']['variables']).toMatchObject({ desk_forwardToDeskState_status: 'Success' });
    expect(atendido.body['debug']['currentStateId']).toBe('desk:suporte');
  });

  it('403 without `automacao.fluxo.editar`, 404 for another tenant or an invalid id', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho());

    const semPoder = await testRun(sessionWithoutAuthority, id, { input: 'oi' });
    expect(semPoder.status).toBe(403);
    expect(semPoder.body['error']).toMatchObject({ code: 'without_permission' });

    expect((await testRun(sessionOfOtherTenant, id, { input: 'oi' })).status).toBe(404);
    expect((await testRun(sessionEditor, 'nao-e-uuid', { input: 'oi' })).status).toBe(404);
    expect((await resetTestRun(sessionOfOtherTenant, id)).status).toBe(404);
  });

  it('429 after too many test messages in a minute from the same user', async () => {
    const id = await criado(`Rajada ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho());

    let ultimo: { status: number; body: Corpo } | undefined;
    for (let i = 0; i < 32; i += 1) {
      ultimo = await testRun(sessionEditor, id, { input: 'oi' });
    }
    expect(ultimo?.status).toBe(429);
    expect(ultimo?.body['error']).toMatchObject({ code: 'limit_of_rate' });
  });
});
