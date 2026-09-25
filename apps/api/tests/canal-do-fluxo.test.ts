import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { importFlowOfBlip } = await import('../src/dominio/fluxo.js');
const { ClienteGraphDuble } = await import('../src/dominio/whatsapp/cliente-graph.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * O canal DO BOT — `PUT`/`DELETE /v1/gestao/fluxos/:id/canal`, o `GET` que a
 * página do canal lê, e a conexão manual com `fluxo_id`.
 *
 * O que se prova é o que a origem decide (`referencias-blip/canais/
 * FICHA-conectar-canal-no-bot.md` §4): o canal é do bot e a permissão é a
 * `channels` do bot; um bot por número ("Ops… Este número já está em uso" —
 * a Blip recusa, não transfere; quem troca desliga no bot anterior antes);
 * e, ligado o roteador ao número, a mensagem que chega nesse número cai nele.
 * Mais as travas do Pipe: canal inativo não liga (409), outro tenant e uuid
 * malformado são 404, e um bot tem um canal só (a coluna `fluxo.canal_id`).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem edita fluxo na conta — o equivalente de conta de `channels.escrever`. */
let sessionEditor: string;
/** Gente do tenant A sem permissão nenhuma. */
let sessionWithoutPoder: string;
/** Quem só é membro de UM fluxo, com `channels: escrever` — nada na conta. */
let memberOfFlow: string;
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
      ${extra.state ?? 'rascunho'}, ${extra.channelId ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

/** Um canal a mais no tenant, sem passar pela Meta. */
async function newChannel(
  cenario: Cenario,
  extra: { type?: string; active?: boolean; number?: string } = {},
): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, ativo, config)
    values (
      ${cenario.tenantId}, ${extra.tipo ?? 'whatsapp_cloud'}, ${`Canal ${marca}`},
      ${extra.ativo ?? true}, ${JSON.stringify({ number: extra.numero ?? `+55119${marca.slice(0, 7)}` })}::jsonb
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
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

const codigo = (r: { body: Record<string, unknown> }) =>
  (r.corpo['erro'] as { code?: string } | undefined)?.codigo;
const detalhe = (r: { body: Record<string, unknown> }) =>
  (r.corpo['erro'] as { detalhe?: Record<string, unknown> } | undefined)?.detalhe ?? {};

const ligar = (sessao: string, flowId: string, channelId: string) =>
  chamar(sessao, 'PUT', `/v1/management/flows/${flowId}/channel`, { channelId });
const desligar = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'DELETE', `/v1/management/flows/${fluxoId}/channel`);
const readChannel = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'GET', `/v1/management/flows/${fluxoId}/channel`);

async function channelOfDatabase(fluxoId: string): Promise<string | null> {
  const { rows } = await a.dono.execute<{ channelId: string | null }>(
    sql`select canal_id from fluxo where id = ${fluxoId}::uuid`,
  );
  return rows[0]?.canal_id ?? null;
}

async function auditoriaDe(fluxoId: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'fluxo' and objeto_id = ${fluxoId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  sessionEditor = await openSession(a, await pessoaCom(a, ['automacao.fluxo.editar']));
  sessionWithoutPoder = await openSession(a, await pessoaCom(a, []));
  memberOfFlow = await pessoaCom(a, []);
  sessionOfOtherTenant = await openSession(b, await pessoaCom(b, ['automacao.fluxo.editar']));
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('PUT e GET /v1/management/flows/:id/channel', () => {
  it('Connect a channel to a bot, audit it, and include channel details in contact GET', async () => {
    const flowId = await newFlow(a, 'fluxo');
    const channelId = await newChannel(a, { numero: '+5511900000001' });

    const ligado = await ligar(sessionEditor, flowId, channelId);
    expect(ligado.status).toBe(200);
    expect(ligado.corpo).toMatchObject({
      id: channelId,
      tipo: 'whatsapp_cloud',
      numero: '+5511900000001',
      ativo: true,
      flowId,
    });
    expect(await channelOfDatabase(flowId)).toBe(channelId);

    const log = await auditoriaDe(flowId);
    expect(log.at(-1)).toMatchObject({
      acao: 'alterou',
      antes: { canalId: null },
      depois: { channelId, canalTipo: 'whatsapp_cloud' },
    });

    const lido = await readChannel(sessionEditor, flowId);
    expect(lido.status).toBe(200);
    expect(lido.corpo['canal']).toMatchObject({ id: channelId, flowId });
    const disponiveis = lido.corpo['disponiveis'] as { id: string; flowId: string | null }[];
    expect(disponiveis.find((c) => c.id === channelId)?.flowId).toBe(flowId);

    const contact = await chamar(sessionEditor, 'GET', `/v1/management/flows/${flowId}`);
    expect(contact.corpo['contato']).toMatchObject({
      channelId,
      canalTipo: 'whatsapp_cloud',
      canalAtivo: true,
      canalNumero: '+5511900000001',
    });
    expect((contact.corpo['contato'] as { channelName: string }).channelName).toMatch(/^Canal /);

    // Ligar de novo o mesmo canal não é erro nem gera registro.
    expect((await ligar(sessionEditor, flowId, channelId)).status).toBe(200);
    expect(await auditoriaDe(flowId)).toHaveLength(log.length);
  });

  it('Allow only one bot per number and connect another only after the first disconnects', async () => {
    const first = await newFlow(a, 'fluxo');
    const segundo = await newFlow(a, 'roteador');
    const canalId = await newChannel(a);
    expect((await ligar(sessionEditor, first, canalId)).status).toBe(200);

    const recusa = await ligar(sessionEditor, segundo, canalId);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('numero_em_uso');
    expect((recusa.corpo['erro'] as { message: string }).message).toBe(
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
    );
    expect(detalhe(recusa)['fluxoId']).toBe(first);
    expect(await channelOfDatabase(segundo)).toBeNull();

    // A tela do segundo vê o canal como "em uso pelo primeiro".
    const lido = await readChannel(sessionEditor, segundo);
    const disponiveis = lido.corpo['disponiveis'] as { id: string; flowId: string | null }[];
    expect(disponiveis.find((c) => c.id === canalId)?.fluxoId).toBe(first);

    // Trocar de bot é: desligar no anterior, ligar no novo.
    expect((await desligar(sessionEditor, first)).status).toBe(204);
    expect(await channelOfDatabase(first)).toBeNull();
    expect((await ligar(sessionEditor, segundo, canalId)).status).toBe(200);
    expect(await channelOfDatabase(segundo)).toBe(canalId);

    // Arquivado não segura número: um terceiro liga por cima.
    await a.dono.execute(sql`update fluxo set estado = 'arquivado' where id = ${segundo}::uuid`);
    const third = await newFlow(a, 'fluxo');
    expect((await ligar(sessionEditor, third, canalId)).status).toBe(200);
  });

  it('Return 409 and identify the existing channel when connecting a second channel to one bot', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const whatsapp = await newChannel(a);
    const instagram = await newChannel(a, { tipo: 'instagram' });
    expect((await ligar(sessionEditor, fluxoId, whatsapp)).status).toBe(200);

    const recusa = await ligar(sessionEditor, fluxoId, instagram);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('fluxo_ja_tem_canal');
    expect(detalhe(recusa)['canalId']).toBe(whatsapp);
    expect(await channelOfDatabase(fluxoId)).toBe(whatsapp);
  });

  it('Return 409 for an inactive channel and 404 for invalid or cross-tenant IDs', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const desligado = await newChannel(a, { ativo: false });
    const inativo = await ligar(sessionEditor, fluxoId, desligado);
    expect(inativo.status).toBe(409);
    expect(codigo(inativo)).toBe('canal_inativo');

    const channelOfB = await newChannel(b);
    expect((await ligar(sessionEditor, fluxoId, channelOfB)).status).toBe(404);
    expect((await ligar(sessionEditor, fluxoId, 'nao-e-uuid')).status).toBe(404);
    expect((await ligar(sessionEditor, 'nao-e-uuid', channelOfB)).status).toBe(404);
    expect((await chamar(sessionEditor, 'PUT', `/v1/management/flows/${fluxoId}/channel`, {})).status).toBe(400);

    const channelOfA = await newChannel(a);
    expect((await ligar(sessionOfOtherTenant, fluxoId, channelOfA)).status).toBe(404);
    expect((await readChannel(sessionOfOtherTenant, fluxoId)).status).toBe(404);
    expect((await desligar(sessionOfOtherTenant, fluxoId)).status).toBe(404);
    expect(await channelOfDatabase(fluxoId)).toBeNull();
  });

  it('Require the bot\'s `channels` permission and allow flow members with `channels.escrever` to connect', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const otherFlow = await newFlow(a, 'fluxo');
    const canalId = await newChannel(a);

    const semPoder = await ligar(sessionWithoutPoder, fluxoId, canalId);
    expect(semPoder.status).toBe(403);
    expect(codigo(semPoder)).toBe('sem_permissao');
    expect((await desligar(sessionWithoutPoder, fluxoId)).status).toBe(403);

    await a.dono.execute(sql`
      insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
      values (${a.tenantId}, ${fluxoId}::uuid, ${memberOfFlow}::uuid, 'personalizado',
              ${JSON.stringify({ channels: 'escrever' })}::jsonb)
    `);
    const sessionMember = await openSession(a, memberOfFlow);
    expect((await ligar(sessionMember, fluxoId, canalId)).status).toBe(200);
    expect((await desligar(sessionMember, fluxoId)).status).toBe(204);
    // No fluxo em que não é membro, continua sem poder.
    expect((await ligar(sessionMember, otherFlow, canalId)).status).toBe(403);
  });
});

describe('DELETE /v1/management/flows/:id/channel', () => {
  it('Disconnect the bot without changing the channel, audit the action, and allow repeated disconnects', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const canalId = await newChannel(a);
    await ligar(sessionEditor, fluxoId, canalId);

    expect((await desligar(sessionEditor, fluxoId)).status).toBe(204);
    expect(await channelOfDatabase(fluxoId)).toBeNull();
    const { rows } = await a.dono.execute<{ active: boolean }>(
      sql`select ativo from canal where id = ${canalId}::uuid`,
    );
    expect(rows[0]?.ativo).toBe(true);

    const log = await auditoriaDe(fluxoId);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', antes: { canalId }, depois: { canalId: null } });

    expect((await desligar(sessionEditor, fluxoId)).status).toBe(204);
    expect(await auditoriaDe(fluxoId)).toHaveLength(log.length);

    const lido = await readChannel(sessionEditor, fluxoId);
    expect(lido.corpo['canal']).toBeNull();
  });
});

describe('Connect a new channel to a bot using `fluxo_id`', () => {
  const appSecret = 'a'.repeat(32);

  it('Create a channel already linked to the bot under the bot\'s permission', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`ligado-${fluxoId}`);
    const criado = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      nome: 'Número do bot',
      fluxo_id: fluxoId,
    });
    expect(criado.status).toBe(201);
    const canalId = criado.corpo['id'] as string;
    expect(await channelOfDatabase(fluxoId)).toBe(canalId);

    const lido = await readChannel(sessionEditor, fluxoId);
    expect(lido.corpo['canal']).toMatchObject({ id: canalId, tipo: 'whatsapp_cloud', nome: 'Número do bot', fluxoId });
  });

  it('Reject missing bot permission, an occupied bot, or a malformed flow before creating a channel', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`negado-${fluxoId}`);
    const corpo = {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      fluxo_id: fluxoId,
    };
    const contar = async () => {
      const { rows } = await a.dono.execute<{ n: string }>(
        sql`select count(*)::text as n from canal where tenant_id = ${a.tenantId}::uuid and numero_id = ${numeroId}`,
      );
      return Number(rows[0]!.n);
    };

    expect((await chamar(sessionWithoutPoder, 'POST', '/v1/channels/whatsapp/manual', corpo)).status).toBe(403);
    expect(await contar()).toBe(0);

    expect(
      (await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', { ...corpo, fluxo_id: 'nao-e-uuid' })).status,
    ).toBe(404);
    expect(await contar()).toBe(0);

    await ligar(sessionEditor, fluxoId, await newChannel(a));
    const cheio = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', corpo);
    expect(cheio.status).toBe(409);
    expect(codigo(cheio)).toBe('fluxo_ja_tem_canal');
    expect(await contar()).toBe(0);
  });
});

/* ------------------------------------------------- A mensagem cai no roteador */

const enviar = (texto: string) => ({
  type: 'SendMessage',
  settings: { type: 'text/plain', content: texto },
});

/** Um principal de uma pergunta só: responde e fica esperando. */
const PRINCIPAL = {
  states: [
    { id: 'inicio', root: true, input: {}, outputs: [{ stateId: 'ola' }] },
    { id: 'ola', inputActions: [enviar('Roteador: olá!')], input: {}, outputs: [{ stateId: 'ola' }] },
  ],
};

describe('Route messages from a connected phone number to its router bot', () => {
  it('Answer the customer\'s first message through the router\'s primary service', async () => {
    const principal = await noTenant(a.tenantId, (tx) =>
      importFlowOfBlip(tx, {
        tenantId: a.tenantId,
        nome: `Principal ${randomUUID().slice(0, 6)}`,
        channelId: null,
        json: PRINCIPAL,
        publicar: true,
      }),
    );
    expect(principal.errorOfValidation).toBeNull();

    // Publicar o roteador não é gesto desta tarefa: nasce publicado, mas SEM canal.
    const routerId = await newFlow(a, 'roteador', { state: 'publicado' });
    await a.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min)
      values (${a.tenantId}, ${routerId}, ${principal.fluxoId}, 'Principal', true, false, null)
    `);

    // Pela tela: o canal do cenário (o número que recebe o webhook) vira o canal do roteador.
    expect((await ligar(sessionEditor, routerId, a.channelId)).status).toBe(200);

    const CLIENTE = '5511933330001';
    const corpo = JSON.stringify(payloadOfMessage(CLIENTE, 'oi'));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);

    const { rows } = await a.dono.execute<{ content: string }>(sql`
      select m.conteudo from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where ct.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
         and m.autor_tipo = 'bot'
       order by m.criada_em desc limit 1
    `);
    expect(rows[0]?.conteudo).toBe('Roteador: olá!');

    const { rows: position } = await a.dono.execute<{ serviceId: string }>(sql`
      select p.servico_id from posicao_no_roteador p
        join contato ct on ct.id = p.contato_id
       where p.roteador_id = ${routerId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
    `);
    expect(position[0]?.serviceId).toBe(principal.fluxoId);

    // Desligado o roteador do número, a próxima conversa nova já não passa por ele.
    expect((await desligar(sessionEditor, routerId)).status).toBe(204);
  });
});

/* ---------------------------------------- Reconectar por cima, sem desconectar */

describe('reconexão manual do mesmo número', () => {
  const appSecret = 'b'.repeat(32);

  /**
   * O token do cliente expira, e na origem a saída é refazer a conexão no mesmo
   * canal — não há desconectar no WhatsApp (`FICHA-conectar-canal-no-bot.md`
   * §5). Sem `canal_id`, trocar o token ficava num beco: criar de novo esbarra
   * no próprio número.
   */
  it('Update existing channel credentials by canal_id instead of rejecting its phone number', async () => {
    const fluxoId = await newFlow(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`reconecta-${fluxoId}`);
    const corpo = {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      fluxo_id: fluxoId,
    };
    const criado = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', corpo);
    expect(criado.status).toBe(201);
    const canalId = criado.corpo['id'] as string;

    /* Sem `canal_id`: é o beco que o dono encontrou — o número já é de um canal.
       Fora do bot quem manda é `canal.gerenciar`, daí a sessão própria. */
    const sessionOfChannel = await openSession(a, await pessoaCom(a, ['canal.gerenciar']));
    const { fluxo_id: _semBot, ...semBot } = corpo;
    const repetido = await chamar(sessionOfChannel, 'POST', '/v1/channels/whatsapp/manual', semBot);
    expect(repetido.status).toBe(422);
    expect(codigo(repetido)).toBe('configuracao_invalida');

    /* O duble da Meta casa token com número, então o token de teste é o mesmo;
       o que prova a troca é o App Secret novo gravado no canal. */
    const newSecret = 'c'.repeat(32);
    const refeito = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      ...corpo,
      app_secret: newSecret,
      channelId: canalId,
    });
    expect(refeito.status).toBe(201);
    expect(refeito.corpo['id']).toBe(canalId);
    /* O canal continua ligado ao mesmo bot e não nasceu um segundo. */
    expect(await channelOfDatabase(fluxoId)).toBe(canalId);
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from canal where tenant_id = ${a.tenantId}::uuid and numero_id = ${numeroId}`,
    );
    expect(Number(rows[0]!.n)).toBe(1);

    const { rows: guardado } = await a.dono.execute<{ secret: string }>(
      sql`select config->>'appSecret' as segredo from canal where id = ${canalId}::uuid`,
    );
    /* Cifrado no banco: o que importa é ter MUDADO, não o valor em claro. */
    expect(guardado[0]!.secret).toBeTruthy();
    expect(guardado[0]!.secret).not.toBe(appSecret);
  });

  it('Reject attempts to reconnect another tenant\'s channel', async () => {
    const alheio = await newChannel(b);
    const resposta = await chamar(sessionEditor, 'POST', '/v1/channels/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: ClienteGraphDuble.sufixo('alheio'),
      access_token: 'manual-alheio',
      app_secret: appSecret,
      channelId: alheio,
    });
    expect(resposta.status).toBe(404);
  });
});
