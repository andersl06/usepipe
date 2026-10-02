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

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { ID_DA_RAIZ_PADRAO, ID_OF_ATTENDANCE_DEFAULT } = await import('@pipe/core');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { flowPublishedOfChannel } = await import('../src/domain/flow.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The Builder's EDIT → SAVE DRAFT → PUBLISH cycle, PER FLOW (`/v1/gestao/fluxos/:id/builder`, `dominio/gestao/builder-do-fluxo.ts`).
 *
 * What's worth proving: a new flow opens with the default publishable flow; saving writes OVER the draft (one version, not one per keystroke) and returns the engine's errors block by block even while saving; publishing numbers the next version, archives the previous one, and rejects an invalid flow with the list; the engine (`fluxoPublicadoDoCanal`/`rodarFluxoNaEntrada`, via the webhook) starts using the new one while a conversation already with the bot keeps pointing to the old one — which wasn't deleted or changed; restoring brings an old version back as a draft without taking the published one down; and the gates: 403 without `automacao.fluxo.publicar`, 404 for another tenant, 409 at the router.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Who creates and edits, but doesn't publish. */
let sessionEditor: string;
/** Who also publishes. */
let sessionPublisher: string;
/** People from tenant A with no permission at all on the flow. */
let sessionWithoutAuthority: string;
/** Who can do everything in tenant B: proves the tenant comes from the session, never from the URL. */
let sessionOfOtherTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  withoutPermission: 'recado: sem permissão',
};

const ANA = '5511922220001';
const BIA = '5511922220002';
const CARLA = '5511922220003';

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

/*
 * The raw body of responses: `any` like in `cadastros-atendimento.test.ts`, to navigate `corpo.erro.detalhe.erros` without a type per route.
 */
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

/** Cria o contato pela rota de criar e devolve o id. */
async function criado(nome: string, tipo: 'fluxo' | 'roteador' = 'fluxo'): Promise<string> {
  const { status, body } = await pedir(sessionEditor, 'POST', '/v1/management/flows', {
    recados: RECADOS,
    name: nome,
    type: tipo,
  });
  expect(status).toBe(200);
  expect(body['error']).toBeUndefined();
  return body['id'] as string;
}

const builder = (sessao: string, id: string) => pedir(sessao, 'GET', `/v1/management/flows/${id}/builder`);
const salvar = (sessao: string, id: string, desenho: unknown) =>
  pedir(sessao, 'PUT', `/v1/management/flows/${id}/builder`, desenho);
const publicar = (sessao: string, id: string) =>
  pedir(sessao, 'POST', `/v1/management/flows/${id}/builder/publish`);
const versions = (sessao: string, id: string) =>
  pedir(sessao, 'GET', `/v1/management/flows/${id}/builder/versions`);
const restore = (sessao: string, id: string, versao: string | number) =>
  pedir(sessao, 'POST', `/v1/management/flows/${id}/builder/versions/${versao}/restore`);
const versionDrawing = (sessao: string, id: string, versao: string | number) =>
  pedir(sessao, 'GET', `/v1/management/flows/${id}/builder/versions/${versao}`);

/**
 * A design in the Blip editor's format, as the copy dictates: the root expects the first message, the next block asks for the name and waits, and the attendance one overflows. `texto` changes between versions so the test can see which version the engine ran.
 */
function desenho(texto: string): { flow: Record<string, unknown>; globals: Record<string, unknown> } {
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
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: texto } } },
          { input: { bypass: false, variable: 'nome' } },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'desk:atendimento' },
      },
      'desk:atendimento': {
        id: 'desk:atendimento',
        $title: 'Atendimento humano',
        $position: { top: '360px', left: '40px' },
        $contentActions: [
          {
            input: {
              bypass: false,
              conditions: [
                {
                  source: 'context',
                  variable: 'desk_forwardToDeskState_status',
                  comparison: 'equals',
                  values: ['Success'],
                },
              ],
            },
          },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [{ type: 'ForwardToDesk', settings: {}, conditions: [] }],
        $leavingCustomActions: [],
        $afterStateChangedActions: [{ type: 'LeavingFromDesk', settings: {}, conditions: [] }],
        $defaultOutput: { stateId: 'inicio' },
      },
    },
    globals: {},
  };
}

/** The text the `pergunta` block sends, read from the design the `api` returns. */
function falaDaPergunta(corpo: Corpo): string {
  return falaDoDesenho(corpo['desenho']);
}

/** Same as `falaDaPergunta`, but for a `DesenhoDoBuilder` body directly (`GET .../versions/:version`). */
function falaDoDesenho(desenho: Corpo): string {
  const pergunta = desenho['flow']['pergunta'];
  return pergunta['$contentActions'][0]['action']['settings']['content'] as string;
}

type LinhaVersao = { id: string; versao: number; estado: string; blocos: number };

async function versionsInDatabase(flowId: string): Promise<LinhaVersao[]> {
  const { rows } = await a.dono.execute<LinhaVersao>(sql`
    select v.id, v.versao, v.estado,
           (select count(*)::int from bloco b where b.versao_id = v.id) as blocos
      from fluxo_versao v where v.fluxo_id = ${flowId}::uuid
     order by v.versao
  `);
  return rows;
}

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function conversationOf(telefone: string): Promise<{ id: string; contactId: string }> {
  const { rows } = await a.dono.execute<{ id: string; contactId: string }>(sql`
    -- D-15: sem ticket antes do transbordo, a conversa do bot é a execução
    select e.id, e.contato_id as "contactId" from execucao_fluxo e join contato ct on ct.id = e.contato_id
     where e.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by e.iniciada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversationId: string): Promise<string[]> {
  const { rows } = await a.dono.execute<{ content: string }>(sql`
    select conteudo as "content" from mensagem
     where execucao_id = ${conversationId}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  return rows.map((r) => r.content);
}

type LineExecution = { estado: string; fluxo_versao_id: string; bloco_versao_id: string | null };

async function executionOf(conversaId: string): Promise<LineExecution> {
  const { rows } = await a.dono.execute<LineExecution>(sql`
    select e.estado, e.fluxo_versao_id, b.versao_id as bloco_versao_id
      from execucao_fluxo e left join bloco b on b.id = e.bloco_atual_id
     where e.id = ${conversaId}::uuid
     order by e.iniciada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

beforeAll(async () => {
  a = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const publicador = await pessoaCom(a, ['automacao.fluxo.editar', 'automacao.fluxo.publicar']);
  const semPoder = await pessoaCom(a, []);
  const doB = await pessoaCom(b, ['automacao.fluxo.editar', 'automacao.fluxo.publicar']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor);
  sessionPublisher = await openSession(a, publicador);
  sessionWithoutAuthority = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, doB);

  // // With nobody online: the transferred conversation stays IN THE QUEUE, with no agent.
  await a.dono.execute(
    sql`update status_atendente set estado = 'offline' where usuario_id = ${a.agentId}::uuid`,
  );
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET /v1/management/flows/:id/builder', () => {
  it('Open a new flow with a publishable default and no saved draft', async () => {
    const id = await criado(`Novo ${randomUUID().slice(0, 6)}`);
    const { status, body } = await builder(sessionEditor, id);
    expect(status).toBe(200);
    expect(body).toMatchObject({ flowId: id, origem: 'padrao', versao: null, publicada: null });
    expect(body['errors']).toEqual([]);
    expect(Object.keys(body['desenho']['flow']).sort()).toEqual(
      [ID_DA_RAIZ_PADRAO, ID_OF_ATTENDANCE_DEFAULT].sort(),
    );
    expect(body['desenho']['globals']).toMatchObject({ id: 'global-actions' });
    expect(await versionsInDatabase(id)).toHaveLength(0);
  });

  it('Return 409 on every Builder route for router bots', async () => {
    const id = await criado(`Roteador ${randomUUID().slice(0, 6)}`, 'roteador');
    const respostas = [
      await builder(sessionPublisher, id),
      await salvar(sessionPublisher, id, desenho('x')),
      await publicar(sessionPublisher, id),
      await versions(sessionPublisher, id),
      await restore(sessionPublisher, id, 1),
    ];
    for (const { status, body } of respostas) {
      expect(status).toBe(409);
      expect(body['error']['code']).toBe('router_without_builder');
      expect(body['error']['message']).toContain('Roteador não tem Builder');
    }
  });

  it('Return 403 without `automacao.fluxo.editar` and 404 for invalid or cross-tenant IDs', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);

    const semPoder = await builder(sessionWithoutAuthority, id);
    expect(semPoder.status).toBe(403);
    expect(semPoder.body['error']).toMatchObject({
      code: 'without_permission',
      detalhe: { permission: 'automacao.fluxo.editar' },
    });

    expect((await builder(sessionOfOtherTenant, id)).status).toBe(404);
    expect((await salvar(sessionOfOtherTenant, id, desenho('x'))).status).toBe(404);
    expect((await versions(sessionOfOtherTenant, id)).status).toBe(404);
    expect((await builder(sessionEditor, 'nao-e-uuid')).status).toBe(404);

    const withoutSession = await fetch(`${api.url}/v1/management/flows/${id}/builder`);
    expect(withoutSession.status).toBe(401);
  });
});

describe('PUT /v1/management/flows/:id/builder', () => {
  it('Keep the template return-flow link across saves by block code, and drop it when the block leaves the drawing', async () => {
    const id = await criado(`Retorno ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('Olá!'));
    const { rows: modelo } = await a.dono.execute<{ id: string }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, categoria, corpo)
      values (${a.tenantId}, ${a.channelId}, ${`r_${randomUUID().slice(0, 8)}`}, 'utilidade', 'oi') returning id`);
    const ligar = async (codigo: string) =>
      a.dono.execute(sql`
        update template_mensagem set fluxo_retorno_bloco_id = (
          select b.id from bloco b join fluxo_versao v on v.id = b.versao_id
           where v.fluxo_id = ${id}::uuid and b.codigo = ${codigo})
         where id = ${modelo[0]!.id}::uuid`);
    const codigoLigado = async () =>
      (await a.dono.execute<{ codigo: string | null }>(sql`
        select b.codigo from template_mensagem t left join bloco b on b.id = t.fluxo_retorno_bloco_id
         where t.id = ${modelo[0]!.id}::uuid`)).rows[0]!.codigo;

    await ligar('pergunta');
    await salvar(sessionEditor, id, desenho('Oi de novo!'));
    expect(await codigoLigado()).toBe('pergunta');

    const semPergunta = desenho('x');
    delete semPergunta.flow['pergunta'];
    (semPergunta.flow['inicio'] as Record<string, unknown>)['$defaultOutput'] = { stateId: 'inicio' };
    await salvar(sessionEditor, id, semPergunta);
    expect(await codigoLigado()).toBeNull();
  });

  it('Save draft v1 in place on repeated edits instead of creating a version per keystroke', async () => {
    const id = await criado(`Rascunho ${randomUUID().slice(0, 6)}`);

    const first = await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome?'));
    expect(first.status).toBe(200);
    expect(first.body['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(first.body['erros']).toEqual([]);
    expect(first.body['naoSuportado']).toEqual({});

    const aberto = await builder(sessionEditor, id);
    expect(aberto.body).toMatchObject({ origem: 'rascunho', publicada: null });
    expect(aberto.body['versao']['versao']).toBe(1);
    expect(falaDaPergunta(aberto.body)).toBe('Olá! Qual é o seu nome?');

    const segunda = await salvar(sessionEditor, id, desenho('Oi! Como você se chama?'));
    expect(segunda.status).toBe(200);
    expect(segunda.body['versao']['id']).toBe(first.body['versao']['id']);
    expect(segunda.body['versao']['versao']).toBe(1);

    const inDatabase = await versionsInDatabase(id);
    expect(inDatabase).toHaveLength(1);
    expect(inDatabase[0]).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(falaDaPergunta((await builder(sessionEditor, id)).body)).toBe('Oi! Como você se chama?');

    // // The flow itself stays a draft: saving doesn't publish.
    const { rows } = await a.dono.execute<{ state: string }>(
      sql`select estado as "state" from fluxo where id = ${id}::uuid`,
    );
    expect(rows[0]?.state).toBe('rascunho');
  });

  it('Save an invalid design while returning engine errors per block', async () => {
    const id = await criado(`Invalido ${randomUUID().slice(0, 6)}`);
    const quebrado = {
      flow: {
        inicio: {
          id: 'inicio',
          root: true,
          $title: 'Início',
          // // No entry at the root, and the exit points to a block that doesn't exist.
          $contentActions: [],
          $conditionOutputs: [],
          $defaultOutput: { stateId: 'fantasma' },
        },
      },
      globals: {},
    };

    const { status, body } = await salvar(sessionEditor, id, quebrado);
    expect(status).toBe(200);
    expect(body['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 1 });
    const errors = body['erros'] as { block: string | null; mensagem: string }[];
    expect(errors).toEqual(
      expect.arrayContaining([
        { block: 'inicio', mensagem: "O estado de destino 'fantasma' da saída não existe." },
        { block: 'inicio', mensagem: 'O estado raiz precisa esperar uma entrada.' },
      ]),
    );
    expect(errors.every((e) => e.block === 'inicio')).toBe(true);

    // // The read returns the same errors — the screen opens already knowing what's missing.
    const aberto = await builder(sessionEditor, id);
    expect(aberto.body['origem']).toBe('rascunho');
    expect(aberto.body['errors']).toEqual(errors);

    // // And publishing rejects with the list, without touching anything.
    const recusa = await publicar(sessionPublisher, id);
    expect(recusa.status).toBe(409);
    expect(recusa.body['error']['code']).toBe('flow_invalid');
    expect(recusa.body['error']['detalhe']['errors']).toEqual(errors);
    expect((await versionsInDatabase(id))[0]?.estado).toBe('rascunho');

    // // A body that isn't the editor's map is 400, not 500.
    const torto = await salvar(sessionEditor, id, { flow: 'isto não é um mapa' });
    expect(torto.status).toBe(400);
    expect(torto.body['error']['code']).toBe('design_invalid');
  });

  it('Do not save a draft without `automacao.fluxo.editar`', async () => {
    const id = await criado(`Trancado ${randomUUID().slice(0, 6)}`);
    const { status, body } = await salvar(sessionWithoutAuthority, id, desenho('x'));
    expect(status).toBe(403);
    expect(body['error']['code']).toBe('without_permission');
    expect(await versionsInDatabase(id)).toHaveLength(0);
  });
});

describe('PUT /v1/management/flows/:id/builder — configuration', () => {
  it('roundtrips through GET, lands in the published global, and resolves {{config.X}} in the engine', async () => {
    const id = await criado(`Config ${randomUUID().slice(0, 6)}`);
    await a.dono.execute(sql`update fluxo set canal_id = ${a.channelId}::uuid where id = ${id}::uuid`);

    const salvo = await salvar(sessionEditor, id, {
      ...desenho('Olá, {{config.Saudacao}}!'),
      configuration: { Saudacao: 'bem-vindo' },
    });
    expect(salvo.status).toBe(200);

    const aberto = await builder(sessionEditor, id);
    expect(aberto.body['desenho']['configuration']).toEqual({ Saudacao: 'bem-vindo' });

    const pub = await publicar(sessionPublisher, id);
    expect(pub.status).toBe(200);

    const { rows } = await a.dono.execute<{ global: Record<string, unknown> }>(
      sql`select global from fluxo_versao where id = ${pub.body['versao']['id']}::uuid`,
    );
    expect(rows[0]?.global['configuration']).toEqual({ Saudacao: 'bem-vindo' });

    await falar(CARLA, 'oi');
    const conversa = await conversationOf(CARLA);
    expect(await doBot(conversa.id)).toEqual(['Olá, bem-vindo!']);
    // Free the scenario channel: the next suites attach their own flow to it.
    await a.dono.execute(sql`update fluxo set canal_id = null where id = ${id}::uuid`);
  });

  it('a design without `configuration` reads back `{}`, and old drafts keep opening', async () => {
    const id = await criado(`SemConfig ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('x'));
    const aberto = await builder(sessionEditor, id);
    expect(aberto.body['desenho']['configuration']).toEqual({});
  });

  it('rejects `configuration` that is not an object of texts', async () => {
    const id = await criado(`ConfigInvalido ${randomUUID().slice(0, 6)}`);
    const resp = await salvar(sessionEditor, id, { ...desenho('x'), configuration: { Nome: 42 } });
    expect(resp.status).toBe(400);
    expect(resp.body['error']['code']).toBe('design_invalid');
  });

  it('rejects a user key outside [a-zA-Z0-9], but keeps `builder:*` keys', async () => {
    const id = await criado(`ChaveInvalida ${randomUUID().slice(0, 6)}`);
    const semPrefixo = await salvar(sessionEditor, id, {
      ...desenho('x'),
      configuration: { 'nome-1': 'x' },
    });
    expect(semPrefixo.status).toBe(400);
    expect(semPrefixo.body['error']['code']).toBe('design_invalid');

    const comPrefixo = await salvar(sessionEditor, id, {
      ...desenho('x'),
      configuration: { 'builder:stateTrack': 'true' },
    });
    expect(comPrefixo.status).toBe(200);
    expect((await builder(sessionEditor, id)).body['desenho']['configuration']).toEqual({
      'builder:stateTrack': 'true',
    });
  });
});

describe('POST /v1/management/flows/:id/builder/publish', () => {
  it('Publish v2, archive v1, switch the engine, and keep active conversations on v1', async () => {
    const id = await criado(`Publicado ${randomUUID().slice(0, 6)}`);
    // // The scenario's channel becomes this flow's: that's how the webhook reaches the engine.
    await a.dono.execute(sql`update fluxo set canal_id = ${a.channelId}::uuid where id = ${id}::uuid`);

    // // No draft, nothing to publish.
    const semRascunho = await publicar(sessionPublisher, id);
    expect(semRascunho.status).toBe(409);
    expect(semRascunho.body['error']['code']).toBe('without_draft');

    await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome? (v1)'));
    const v1 = await publicar(sessionPublisher, id);
    expect(v1.status).toBe(200);
    expect(v1.body['versao']).toMatchObject({ versao: 1, estado: 'publicada', blocos: 3 });
    expect(v1.body['versao']['publicadaEm']).toEqual(expect.any(String));
    expect(v1.body['versao']['publishedBy']).toMatch(/^Pessoa /);
    expect(v1.body['arquivada']).toBeNull();
    const v1Id = v1.body['versao']['id'] as string;

    const { rows: flows } = await a.dono.execute<{ estado: string }>(
      sql`select estado from fluxo where id = ${id}::uuid`,
    );
    expect(flows[0]?.estado).toBe('publicado');

    // // With no draft, the Builder opens the published version.
    const aberto = await builder(sessionEditor, id);
    expect(aberto.body['origem']).toBe('publicada');
    expect(aberto.body['versao']['versao']).toBe(1);
    expect(aberto.body['publicada']['versao']).toBe(1);

    // // The engine responds with v1, and Ana's conversation stays waiting for the name — in progress.
    await falar(ANA, 'oi');
    const conversationOfAna = await conversationOf(ANA);
    expect(await doBot(conversationOfAna.id)).toEqual(['Olá! Qual é o seu nome? (v1)']);
    const inProgress = await executionOf(conversationOfAna.id);
    expect(inProgress).toMatchObject({ estado: 'aguardando', fluxo_versao_id: v1Id });

    // // Saving again creates draft v2 (the published v1 is immutable), and publishing promotes it.
    const rascunho = await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome? (v2)'));
    expect(rascunho.body['versao']).toMatchObject({ versao: 2, estado: 'rascunho' });
    expect(rascunho.body['versao']['id']).not.toBe(v1Id);

    const v2 = await publicar(sessionPublisher, id);
    expect(v2.status).toBe(200);
    expect(v2.body['versao']).toMatchObject({ versao: 2, estado: 'publicada' });
    expect(v2.body['arquivada']).toMatchObject({ id: v1Id, versao: 1, estado: 'arquivada' });
    const v2Id = v2.body['versao']['id'] as string;

    const noBanco = await versionsInDatabase(id);
    expect(noBanco.map((v) => [v.versao, v.estado, v.blocos])).toEqual([
      [1, 'arquivada', 3],
      [2, 'publicada', 3],
    ]);

    // // Ana's run stays on v1 — its version and blocks remain intact.
    const aindaNaV1 = await executionOf(conversationOfAna.id);
    expect(aindaNaV1.fluxo_versao_id).toBe(v1Id);
    expect(aindaNaV1.bloco_versao_id).toBe(v1Id);

    // // A new conversation belongs to v2: by the real engine, and by the query the engine uses.
    await falar(BIA, 'oi');
    const conversationOfBia = await conversationOf(BIA);
    expect(await doBot(conversationOfBia.id)).toEqual(['Olá! Qual é o seu nome? (v2)']);
    expect((await executionOf(conversationOfBia.id)).fluxo_versao_id).toBe(v2Id);
    const publicado = await noTenant(a.tenantId, (tx) =>
      flowPublishedOfChannel(tx, a.channelId, conversationOfBia.contactId),
    );
    expect(publicado).toEqual({ flowId: id, versaoId: v2Id });

    // // The history lists both, newest to oldest.
    const history = await versions(sessionEditor, id);
    expect(history.status).toBe(200);
    const listadas = history.body as unknown as { versao: number; estado: string }[];
    expect(listadas.map((v) => [v.versao, v.estado])).toEqual([
      [2, 'publicada'],
      [1, 'arquivada'],
    ]);

    // // And it's on record who published what.
    const { rows: log } = await a.dono.execute<{ acao: string; objeto_tipo: string }>(sql`
      select acao, objeto_tipo from log_auditoria
       where objeto_id = ${v2Id}::uuid order by em asc, id asc
    `);
    expect(log.map((l) => [l.acao, l.objeto_tipo])).toEqual([
      ['criou', 'fluxo_versao'],
      ['ativou', 'fluxo_versao'],
    ]);
  });

  it('Require `automacao.fluxo.publicar` and return 404 for another tenant\'s flow', async () => {
    const id = await criado(`Protegido ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('x'));

    const editor = await publicar(sessionEditor, id);
    expect(editor.status).toBe(403);
    expect(editor.body['error']).toMatchObject({
      code: 'without_permission',
      detalhe: { permission: 'automacao.fluxo.publicar' },
    });

    expect((await publicar(sessionOfOtherTenant, id)).status).toBe(404);

    const noBanco = await versionsInDatabase(id);
    expect(noBanco).toHaveLength(1);
    expect(noBanco[0]?.estado).toBe('rascunho');
  });
});

describe('POST /v1/management/flows/:id/builder/versions/:versao/restore', () => {
  it('traz uma versão antiga de volta como rascunho, sem tirar a publicada do ar', async () => {
    const id = await criado(`Restaurado ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('primeira'));
    await publicar(sessionPublisher, id);
    await salvar(sessionEditor, id, desenho('segunda'));
    await publicar(sessionPublisher, id);

    const { status, body } = await restore(sessionEditor, id, 1);
    expect(status).toBe(200);
    expect(body['versao']).toMatchObject({ versao: 3, estado: 'rascunho', blocos: 3 });
    expect(body['erros']).toEqual([]);

    const aberto = await builder(sessionEditor, id);
    expect(aberto.body['origem']).toBe('rascunho');
    expect(aberto.body['versao']['versao']).toBe(3);
    expect(falaDaPergunta(aberto.body)).toBe('primeira');
    // // The second one stays published: restoring doesn't publish.
    expect(aberto.body['publicada']).toMatchObject({ versao: 2, estado: 'publicada' });

    expect((await versionsInDatabase(id)).map((v) => [v.versao, v.estado])).toEqual([
      [1, 'arquivada'],
      [2, 'publicada'],
      [3, 'rascunho'],
    ]);

    // Restaurar de novo grava por cima do mesmo rascunho.
    const outra = await restore(sessionEditor, id, 2);
    expect(outra.body['versao']['versao']).toBe(3);
    expect(falaDaPergunta((await builder(sessionEditor, id)).body)).toBe('segunda');

    // // A version that doesn't exist (or isn't a number) is 404.
    expect((await restore(sessionEditor, id, 99)).status).toBe(404);
    expect((await restore(sessionEditor, id, 'ultima')).status).toBe(404);
    // // From another tenant, too.
    expect((await restore(sessionOfOtherTenant, id, 1)).status).toBe(404);
  });
});

describe('GET /v1/management/flows/:id/builder/versions/:version', () => {
  it('version drawing: returns the drawing of an old version, in the editor map format', async () => {
    const id = await criado(`Historico ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('primeira'));
    await publicar(sessionPublisher, id);
    await salvar(sessionEditor, id, desenho('segunda'));
    await publicar(sessionPublisher, id);

    const { status, body } = await versionDrawing(sessionEditor, id, 1);
    expect(status).toBe(200);
    expect(falaDoDesenho(body)).toBe('primeira');
    expect(typeof body['globals']).toBe('object');

    const segunda = await versionDrawing(sessionEditor, id, 2);
    expect(falaDoDesenho(segunda.body)).toBe('segunda');

    // // The published version stays untouched: the current draft (v2) never leaks into the v1 read.
    expect((await builder(sessionEditor, id)).body['versao']['versao']).toBe(2);
  });

  it('version drawing: 404 for a version that does not exist or is not a number', async () => {
    const id = await criado(`SemVersao ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('x'));

    expect((await versionDrawing(sessionEditor, id, 99)).status).toBe(404);
    expect((await versionDrawing(sessionEditor, id, 'ultima')).status).toBe(404);
    expect((await versionDrawing(sessionEditor, id, 0)).status).toBe(404);
  });

  it('version drawing: 403 without `automacao.fluxo.editar` and 404 for another tenant or invalid id', async () => {
    const id = await criado(`Protegido2 ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('x'));
    await publicar(sessionPublisher, id);

    const semPoder = await versionDrawing(sessionWithoutAuthority, id, 1);
    expect(semPoder.status).toBe(403);
    expect(semPoder.body['error']).toMatchObject({ code: 'without_permission' });

    expect((await versionDrawing(sessionOfOtherTenant, id, 1)).status).toBe(404);
    expect((await versionDrawing(sessionEditor, 'nao-e-uuid', 1)).status).toBe(404);
  });
});
