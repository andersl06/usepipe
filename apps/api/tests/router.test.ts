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
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { redirecionarInRouter } = await import('../src/domain/router.js');
const { closeConversation } = await import('../src/domain/conversation.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * O roteador (o `master` da Blip): os serviços dele pela tela
 * (`/v1/gestao/fluxos/:id/servicos`) e a conversa passando por ele.
 *
 * O que se prova é o que a origem decide: o formulário de Serviços
 * (`referencias-blip/pesquisa/blip-servicos-do-roteador.md`) e o Master-State, o Redirect e o
 * "Utilizar o contexto do Roteador" (`referencias-blip/pesquisa/blip-api-schemas.md` §5.3–5.5).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionWithoutPoder: string;
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
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
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

/** Um contato (fluxo ou roteador) direto no banco. */
async function newFlow(
  cenario: Cenario,
  tipo: 'fluxo' | 'roteador',
  extra: { state?: string; channelId?: string } = {},
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id)
    values (
      ${cenario.tenantId}, ${`${tipo} ${randomUUID().slice(0, 8)}`}, ${tipo},
      ${extra.estado ?? 'rascunho'}, ${extra.channelId ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/management/flows/${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

const codigo = (r: { body: Record<string, unknown> }) =>
  (r.corpo['erro'] as { code?: string } | undefined)?.codigo;

beforeAll(async () => {
  a = await montarCenario(`rt-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`rt-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  sessionEditor = await openSession(a, await pessoaCom(a, ['automacao.fluxo.editar']));
  sessionWithoutPoder = await openSession(a, await pessoaCom(a, []));
  sessionOfOtherTenant = await openSession(b, await pessoaCom(b, ['automacao.fluxo.editar']));
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

/* ------------------------------------------------------------ A tela */

describe('/v1/management/flows/:id/services', () => {
  it('cadastra o principal e os filhos, e o GET preenche `filhos`', async () => {
    const router = await newFlow(a, 'roteador');
    const principal = await newFlow(a, 'fluxo', { estado: 'publicado' });
    const suporte = await newFlow(a, 'fluxo');

    const empty = await chamar(sessionEditor, 'GET', `${router}/servicos`);
    expect(empty.status).toBe(200);
    expect(empty.corpo).toMatchObject({ principal: null, filhos: [] });
    expect((empty.corpo['roteador'] as { id: string }).id).toBe(router);
    const search = empty.corpo['busca'] as { id: string; type: string }[];
    expect(search.some((f) => f.id === suporte)).toBe(true);
    expect(search.every((f) => f.tipo === 'fluxo')).toBe(true);

    const p = await chamar(sessionEditor, 'POST', `${router}/servicos`, {
      name: 'Principal',
      chatbotId: principal,
      principal: true,
      // Principal esconde (e ignora) os dois campos.
      persistente: true,
      expiracaoMin: 10,
    });
    expect(p.status).toBe(201);
    expect(p.corpo).toMatchObject({
      nome: 'Principal',
      principal: true,
      persistente: false,
      expiracaoMin: null,
      chatbot: { id: principal, estado: 'publicado' },
    });

    const s = await chamar(sessionEditor, 'POST', `${router}/servicos`, {
      name: 'Suporte',
      chatbotId: suporte,
      principal: false,
      persistente: false,
      expiracaoMin: 30,
    });
    expect(s.status).toBe(201);
    expect(s.corpo).toMatchObject({ principal: false, persistente: false, expiracaoMin: 30 });

    const lido = await chamar(sessionEditor, 'GET', `${router}/servicos`);
    expect((lido.corpo['principal'] as { id: string }).id).toBe(p.corpo['id']);
    expect((lido.corpo['filhos'] as { id: string; name: string }[]).map((f) => f.nome)).toEqual([
      'Suporte',
    ]);

    const { rows } = await a.dono.execute<{ acao: string }>(sql`
      select acao from log_auditoria
       where objeto_tipo = 'roteador_servico' and objeto_id = ${s.corpo['id'] as string}::uuid
    `);
    expect(rows.map((r) => r.acao)).toEqual(['criou']);
  });

  it('Reject duplicate primary services, names, or chatbots and invalid expiration or chatbot types', async () => {
    const roteador = await newFlow(a, 'roteador');
    const f1 = await newFlow(a, 'fluxo');
    const f2 = await newFlow(a, 'fluxo');
    const f3 = await newFlow(a, 'fluxo');
    const otherRouter = await newFlow(a, 'roteador');
    const archived = await newFlow(a, 'fluxo', { estado: 'arquivado' });
    const doOutroTenant = await newFlow(b, 'fluxo');
    const post = (corpo: Record<string, unknown>) =>
      chamar(sessionEditor, 'POST', `${roteador}/servicos`, {
        principal: false,
        persistente: false,
        expiracaoMin: 5,
        ...corpo,
      });

    expect((await post({ nome: 'Um', chatbotId: f1, principal: true })).status).toBe(201);

    const segundo = await post({ nome: 'Dois', chatbotId: f2, principal: true });
    expect(segundo.status).toBe(409);
    expect(codigo(segundo)).toBe('servico_principal_em_uso');

    const mesmoNome = await post({ nome: 'Um', chatbotId: f2 });
    expect(mesmoNome.status).toBe(409);
    expect(codigo(mesmoNome)).toBe('servico_nome_em_uso');

    const mesmoChatbot = await post({ nome: 'Outro', chatbotId: f1 });
    expect(mesmoChatbot.status).toBe(409);
    expect(codigo(mesmoChatbot)).toBe('servico_chatbot_em_uso');

    const withoutExpiration = await post({ nome: 'Três', chatbotId: f3, expiracaoMin: null });
    expect(withoutExpiration.status).toBe(400);
    expect(codigo(withoutExpiration)).toBe('servico_expiracao');

    const semNome = await post({ nome: '   ', chatbotId: f3 });
    expect(codigo(semNome)).toBe('servico_nome');

    for (const chatbotId of [otherRouter, archived, doOutroTenant, roteador]) {
      const r = await post({ nome: `X ${randomUUID().slice(0, 4)}`, chatbotId });
      expect(r.status).toBe(400);
      expect(codigo(r)).toBe('servico_chatbot');
    }

    // Persistente ignora a expiração.
    const persistente = await post({ nome: 'Três', chatbotId: f3, persistente: true });
    expect(persistente.status).toBe(201);
    expect(persistente.corpo).toMatchObject({ persistente: true, expiracaoMin: null });

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from roteador_servico where roteador_id = ${roteador}::uuid`,
    );
    expect(rows[0]?.n).toBe('2');
  });

  it('Allow services only on router bots and edits only by flow editors', async () => {
    const flow = await newFlow(a, 'fluxo');
    const outro = await newFlow(a, 'fluxo');
    const notRouter = await chamar(sessionEditor, 'POST', `${flow}/servicos`, {
      name: 'S',
      chatbotId: outro,
      principal: true,
    });
    expect(notRouter.status).toBe(400);
    expect(codigo(notRouter)).toBe('nao_e_roteador');

    const roteador = await newFlow(a, 'roteador');
    const semPoder = await chamar(sessionWithoutPoder, 'POST', `${roteador}/servicos`, {
      name: 'S',
      chatbotId: outro,
      principal: true,
    });
    expect(semPoder.status).toBe(403);
  });

  it('Apply only supplied service changes through PATCH and remove services through DELETE', async () => {
    const roteador = await newFlow(a, 'roteador');
    const f1 = await newFlow(a, 'fluxo');
    const f2 = await newFlow(a, 'fluxo');
    const criado = await chamar(sessionEditor, 'POST', `${roteador}/servicos`, {
      name: 'Vendas',
      chatbotId: f1,
      principal: false,
      persistente: false,
      expiracaoMin: 15,
    });
    const id = criado.corpo['id'] as string;

    const mais = await chamar(sessionEditor, 'PATCH', `${roteador}/servicos/${id}`, {
      expiracaoMin: 45,
    });
    expect(mais.status).toBe(200);
    expect(mais.corpo).toMatchObject({ nome: 'Vendas', expiracaoMin: 45 });

    const persistente = await chamar(sessionEditor, 'PATCH', `${roteador}/servicos/${id}`, {
      persistente: true,
      chatbotId: f2,
    });
    expect(persistente.corpo).toMatchObject({
      persistente: true,
      expiracaoMin: null,
      chatbot: { id: f2 },
    });

    const invalido = await chamar(sessionEditor, 'PATCH', `${roteador}/servicos/${id}`, {
      persistente: false,
    });
    expect(invalido.status).toBe(400);
    expect(codigo(invalido)).toBe('servico_expiracao');

    const { rows: log } = await a.dono.execute<{ acao: string; depois: Record<string, unknown> }>(
      sql`
        select acao, depois from log_auditoria
         where objeto_tipo = 'roteador_servico' and objeto_id = ${id}::uuid
         order by em, id
      `,
    );
    expect(log.map((l) => l.acao)).toEqual(['criou', 'alterou', 'alterou']);
    expect(log[1]!.depois).toEqual({ expiracaoMin: 45 });

    const apagado = await chamar(sessionEditor, 'DELETE', `${roteador}/servicos/${id}`);
    expect(apagado.status).toBe(204);
    const depois = await chamar(sessionEditor, 'GET', `${roteador}/servicos`);
    expect(depois.corpo['filhos']).toEqual([]);
    expect((await chamar(sessionEditor, 'DELETE', `${roteador}/servicos/${id}`)).status).toBe(404);
  });

  it('Return 404 for another tenant\'s router on every service action', async () => {
    const roteador = await newFlow(a, 'roteador');
    const f1 = await newFlow(a, 'fluxo');
    const criado = await chamar(sessionEditor, 'POST', `${roteador}/servicos`, {
      name: 'Principal',
      chatbotId: f1,
      principal: true,
    });
    const id = criado.corpo['id'] as string;
    const deB = await newFlow(b, 'fluxo');

    expect((await chamar(sessionOfOtherTenant, 'GET', `${roteador}/servicos`)).status).toBe(404);
    expect(
      (
        await chamar(sessionOfOtherTenant, 'POST', `${roteador}/servicos`, {
          name: 'Intruso',
          chatbotId: deB,
          principal: false,
          persistente: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (await chamar(sessionOfOtherTenant, 'PATCH', `${roteador}/servicos/${id}`, { name: 'X' }))
        .status,
    ).toBe(404);
    expect((await chamar(sessionOfOtherTenant, 'DELETE', `${roteador}/servicos/${id}`)).status).toBe(
      404,
    );
    const { rows } = await a.dono.execute<{ name: string }>(
      sql`select nome from roteador_servico where id = ${id}::uuid`,
    );
    expect(rows[0]?.nome).toBe('Principal');
  });
});

/* ---------------------------------------------------------- A conversa */

const igual = (value: string) => [{ source: 'input', comparison: 'equals', values: [value] }];
const enviar = (texto: string) => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: texto },
});
const redirecionar = (service: string) => ({ type: 'Redirect', settings: { address: service } });

const SAIDAS_DO_MENU = [
  { order: 0, stateId: 'ir-suporte', conditions: igual('suporte') },
  { order: 1, stateId: 'ir-vendas', conditions: igual('vendas') },
  { order: 2, stateId: 'menu' },
];

/** O principal: guarda a primeira mensagem, mostra o menu e redireciona. */
const PRINCIPAL = {
  states: [
    { id: 'inicio', root: true, input: { variable: 'primeira' }, outputs: SAIDAS_DO_MENU },
    { id: 'menu', inputActions: [enviar('Principal: menu')], input: {}, outputs: SAIDAS_DO_MENU },
    {
      id: 'ir-suporte',
      inputActions: [enviar('Indo para o suporte'), redirecionar('Suporte')],
      input: {},
      outputs: [{ stateId: 'menu' }],
    },
    {
      id: 'ir-vendas',
      inputActions: [enviar('Indo para vendas'), redirecionar('Vendas')],
      input: {},
      outputs: [{ stateId: 'menu' }],
    },
  ],
};

/** Suporte: SEM o contexto do roteador, com expiração e atendimento humano. */
const SUPORTE = {
  states: [
    { id: 'inicio', root: true, input: {}, outputs: [{ stateId: 'pergunta' }] },
    {
      id: 'pergunta',
      inputActions: [enviar('Suporte: qual o problema? [{{primeira}}]')],
      input: { variable: 'problema' },
      outputs: [
        { order: 0, stateId: 'desk:suporte', conditions: igual('humano') },
        { order: 1, stateId: 'resposta' },
      ],
    },
    {
      id: 'resposta',
      inputActions: [enviar('Suporte: anotado {{problema}}')],
      input: {},
      outputs: [
        { order: 0, stateId: 'volta', conditions: igual('voltar') },
        { order: 1, stateId: 'pergunta' },
      ],
    },
    {
      id: 'volta',
      inputActions: [enviar('Suporte: voltando'), redirecionar('Principal')],
      input: {},
      outputs: [{ stateId: 'pergunta' }],
    },
    {
      id: 'desk:suporte',
      inputActions: [{ type: 'ForwardToDesk', settings: {} }],
      input: {
        conditions: [
          { source: 'context', variable: 'desk_forwardToDeskState_status', values: ['Success'] },
        ],
      },
      outputs: [
        {
          order: 0,
          stateId: 'pos',
          conditions: [
            {
              source: 'context',
              variable: 'input.type',
              values: ['application/vnd.iris.ticket+json'],
            },
          ],
        },
        { order: 1, stateId: 'inicio' },
      ],
    },
    {
      id: 'pos',
      inputActions: [enviar('Suporte: atendimento encerrado')],
      input: {},
      outputs: [{ stateId: 'pergunta' }],
    },
  ],
};

/** Vendas: persistente, COM o contexto do roteador. */
const VENDAS = {
  states: [
    { id: 'inicio', root: true, input: {}, outputs: [{ stateId: 'ola' }] },
    {
      id: 'ola',
      inputActions: [enviar('Vendas: [{{primeira}}]')],
      input: {},
      outputs: [{ stateId: 'ola' }],
    },
  ],
};

describe('Route conversations through services', () => {
  let routerId: string;
  let principalId: string;
  let suporteId: string;
  let vendasId: string;

  async function publishService(nome: string, json: unknown): Promise<string> {
    const r = await noTenant(a.tenantId, (tx) =>
      importFlowOfBlip(tx, { tenantId: a.tenantId, nome, channelId: null, json, publicar: true }),
    );
    expect(r.errorOfValidation).toBeNull();
    return r.fluxoId;
  }

  beforeAll(async () => {
    principalId = await publishService('Serviço principal', PRINCIPAL);
    suporteId = await publishService('Serviço suporte', SUPORTE);
    vendasId = await publishService('Serviço vendas', VENDAS);
    await a.dono.execute(sql`
      update fluxo set usa_contexto_do_roteador = true
       where id in (${principalId}::uuid, ${vendasId}::uuid)
    `);
    routerId = await newFlow(a, 'roteador', { estado: 'publicado', channelId: a.channelId });
    await a.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min)
      values
        (${a.tenantId}, ${routerId}, ${principalId}, 'Principal', true, false, null),
        (${a.tenantId}, ${routerId}, ${suporteId}, 'Suporte', false, false, 30),
        (${a.tenantId}, ${routerId}, ${vendasId}, 'Vendas', false, true, null)
    `);
  }, 60_000);

  async function falar(de: string, texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadOfMessage(de, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);
  }

  type Conversation = { id: string; queueId: string | null; agentId: string | null };

  async function conversationOpen(telefone: string): Promise<Conversation> {
    const { rows } = await a.dono.execute<Conversation>(sql`
      select c.id, c.fila_id, c.atendente_id
        from conversa c join contato ct on ct.id = c.contato_id
       where c.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
         and c.estado <> 'encerrada'
       order by c.criada_em desc limit 1
    `);
    expect(rows[0]).toBeDefined();
    return rows[0]!;
  }

  /** A última resposta do bot ao contato, em qualquer conversa. */
  async function ultimaDoBot(telefone: string): Promise<string | undefined> {
    const { rows } = await a.dono.execute<{ content: string }>(sql`
      select m.conteudo from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where ct.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
         and m.autor_tipo = 'bot'
       order by m.criada_em desc limit 1
    `);
    return rows[0]?.conteudo;
  }

  type Position = {
    serviceId: string;
    expira_em: Date | null;
    context: Record<string, string>;
    contactId: string;
  };

  async function position(telefone: string): Promise<Position> {
    const { rows } = await a.dono.execute<Position>(sql`
      select p.servico_id, p.expira_em, p.contexto, p.contato_id
        from posicao_no_roteador p join contato ct on ct.id = p.contato_id
       where p.roteador_id = ${routerId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
    `);
    expect(rows[0]).toBeDefined();
    return rows[0]!;
  }

  it('Start a router conversation in the nonexpiring primary service', async () => {
    const ANA = '5511922220001';
    await falar(ANA, 'oi');
    expect(await ultimaDoBot(ANA)).toBe('Principal: menu');
    const p = await position(ANA);
    expect(p.serviceId).toBe(principalId);
    expect(p.expira_em).toBeNull();
    expect((await conversationOpen(ANA)).queueId).toBeNull();
  });

  it('Route the next message to a redirected service while preserving the prior block', async () => {
    const BIA = '5511922220002';
    await falar(BIA, 'oi');
    await falar(BIA, 'suporte');
    expect(await ultimaDoBot(BIA)).toBe('Indo para o suporte');
    const p = await position(BIA);
    expect(p.serviceId).toBe(suporteId);
    const minutos = (new Date(p.expira_em!).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(25);
    expect(minutos).toBeLessThanOrEqual(31);

    // O serviço começa na raiz, e sem o contexto do roteador não vê `primeira`.
    await falar(BIA, 'meu pc');
    expect(await ultimaDoBot(BIA)).toBe('Suporte: qual o problema? []');

    // Retomada: a próxima continua em `pergunta`, no suporte.
    await falar(BIA, 'tela azul');
    expect(await ultimaDoBot(BIA)).toBe('Suporte: anotado tela azul');

    // A mesma conversa: a execução do principal terminou, a do suporte é a viva.
    const conversation = await conversationOpen(BIA);
    const { rows } = await a.dono.execute<{ flowId: string; state: string }>(sql`
      select v.fluxo_id, e.estado from execucao_fluxo e
        join fluxo_versao v on v.id = e.fluxo_versao_id
       where e.conversa_id = ${conversation.id}::uuid order by e.iniciada_em
    `);
    expect(rows.map((r) => [r.flowId, r.state])).toEqual([
      [principalId, 'concluida'],
      [suporteId, 'aguardando'],
    ]);
  });

  it('Return to the primary service after a redirect expires', async () => {
    const CAIO = '5511922220003';
    await falar(CAIO, 'oi');
    await falar(CAIO, 'suporte');
    await falar(CAIO, 'meu pc');
    expect(await ultimaDoBot(CAIO)).toBe('Suporte: qual o problema? []');

    const { contactId } = await position(CAIO);
    await a.dono.execute(sql`
      update posicao_no_roteador set expira_em = now() - interval '1 minute'
       where roteador_id = ${routerId}::uuid and contato_id = ${contactId}::uuid
    `);
    await falar(CAIO, 'oi de novo');
    // O principal segue do bloco em que tinha ficado (`ir-suporte`), que leva ao menu.
    expect(await ultimaDoBot(CAIO)).toBe('Principal: menu');
    const p = await position(CAIO);
    expect(p.serviceId).toBe(principalId);
    expect(p.expira_em).toBeNull();
  });

  it('Keep persistent services active and share router context only when enabled', async () => {
    const DAVI = '5511922220004';
    await falar(DAVI, 'primeira coisa');
    await falar(DAVI, 'vendas');
    const p = await position(DAVI);
    expect(p.serviceId).toBe(vendasId);
    expect(p.expira_em).toBeNull();
    // O principal liga o contexto do roteador: o que ele guardou está no par.
    expect(p.context['primeira']).toBe('primeira coisa');

    await a.dono.execute(sql`
      update posicao_no_roteador set desde = now() - interval '30 days'
       where roteador_id = ${routerId}::uuid and contato_id = ${p.contactId}::uuid
    `);
    await falar(DAVI, 'quero comprar');
    expect(await ultimaDoBot(DAVI)).toBe('Vendas: [primeira coisa]');
    await falar(DAVI, 'e agora?');
    expect(await ultimaDoBot(DAVI)).toBe('Vendas: [primeira coisa]');
    expect((await position(DAVI)).serviceId).toBe(vendasId);
  });

  it('Evaluate exits without displaying the explicit block after Master-State', async () => {
    const EVA = '5511922220005';
    await falar(EVA, 'oi');
    const { contactId } = await position(EVA);
    await noTenant(a.tenantId, (tx) =>
      redirecionarInRouter(tx, {
        tenantId: a.tenantId,
        routerId,
        contactId: contactId,
        service: 'Suporte',
        blockInicial: 'resposta',
      }),
    );
    // Na raiz, "voltar" iria para `pergunta`; em `resposta`, vai para `volta`.
    await falar(EVA, 'voltar');
    expect(await ultimaDoBot(EVA)).toBe('Suporte: voltando');
    const { rows } = await a.dono.execute<{ content: string }>(sql`
      select m.conteudo from mensagem m join conversa c on c.id = m.conversa_id
       where c.contato_id = ${contactId}::uuid and m.autor_tipo = 'bot'
    `);
    expect(rows.map((r) => r.conteudo)).not.toContain('Suporte: anotado ');
    // O `volta` redirecionou para o principal pelo nome do serviço.
    expect((await position(EVA)).serviceId).toBe(principalId);
  });

  it('Return from a human ticket to the previous service, not the primary one', async () => {
    const FABIO = '5511922220006';
    await falar(FABIO, 'oi');
    await falar(FABIO, 'suporte');
    await falar(FABIO, 'meu pc');
    await falar(FABIO, 'humano');
    const conversa = await conversationOpen(FABIO);
    expect(conversa.queueId).toBe(a.queueId);
    expect(conversa.agentId).toBe(a.agentId);

    // O cliente fala com o atendente: é interação, e renova o prazo do serviço.
    await falar(FABIO, 'alô?');
    expect((await position(FABIO)).serviceId).toBe(suporteId);

    const { rows: etiquetas } = await a.dono.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome)
      values (${a.tenantId}::uuid, ${`Resolvido ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    await closeConversation(
      { tenantId: a.tenantId, agentId: a.agentId, exigirAssignment: true },
      { conversaId: conversa.id, etiquetaId: etiquetas[0]!.id },
    );

    await falar(FABIO, 'voltei');
    const nova = await conversationOpen(FABIO);
    expect(nova.id).not.toBe(conversa.id);
    expect(nova.queueId).toBeNull();
    expect(await ultimaDoBot(FABIO)).toBe('Suporte: atendimento encerrado');
    expect((await position(FABIO)).serviceId).toBe(suporteId);
  });
});
