import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { ID_DA_RAIZ_PADRAO, ID_OF_ATTENDANCE_DEFAULTID_DO_ATENDIMENTO_PADRAOID_OF_ATTENDANCE_DEFAULT } = await import('@pipe/core');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { flowPublishedOfChannel } = await import('../src/dominio/fluxo.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * O ciclo EDITAR → SALVAR RASCUNHO → PUBLICAR do Builder, POR FLUXO
 * (`/v1/gestao/fluxos/:id/builder`, `dominio/gestao/builder-do-fluxo.ts`).
 *
 * O que vale a pena provar: fluxo novo abre com o fluxo padrão publicável; o
 * salvar grava POR CIMA do rascunho (uma versão, não uma por tecla) e devolve
 * os erros do motor bloco a bloco mesmo gravando; publicar numera a seguir,
 * arquiva a anterior e recusa fluxo inválido com a lista; o motor
 * (`fluxoPublicadoDoCanal`/`rodarFluxoNaEntrada`, pelo webhook) passa a usar a
 * nova enquanto a conversa que já estava com o robô continua apontando para a
 * antiga — que não foi apagada nem alterada; restaurar traz uma versão antiga
 * como rascunho sem tirar a publicada do ar; e as portas: 403 sem
 * `automacao.fluxo.publicar`, 404 de outro tenant, 409 no roteador.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem cria e edita, mas não publica. */
let sessionEditor: string;
/** Quem também publica. */
let sessionPublicador: string;
/** Gente do tenant A sem permissão nenhuma sobre fluxo. */
let sessionWithoutPoder: string;
/** Quem tudo pode no tenant B: prova que o tenant vem da sessão, nunca da URL. */
let sessionOfOtherTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  semPermissao: 'recado: sem permissão',
};

const ANA = '5511922220001';
const BIA = '5511922220002';

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
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiresAt}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

/* O corpo cru das respostas: `any` como em `cadastros-atendimento.test.ts`, para
   navegar `corpo.erro.detalhe.erros` sem um tipo por rota. */
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
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Corpo) : {} };
}

/** Cria o contato pela rota de criar e devolve o id. */
async function criado(nome: string, tipo: 'fluxo' | 'roteador' = 'fluxo'): Promise<string> {
  const { status, corpo } = await pedir(sessionEditor, 'POST', '/v1/management/flows', {
    recados: RECADOS,
    nome,
    tipo,
  });
  expect(status).toBe(200);
  expect(corpo['erro']).toBeUndefined();
  return corpo['id'] as string;
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

/**
 * Um desenho no formato do editor da Blip, como a cópia manda: a raiz espera a
 * primeira mensagem, o bloco seguinte pergunta o nome e espera, e o de
 * atendimento transborda. `texto` muda entre versões para o teste ver qual
 * versão o motor rodou.
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

/** O texto que o bloco `pergunta` manda, lido do desenho que a `api` devolve. */
function falaDaPergunta(corpo: Corpo): string {
  const pergunta = corpo['desenho']['fluxo']['pergunta'];
  return pergunta['$contentActions'][0]['action']['settings']['content'] as string;
}

type LinhaVersao = { id: string; version: number; state: string; blocks: number };

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
    select c.id, c.contato_id from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversationId: string): Promise<string[]> {
  const { rows } = await a.dono.execute<{ content: string }>(sql`
    select conteudo from mensagem
     where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}

type LineExecution = { state: string; flowVersionId: string; blockVersionId: string | null };

async function executionOf(conversaId: string): Promise<LineExecution> {
  const { rows } = await a.dono.execute<LineExecution>(sql`
    select e.estado, e.fluxo_versao_id, b.versao_id as bloco_versao_id
      from execucao_fluxo e left join bloco b on b.id = e.bloco_atual_id
     where e.conversa_id = ${conversaId}::uuid
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
  sessionPublicador = await openSession(a, publicador);
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, doB);

  // Sem ninguém online: a conversa transferida fica NA FILA, sem atendente.
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
    const { status, corpo } = await builder(sessionEditor, id);
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ fluxoId: id, origem: 'padrao', versao: null, publicada: null });
    expect(corpo['erros']).toEqual([]);
    expect(Object.keys(corpo['desenho']['fluxo']).sort()).toEqual(
      [ID_DA_RAIZ_PADRAO, ID_OF_ATTENDANCE_DEFAULTID_DO_ATENDIMENTO_PADRAOID_OF_ATTENDANCE_DEFAULT].sort(),
    );
    expect(corpo['desenho']['globais']).toMatchObject({ id: 'global-actions' });
    expect(await versionsInDatabase(id)).toHaveLength(0);
  });

  it('Return 409 on every Builder route for router bots', async () => {
    const id = await criado(`Roteador ${randomUUID().slice(0, 6)}`, 'roteador');
    const respostas = [
      await builder(sessionPublicador, id),
      await salvar(sessionPublicador, id, desenho('x')),
      await publicar(sessionPublicador, id),
      await versions(sessionPublicador, id),
      await restore(sessionPublicador, id, 1),
    ];
    for (const { status, corpo } of respostas) {
      expect(status).toBe(409);
      expect(corpo['erro']['code']).toBe('roteador_sem_builder');
      expect(corpo['erro']['message']).toContain('Roteador não tem Builder');
    }
  });

  it('Return 403 without `automacao.fluxo.editar` and 404 for invalid or cross-tenant IDs', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);

    const semPoder = await builder(sessionWithoutPoder, id);
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo['erro']).toMatchObject({
      codigo: 'sem_permissao',
      detalhe: { permissao: 'automacao.fluxo.editar' },
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
  it('Save draft v1 in place on repeated edits instead of creating a version per keystroke', async () => {
    const id = await criado(`Rascunho ${randomUUID().slice(0, 6)}`);

    const first = await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome?'));
    expect(first.status).toBe(200);
    expect(first.corpo['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(first.corpo['erros']).toEqual([]);
    expect(first.corpo['naoSuportado']).toEqual({});

    const aberto = await builder(sessionEditor, id);
    expect(aberto.corpo).toMatchObject({ origem: 'rascunho', publicada: null });
    expect(aberto.corpo['versao']['version']).toBe(1);
    expect(falaDaPergunta(aberto.corpo)).toBe('Olá! Qual é o seu nome?');

    const segunda = await salvar(sessionEditor, id, desenho('Oi! Como você se chama?'));
    expect(segunda.status).toBe(200);
    expect(segunda.corpo['versao']['id']).toBe(first.corpo['versao']['id']);
    expect(segunda.corpo['versao']['version']).toBe(1);

    const inDatabase = await versionsInDatabase(id);
    expect(inDatabase).toHaveLength(1);
    expect(inDatabase[0]).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(falaDaPergunta((await builder(sessionEditor, id)).corpo)).toBe('Oi! Como você se chama?');

    // O fluxo em si continua em rascunho: salvar não publica.
    const { rows } = await a.dono.execute<{ state: string }>(
      sql`select estado from fluxo where id = ${id}::uuid`,
    );
    expect(rows[0]?.estado).toBe('rascunho');
  });

  it('Save an invalid design while returning engine errors per block', async () => {
    const id = await criado(`Invalido ${randomUUID().slice(0, 6)}`);
    const quebrado = {
      fluxo: {
        inicio: {
          id: 'inicio',
          root: true,
          $title: 'Início',
          // Sem entrada na raiz, e a saída aponta para um bloco que não existe.
          $contentActions: [],
          $conditionOutputs: [],
          $defaultOutput: { stateId: 'fantasma' },
        },
      },
      globais: {},
    };

    const { status, corpo } = await salvar(sessionEditor, id, quebrado);
    expect(status).toBe(200);
    expect(corpo['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 1 });
    const errors = corpo['erros'] as { block: string | null; message: string }[];
    expect(errors).toEqual(
      expect.arrayContaining([
        { bloco: 'inicio', mensagem: "O estado de destino 'fantasma' da saída não existe." },
        { bloco: 'inicio', mensagem: 'O estado raiz precisa esperar uma entrada.' },
      ]),
    );
    expect(errors.every((e) => e.block === 'inicio')).toBe(true);

    // A leitura devolve os mesmos erros — a tela abre já sabendo o que falta.
    const aberto = await builder(sessionEditor, id);
    expect(aberto.corpo['origem']).toBe('rascunho');
    expect(aberto.corpo['erros']).toEqual(errors);

    // E publicar recusa com a lista, sem mexer em nada.
    const recusa = await publicar(sessionPublicador, id);
    expect(recusa.status).toBe(409);
    expect(recusa.corpo['erro']['code']).toBe('fluxo_invalido');
    expect(recusa.corpo['erro']['detalhe']['errors']).toEqual(errors);
    expect((await versionsInDatabase(id))[0]?.state).toBe('rascunho');

    // Corpo que não é o mapa do editor é 400, e não 500.
    const torto = await salvar(sessionEditor, id, { fluxo: 'isto não é um mapa' });
    expect(torto.status).toBe(400);
    expect(torto.corpo['erro']['code']).toBe('desenho_invalido');
  });

  it('Do not save a draft without `automacao.fluxo.editar`', async () => {
    const id = await criado(`Trancado ${randomUUID().slice(0, 6)}`);
    const { status, corpo } = await salvar(sessionWithoutPoder, id, desenho('x'));
    expect(status).toBe(403);
    expect(corpo['erro']['code']).toBe('sem_permissao');
    expect(await versionsInDatabase(id)).toHaveLength(0);
  });
});

describe('POST /v1/management/flows/:id/builder/publish', () => {
  it('Publish v2, archive v1, switch the engine, and keep active conversations on v1', async () => {
    const id = await criado(`Publicado ${randomUUID().slice(0, 6)}`);
    // O canal do cenário passa a ser deste fluxo: é por ele que o webhook chega ao motor.
    await a.dono.execute(sql`update fluxo set canal_id = ${a.channelId}::uuid where id = ${id}::uuid`);

    // Sem rascunho não há o que publicar.
    const semRascunho = await publicar(sessionPublicador, id);
    expect(semRascunho.status).toBe(409);
    expect(semRascunho.corpo['erro']['code']).toBe('sem_rascunho');

    await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome? (v1)'));
    const v1 = await publicar(sessionPublicador, id);
    expect(v1.status).toBe(200);
    expect(v1.corpo['versao']).toMatchObject({ versao: 1, estado: 'publicada', blocos: 3 });
    expect(v1.corpo['versao']['publishedAt']).toEqual(expect.any(String));
    expect(v1.corpo['versao']['publishedBy']).toMatch(/^Pessoa /);
    expect(v1.corpo['arquivada']).toBeNull();
    const v1Id = v1.corpo['versao']['id'] as string;

    const { rows: flows } = await a.dono.execute<{ state: string }>(
      sql`select estado from fluxo where id = ${id}::uuid`,
    );
    expect(flows[0]?.estado).toBe('publicado');

    // Sem rascunho, o Builder abre a publicada.
    const aberto = await builder(sessionEditor, id);
    expect(aberto.corpo['origem']).toBe('publicada');
    expect(aberto.corpo['versao']['version']).toBe(1);
    expect(aberto.corpo['publicada']['version']).toBe(1);

    // O motor responde com a v1, e a conversa da Ana fica esperando o nome — em andamento.
    await falar(ANA, 'oi');
    const conversationOfAna = await conversationOf(ANA);
    expect(await doBot(conversationOfAna.id)).toEqual(['Olá! Qual é o seu nome? (v1)']);
    const inProgress = await executionOf(conversationOfAna.id);
    expect(inProgress).toMatchObject({ estado: 'aguardando', fluxo_versao_id: v1Id });

    // Salvar de novo cria o rascunho v2 (a v1 publicada é imutável) e publicar promove.
    const rascunho = await salvar(sessionEditor, id, desenho('Olá! Qual é o seu nome? (v2)'));
    expect(rascunho.corpo['versao']).toMatchObject({ versao: 2, estado: 'rascunho' });
    expect(rascunho.corpo['versao']['id']).not.toBe(v1Id);

    const v2 = await publicar(sessionPublicador, id);
    expect(v2.status).toBe(200);
    expect(v2.corpo['versao']).toMatchObject({ versao: 2, estado: 'publicada' });
    expect(v2.corpo['arquivada']).toMatchObject({ id: v1Id, versao: 1, estado: 'arquivada' });
    const v2Id = v2.corpo['versao']['id'] as string;

    const noBanco = await versionsInDatabase(id);
    expect(noBanco.map((v) => [v.versao, v.state, v.blocos])).toEqual([
      [1, 'arquivada', 3],
      [2, 'publicada', 3],
    ]);

    // A execução da Ana continua na v1 — a versão e os blocos dela ficaram intactos.
    const aindaNaV1 = await executionOf(conversationOfAna.id);
    expect(aindaNaV1.flowVersionId).toBe(v1Id);
    expect(aindaNaV1.blockVersionId).toBe(v1Id);

    // Conversa nova é da v2: pelo motor de verdade, e pela consulta que o motor usa.
    await falar(BIA, 'oi');
    const conversationOfBia = await conversationOf(BIA);
    expect(await doBot(conversationOfBia.id)).toEqual(['Olá! Qual é o seu nome? (v2)']);
    expect((await executionOf(conversationOfBia.id)).flowVersionId).toBe(v2Id);
    const publicado = await noTenant(a.tenantId, (tx) =>
      flowPublishedOfChannel(tx, a.channelId, conversationOfBia.contactId),
    );
    expect(publicado).toEqual({ fluxoId: id, versaoId: v2Id });

    // O histórico lista as duas, da mais nova para a mais antiga.
    const history = await versions(sessionEditor, id);
    expect(history.status).toBe(200);
    const listadas = history.corpo as unknown as { version: number; state: string }[];
    expect(listadas.map((v) => [v.versao, v.estado])).toEqual([
      [2, 'publicada'],
      [1, 'arquivada'],
    ]);

    // E ficou registrado quem publicou o quê.
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
    expect(editor.corpo['erro']).toMatchObject({
      codigo: 'sem_permissao',
      detalhe: { permissao: 'automacao.fluxo.publicar' },
    });

    expect((await publicar(sessionOfOtherTenant, id)).status).toBe(404);

    const noBanco = await versionsInDatabase(id);
    expect(noBanco).toHaveLength(1);
    expect(noBanco[0]?.state).toBe('rascunho');
  });
});

describe('POST /v1/management/flows/:id/builder/versions/:versao/restore', () => {
  it('traz uma versão antiga de volta como rascunho, sem tirar a publicada do ar', async () => {
    const id = await criado(`Restaurado ${randomUUID().slice(0, 6)}`);
    await salvar(sessionEditor, id, desenho('primeira'));
    await publicar(sessionPublicador, id);
    await salvar(sessionEditor, id, desenho('segunda'));
    await publicar(sessionPublicador, id);

    const { status, corpo } = await restore(sessionEditor, id, 1);
    expect(status).toBe(200);
    expect(corpo['versao']).toMatchObject({ versao: 3, estado: 'rascunho', blocos: 3 });
    expect(corpo['erros']).toEqual([]);

    const aberto = await builder(sessionEditor, id);
    expect(aberto.corpo['origem']).toBe('rascunho');
    expect(aberto.corpo['versao']['version']).toBe(3);
    expect(falaDaPergunta(aberto.corpo)).toBe('primeira');
    // A segunda continua publicada: restaurar não publica.
    expect(aberto.corpo['publicada']).toMatchObject({ versao: 2, estado: 'publicada' });

    expect((await versionsInDatabase(id)).map((v) => [v.versao, v.state])).toEqual([
      [1, 'arquivada'],
      [2, 'publicada'],
      [3, 'rascunho'],
    ]);

    // Restaurar de novo grava por cima do mesmo rascunho.
    const outra = await restore(sessionEditor, id, 2);
    expect(outra.corpo['versao']['version']).toBe(3);
    expect(falaDaPergunta((await builder(sessionEditor, id)).corpo)).toBe('segunda');

    // Versão que não existe (ou que não é número) é 404.
    expect((await restore(sessionEditor, id, 99)).status).toBe(404);
    expect((await restore(sessionEditor, id, 'ultima')).status).toBe(404);
    // De outro tenant também.
    expect((await restore(sessionOfOtherTenant, id, 1)).status).toBe(404);
  });
});
