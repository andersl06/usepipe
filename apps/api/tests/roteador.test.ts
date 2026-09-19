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

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { importarFluxoDaBlip } = await import('../src/dominio/fluxo.js');
const { redirecionarNoRoteador } = await import('../src/dominio/roteador.js');
const { encerrarConversa } = await import('../src/dominio/conversa.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * O roteador (o `master` da Blip): os serviços dele pela tela
 * (`/v1/gestao/fluxos/:id/servicos`) e a conversa passando por ele.
 *
 * O que se prova é o que a origem decide: o formulário de Serviços
 * (`docs/pesquisa/blip-servicos-do-roteador.md`) e o Master-State, o Redirect e o
 * "Utilizar o contexto do Roteador" (`docs/pesquisa/blip-api-schemas.md` §5.3–5.5).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessaoEditor: string;
let sessaoSemPoder: string;
let sessaoDoOutroTenant: string;

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return usuarioId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papeis[0]!.id})
  `);
  return usuarioId;
}

async function abrirSessao(cenario: Cenario, usuarioId: string): Promise<string> {
  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${usuarioId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

/** Um contato (fluxo ou roteador) direto no banco. */
async function novoFluxo(
  cenario: Cenario,
  tipo: 'fluxo' | 'roteador',
  extra: { estado?: string; canalId?: string } = {},
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado, canal_id)
    values (
      ${cenario.tenantId}, ${`${tipo} ${randomUUID().slice(0, 8)}`}, ${tipo},
      ${extra.estado ?? 'rascunho'}, ${extra.canalId ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  sessao: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/gestao/fluxos/${caminho}`, {
    method: metodo,
    headers: comCookie(sessao),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

const codigo = (r: { corpo: Record<string, unknown> }) =>
  (r.corpo['erro'] as { codigo?: string } | undefined)?.codigo;

beforeAll(async () => {
  a = await montarCenario(`rt-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`rt-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, await pessoaCom(a, ['automacao.fluxo.editar']));
  sessaoSemPoder = await abrirSessao(a, await pessoaCom(a, []));
  sessaoDoOutroTenant = await abrirSessao(b, await pessoaCom(b, ['automacao.fluxo.editar']));
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

/* ------------------------------------------------------------ A tela */

describe('/v1/gestao/fluxos/:id/servicos', () => {
  it('cadastra o principal e os filhos, e o GET preenche `filhos`', async () => {
    const roteador = await novoFluxo(a, 'roteador');
    const principal = await novoFluxo(a, 'fluxo', { estado: 'publicado' });
    const suporte = await novoFluxo(a, 'fluxo');

    const vazio = await chamar(sessaoEditor, 'GET', `${roteador}/servicos`);
    expect(vazio.status).toBe(200);
    expect(vazio.corpo).toMatchObject({ principal: null, filhos: [] });
    expect((vazio.corpo['roteador'] as { id: string }).id).toBe(roteador);
    const busca = vazio.corpo['busca'] as { id: string; tipo: string }[];
    expect(busca.some((f) => f.id === suporte)).toBe(true);
    expect(busca.every((f) => f.tipo === 'fluxo')).toBe(true);

    const p = await chamar(sessaoEditor, 'POST', `${roteador}/servicos`, {
      nome: 'Principal',
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

    const s = await chamar(sessaoEditor, 'POST', `${roteador}/servicos`, {
      nome: 'Suporte',
      chatbotId: suporte,
      principal: false,
      persistente: false,
      expiracaoMin: 30,
    });
    expect(s.status).toBe(201);
    expect(s.corpo).toMatchObject({ principal: false, persistente: false, expiracaoMin: 30 });

    const lido = await chamar(sessaoEditor, 'GET', `${roteador}/servicos`);
    expect((lido.corpo['principal'] as { id: string }).id).toBe(p.corpo['id']);
    expect((lido.corpo['filhos'] as { id: string; nome: string }[]).map((f) => f.nome)).toEqual([
      'Suporte',
    ]);

    const { rows } = await a.dono.execute<{ acao: string }>(sql`
      select acao from log_auditoria
       where objeto_tipo = 'roteador_servico' and objeto_id = ${s.corpo['id'] as string}::uuid
    `);
    expect(rows.map((r) => r.acao)).toEqual(['criou']);
  });

  it('recusa o que o formulário recusa: segundo principal, nome e chatbot repetidos, sem expiração, chatbot que não é fluxo', async () => {
    const roteador = await novoFluxo(a, 'roteador');
    const f1 = await novoFluxo(a, 'fluxo');
    const f2 = await novoFluxo(a, 'fluxo');
    const f3 = await novoFluxo(a, 'fluxo');
    const outroRoteador = await novoFluxo(a, 'roteador');
    const arquivado = await novoFluxo(a, 'fluxo', { estado: 'arquivado' });
    const doOutroTenant = await novoFluxo(b, 'fluxo');
    const post = (corpo: Record<string, unknown>) =>
      chamar(sessaoEditor, 'POST', `${roteador}/servicos`, {
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

    const semExpiracao = await post({ nome: 'Três', chatbotId: f3, expiracaoMin: null });
    expect(semExpiracao.status).toBe(400);
    expect(codigo(semExpiracao)).toBe('servico_expiracao');

    const semNome = await post({ nome: '   ', chatbotId: f3 });
    expect(codigo(semNome)).toBe('servico_nome');

    for (const chatbotId of [outroRoteador, arquivado, doOutroTenant, roteador]) {
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

  it('só roteador tem serviços, e só quem edita fluxo mexe neles', async () => {
    const fluxo = await novoFluxo(a, 'fluxo');
    const outro = await novoFluxo(a, 'fluxo');
    const naoRoteador = await chamar(sessaoEditor, 'POST', `${fluxo}/servicos`, {
      nome: 'S',
      chatbotId: outro,
      principal: true,
    });
    expect(naoRoteador.status).toBe(400);
    expect(codigo(naoRoteador)).toBe('nao_e_roteador');

    const roteador = await novoFluxo(a, 'roteador');
    const semPoder = await chamar(sessaoSemPoder, 'POST', `${roteador}/servicos`, {
      nome: 'S',
      chatbotId: outro,
      principal: true,
    });
    expect(semPoder.status).toBe(403);
  });

  it('PATCH muda só o que veio e passa pelas mesmas regras; DELETE tira o serviço', async () => {
    const roteador = await novoFluxo(a, 'roteador');
    const f1 = await novoFluxo(a, 'fluxo');
    const f2 = await novoFluxo(a, 'fluxo');
    const criado = await chamar(sessaoEditor, 'POST', `${roteador}/servicos`, {
      nome: 'Vendas',
      chatbotId: f1,
      principal: false,
      persistente: false,
      expiracaoMin: 15,
    });
    const id = criado.corpo['id'] as string;

    const mais = await chamar(sessaoEditor, 'PATCH', `${roteador}/servicos/${id}`, {
      expiracaoMin: 45,
    });
    expect(mais.status).toBe(200);
    expect(mais.corpo).toMatchObject({ nome: 'Vendas', expiracaoMin: 45 });

    const persistente = await chamar(sessaoEditor, 'PATCH', `${roteador}/servicos/${id}`, {
      persistente: true,
      chatbotId: f2,
    });
    expect(persistente.corpo).toMatchObject({
      persistente: true,
      expiracaoMin: null,
      chatbot: { id: f2 },
    });

    const invalido = await chamar(sessaoEditor, 'PATCH', `${roteador}/servicos/${id}`, {
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

    const apagado = await chamar(sessaoEditor, 'DELETE', `${roteador}/servicos/${id}`);
    expect(apagado.status).toBe(204);
    const depois = await chamar(sessaoEditor, 'GET', `${roteador}/servicos`);
    expect(depois.corpo['filhos']).toEqual([]);
    expect((await chamar(sessaoEditor, 'DELETE', `${roteador}/servicos/${id}`)).status).toBe(404);
  });

  it('o tenant vem da sessão: o roteador de outra conta é 404 em todos os gestos', async () => {
    const roteador = await novoFluxo(a, 'roteador');
    const f1 = await novoFluxo(a, 'fluxo');
    const criado = await chamar(sessaoEditor, 'POST', `${roteador}/servicos`, {
      nome: 'Principal',
      chatbotId: f1,
      principal: true,
    });
    const id = criado.corpo['id'] as string;
    const deB = await novoFluxo(b, 'fluxo');

    expect((await chamar(sessaoDoOutroTenant, 'GET', `${roteador}/servicos`)).status).toBe(404);
    expect(
      (
        await chamar(sessaoDoOutroTenant, 'POST', `${roteador}/servicos`, {
          nome: 'Intruso',
          chatbotId: deB,
          principal: false,
          persistente: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (await chamar(sessaoDoOutroTenant, 'PATCH', `${roteador}/servicos/${id}`, { nome: 'X' }))
        .status,
    ).toBe(404);
    expect((await chamar(sessaoDoOutroTenant, 'DELETE', `${roteador}/servicos/${id}`)).status).toBe(
      404,
    );
    const { rows } = await a.dono.execute<{ nome: string }>(
      sql`select nome from roteador_servico where id = ${id}::uuid`,
    );
    expect(rows[0]?.nome).toBe('Principal');
  });
});

/* ---------------------------------------------------------- A conversa */

const igual = (valor: string) => [{ source: 'input', comparison: 'equals', values: [valor] }];
const enviar = (texto: string) => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: texto },
});
const redirecionar = (servico: string) => ({ type: 'Redirect', settings: { address: servico } });

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

describe('a conversa passando pelo roteador', () => {
  let roteadorId: string;
  let principalId: string;
  let suporteId: string;
  let vendasId: string;

  async function publicarServico(nome: string, json: unknown): Promise<string> {
    const r = await noTenant(a.tenantId, (tx) =>
      importarFluxoDaBlip(tx, { tenantId: a.tenantId, nome, canalId: null, json, publicar: true }),
    );
    expect(r.erroDeValidacao).toBeNull();
    return r.fluxoId;
  }

  beforeAll(async () => {
    principalId = await publicarServico('Serviço principal', PRINCIPAL);
    suporteId = await publicarServico('Serviço suporte', SUPORTE);
    vendasId = await publicarServico('Serviço vendas', VENDAS);
    await a.dono.execute(sql`
      update fluxo set usa_contexto_do_roteador = true
       where id in (${principalId}::uuid, ${vendasId}::uuid)
    `);
    roteadorId = await novoFluxo(a, 'roteador', { estado: 'publicado', canalId: a.canalId });
    await a.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min)
      values
        (${a.tenantId}, ${roteadorId}, ${principalId}, 'Principal', true, false, null),
        (${a.tenantId}, ${roteadorId}, ${suporteId}, 'Suporte', false, false, 30),
        (${a.tenantId}, ${roteadorId}, ${vendasId}, 'Vendas', false, true, null)
    `);
  }, 60_000);

  async function falar(de: string, texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadDeMensagem(de, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.canalId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);
  }

  type Conversa = { id: string; fila_id: string | null; atendente_id: string | null };

  async function conversaAberta(telefone: string): Promise<Conversa> {
    const { rows } = await a.dono.execute<Conversa>(sql`
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
    const { rows } = await a.dono.execute<{ conteudo: string }>(sql`
      select m.conteudo from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where ct.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
         and m.autor_tipo = 'bot'
       order by m.criada_em desc limit 1
    `);
    return rows[0]?.conteudo;
  }

  type Posicao = {
    servico_id: string;
    expira_em: Date | null;
    contexto: Record<string, string>;
    contato_id: string;
  };

  async function posicao(telefone: string): Promise<Posicao> {
    const { rows } = await a.dono.execute<Posicao>(sql`
      select p.servico_id, p.expira_em, p.contexto, p.contato_id
        from posicao_no_roteador p join contato ct on ct.id = p.contato_id
       where p.roteador_id = ${roteadorId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
    `);
    expect(rows[0]).toBeDefined();
    return rows[0]!;
  }

  it('a primeira interação cai no principal, que não expira', async () => {
    const ANA = '5511922220001';
    await falar(ANA, 'oi');
    expect(await ultimaDoBot(ANA)).toBe('Principal: menu');
    const p = await posicao(ANA);
    expect(p.servico_id).toBe(principalId);
    expect(p.expira_em).toBeNull();
    expect((await conversaAberta(ANA)).fila_id).toBeNull();
  });

  it('o Redirect muda de serviço, a mensagem seguinte cai lá e a outra continua no bloco guardado', async () => {
    const BIA = '5511922220002';
    await falar(BIA, 'oi');
    await falar(BIA, 'suporte');
    expect(await ultimaDoBot(BIA)).toBe('Indo para o suporte');
    const p = await posicao(BIA);
    expect(p.servico_id).toBe(suporteId);
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
    const conversa = await conversaAberta(BIA);
    const { rows } = await a.dono.execute<{ fluxo_id: string; estado: string }>(sql`
      select v.fluxo_id, e.estado from execucao_fluxo e
        join fluxo_versao v on v.id = e.fluxo_versao_id
       where e.conversa_id = ${conversa.id}::uuid order by e.iniciada_em
    `);
    expect(rows.map((r) => [r.fluxo_id, r.estado])).toEqual([
      [principalId, 'concluida'],
      [suporteId, 'aguardando'],
    ]);
  });

  it('expirado o redirecionamento, o contato volta ao principal', async () => {
    const CAIO = '5511922220003';
    await falar(CAIO, 'oi');
    await falar(CAIO, 'suporte');
    await falar(CAIO, 'meu pc');
    expect(await ultimaDoBot(CAIO)).toBe('Suporte: qual o problema? []');

    const { contato_id } = await posicao(CAIO);
    await a.dono.execute(sql`
      update posicao_no_roteador set expira_em = now() - interval '1 minute'
       where roteador_id = ${roteadorId}::uuid and contato_id = ${contato_id}::uuid
    `);
    await falar(CAIO, 'oi de novo');
    // O principal segue do bloco em que tinha ficado (`ir-suporte`), que leva ao menu.
    expect(await ultimaDoBot(CAIO)).toBe('Principal: menu');
    const p = await posicao(CAIO);
    expect(p.servico_id).toBe(principalId);
    expect(p.expira_em).toBeNull();
  });

  it('serviço persistente não expira, e o contexto do roteador é dividido só com quem liga a opção', async () => {
    const DAVI = '5511922220004';
    await falar(DAVI, 'primeira coisa');
    await falar(DAVI, 'vendas');
    const p = await posicao(DAVI);
    expect(p.servico_id).toBe(vendasId);
    expect(p.expira_em).toBeNull();
    // O principal liga o contexto do roteador: o que ele guardou está no par.
    expect(p.contexto['primeira']).toBe('primeira coisa');

    await a.dono.execute(sql`
      update posicao_no_roteador set desde = now() - interval '30 days'
       where roteador_id = ${roteadorId}::uuid and contato_id = ${p.contato_id}::uuid
    `);
    await falar(DAVI, 'quero comprar');
    expect(await ultimaDoBot(DAVI)).toBe('Vendas: [primeira coisa]');
    await falar(DAVI, 'e agora?');
    expect(await ultimaDoBot(DAVI)).toBe('Vendas: [primeira coisa]');
    expect((await posicao(DAVI)).servico_id).toBe(vendasId);
  });

  it('bloco explícito depois do Master-State: o destino não exibe o conteúdo, só avalia as saídas', async () => {
    const EVA = '5511922220005';
    await falar(EVA, 'oi');
    const { contato_id } = await posicao(EVA);
    await noTenant(a.tenantId, (tx) =>
      redirecionarNoRoteador(tx, {
        tenantId: a.tenantId,
        roteadorId,
        contatoId: contato_id,
        servico: 'Suporte',
        blocoInicial: 'resposta',
      }),
    );
    // Na raiz, "voltar" iria para `pergunta`; em `resposta`, vai para `volta`.
    await falar(EVA, 'voltar');
    expect(await ultimaDoBot(EVA)).toBe('Suporte: voltando');
    const { rows } = await a.dono.execute<{ conteudo: string }>(sql`
      select m.conteudo from mensagem m join conversa c on c.id = m.conversa_id
       where c.contato_id = ${contato_id}::uuid and m.autor_tipo = 'bot'
    `);
    expect(rows.map((r) => r.conteudo)).not.toContain('Suporte: anotado ');
    // O `volta` redirecionou para o principal pelo nome do serviço.
    expect((await posicao(EVA)).servico_id).toBe(principalId);
  });

  it('encerrado o atendimento humano, a volta é ao serviço em que ele estava — não ao principal', async () => {
    const FABIO = '5511922220006';
    await falar(FABIO, 'oi');
    await falar(FABIO, 'suporte');
    await falar(FABIO, 'meu pc');
    await falar(FABIO, 'humano');
    const conversa = await conversaAberta(FABIO);
    expect(conversa.fila_id).toBe(a.filaId);
    expect(conversa.atendente_id).toBe(a.atendenteId);

    // O cliente fala com o atendente: é interação, e renova o prazo do serviço.
    await falar(FABIO, 'alô?');
    expect((await posicao(FABIO)).servico_id).toBe(suporteId);

    const { rows: etiquetas } = await a.dono.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome)
      values (${a.tenantId}::uuid, ${`Resolvido ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    await encerrarConversa(
      { tenantId: a.tenantId, atendenteId: a.atendenteId, exigirAtribuicao: true },
      { conversaId: conversa.id, etiquetaId: etiquetas[0]!.id },
    );

    await falar(FABIO, 'voltei');
    const nova = await conversaAberta(FABIO);
    expect(nova.id).not.toBe(conversa.id);
    expect(nova.fila_id).toBeNull();
    expect(await ultimaDoBot(FABIO)).toBe('Suporte: atendimento encerrado');
    expect((await posicao(FABIO)).servico_id).toBe(suporteId);
  });
});
