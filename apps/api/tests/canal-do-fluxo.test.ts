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

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { importarFluxoDaBlip } = await import('../src/dominio/fluxo.js');
const { ClienteGraphDuble } = await import('../src/dominio/whatsapp/cliente-graph.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * O canal DO BOT — `PUT`/`DELETE /v1/gestao/fluxos/:id/canal`, o `GET` que a
 * página do canal lê, e a conexão manual com `fluxo_id`.
 *
 * O que se prova é o que a origem decide (`docs/capturas/blip/canais/
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
let sessaoEditor: string;
/** Gente do tenant A sem permissão nenhuma. */
let sessaoSemPoder: string;
/** Quem só é membro de UM fluxo, com `channels: escrever` — nada na conta. */
let membroDoFluxo: string;
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

/** Um canal a mais no tenant, sem passar pela Meta. */
async function novoCanal(
  cenario: Cenario,
  extra: { tipo?: string; ativo?: boolean; numero?: string } = {},
): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, ativo, config)
    values (
      ${cenario.tenantId}, ${extra.tipo ?? 'whatsapp_cloud'}, ${`Canal ${marca}`},
      ${extra.ativo ?? true}, ${JSON.stringify({ numero: extra.numero ?? `+55119${marca.slice(0, 7)}` })}::jsonb
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
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(sessao),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

const codigo = (r: { corpo: Record<string, unknown> }) =>
  (r.corpo['erro'] as { codigo?: string } | undefined)?.codigo;
const detalhe = (r: { corpo: Record<string, unknown> }) =>
  (r.corpo['erro'] as { detalhe?: Record<string, unknown> } | undefined)?.detalhe ?? {};

const ligar = (sessao: string, fluxoId: string, canalId: string) =>
  chamar(sessao, 'PUT', `/v1/gestao/fluxos/${fluxoId}/canal`, { canalId });
const desligar = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'DELETE', `/v1/gestao/fluxos/${fluxoId}/canal`);
const lerCanal = (sessao: string, fluxoId: string) =>
  chamar(sessao, 'GET', `/v1/gestao/fluxos/${fluxoId}/canal`);

async function canalDoBanco(fluxoId: string): Promise<string | null> {
  const { rows } = await a.dono.execute<{ canal_id: string | null }>(
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
  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, await pessoaCom(a, ['automacao.fluxo.editar']));
  sessaoSemPoder = await abrirSessao(a, await pessoaCom(a, []));
  membroDoFluxo = await pessoaCom(a, []);
  sessaoDoOutroTenant = await abrirSessao(b, await pessoaCom(b, ['automacao.fluxo.editar']));
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('PUT e GET /v1/gestao/fluxos/:id/canal', () => {
  it('liga o canal ao bot, registra no log, e o GET do contato passa a dizer tipo, nome e número', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const canalId = await novoCanal(a, { numero: '+5511900000001' });

    const ligado = await ligar(sessaoEditor, fluxoId, canalId);
    expect(ligado.status).toBe(200);
    expect(ligado.corpo).toMatchObject({
      id: canalId,
      tipo: 'whatsapp_cloud',
      numero: '+5511900000001',
      ativo: true,
      fluxoId,
    });
    expect(await canalDoBanco(fluxoId)).toBe(canalId);

    const log = await auditoriaDe(fluxoId);
    expect(log.at(-1)).toMatchObject({
      acao: 'alterou',
      antes: { canalId: null },
      depois: { canalId, canalTipo: 'whatsapp_cloud' },
    });

    const lido = await lerCanal(sessaoEditor, fluxoId);
    expect(lido.status).toBe(200);
    expect(lido.corpo['canal']).toMatchObject({ id: canalId, fluxoId });
    const disponiveis = lido.corpo['disponiveis'] as { id: string; fluxoId: string | null }[];
    expect(disponiveis.find((c) => c.id === canalId)?.fluxoId).toBe(fluxoId);

    const contato = await chamar(sessaoEditor, 'GET', `/v1/gestao/fluxos/${fluxoId}`);
    expect(contato.corpo['contato']).toMatchObject({
      canalId,
      canalTipo: 'whatsapp_cloud',
      canalAtivo: true,
      canalNumero: '+5511900000001',
    });
    expect((contato.corpo['contato'] as { canalNome: string }).canalNome).toMatch(/^Canal /);

    // Ligar de novo o mesmo canal não é erro nem gera registro.
    expect((await ligar(sessaoEditor, fluxoId, canalId)).status).toBe(200);
    expect(await auditoriaDe(fluxoId)).toHaveLength(log.length);
  });

  it('um bot por número: o segundo bot é recusado com a frase da origem, e só liga depois de o primeiro desligar', async () => {
    const primeiro = await novoFluxo(a, 'fluxo');
    const segundo = await novoFluxo(a, 'roteador');
    const canalId = await novoCanal(a);
    expect((await ligar(sessaoEditor, primeiro, canalId)).status).toBe(200);

    const recusa = await ligar(sessaoEditor, segundo, canalId);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('numero_em_uso');
    expect((recusa.corpo['erro'] as { mensagem: string }).mensagem).toBe(
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
    );
    expect(detalhe(recusa)['fluxoId']).toBe(primeiro);
    expect(await canalDoBanco(segundo)).toBeNull();

    // A tela do segundo vê o canal como "em uso pelo primeiro".
    const lido = await lerCanal(sessaoEditor, segundo);
    const disponiveis = lido.corpo['disponiveis'] as { id: string; fluxoId: string | null }[];
    expect(disponiveis.find((c) => c.id === canalId)?.fluxoId).toBe(primeiro);

    // Trocar de bot é: desligar no anterior, ligar no novo.
    expect((await desligar(sessaoEditor, primeiro)).status).toBe(204);
    expect(await canalDoBanco(primeiro)).toBeNull();
    expect((await ligar(sessaoEditor, segundo, canalId)).status).toBe(200);
    expect(await canalDoBanco(segundo)).toBe(canalId);

    // Arquivado não segura número: um terceiro liga por cima.
    await a.dono.execute(sql`update fluxo set estado = 'arquivado' where id = ${segundo}::uuid`);
    const terceiro = await novoFluxo(a, 'fluxo');
    expect((await ligar(sessaoEditor, terceiro, canalId)).status).toBe(200);
  });

  it('um bot tem um canal só (decisão Pipe): ligar um segundo canal é 409 e diz qual está lá', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const whatsapp = await novoCanal(a);
    const instagram = await novoCanal(a, { tipo: 'instagram' });
    expect((await ligar(sessaoEditor, fluxoId, whatsapp)).status).toBe(200);

    const recusa = await ligar(sessaoEditor, fluxoId, instagram);
    expect(recusa.status).toBe(409);
    expect(codigo(recusa)).toBe('fluxo_ja_tem_canal');
    expect(detalhe(recusa)['canalId']).toBe(whatsapp);
    expect(await canalDoBanco(fluxoId)).toBe(whatsapp);
  });

  it('canal inativo é 409; canal de outro tenant, uuid malformado e fluxo de outro tenant são 404', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const desligado = await novoCanal(a, { ativo: false });
    const inativo = await ligar(sessaoEditor, fluxoId, desligado);
    expect(inativo.status).toBe(409);
    expect(codigo(inativo)).toBe('canal_inativo');

    const canalDeB = await novoCanal(b);
    expect((await ligar(sessaoEditor, fluxoId, canalDeB)).status).toBe(404);
    expect((await ligar(sessaoEditor, fluxoId, 'nao-e-uuid')).status).toBe(404);
    expect((await ligar(sessaoEditor, 'nao-e-uuid', canalDeB)).status).toBe(404);
    expect((await chamar(sessaoEditor, 'PUT', `/v1/gestao/fluxos/${fluxoId}/canal`, {})).status).toBe(400);

    const canalDeA = await novoCanal(a);
    expect((await ligar(sessaoDoOutroTenant, fluxoId, canalDeA)).status).toBe(404);
    expect((await lerCanal(sessaoDoOutroTenant, fluxoId)).status).toBe(404);
    expect((await desligar(sessaoDoOutroTenant, fluxoId)).status).toBe(404);
    expect(await canalDoBanco(fluxoId)).toBeNull();
  });

  it('a permissão é a `channels` DO BOT: sem nada é 403; membro do fluxo com channels.escrever liga, mesmo sem poder na conta', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const outroFluxo = await novoFluxo(a, 'fluxo');
    const canalId = await novoCanal(a);

    const semPoder = await ligar(sessaoSemPoder, fluxoId, canalId);
    expect(semPoder.status).toBe(403);
    expect(codigo(semPoder)).toBe('sem_permissao');
    expect((await desligar(sessaoSemPoder, fluxoId)).status).toBe(403);

    await a.dono.execute(sql`
      insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
      values (${a.tenantId}, ${fluxoId}::uuid, ${membroDoFluxo}::uuid, 'personalizado',
              ${JSON.stringify({ channels: 'escrever' })}::jsonb)
    `);
    const sessaoMembro = await abrirSessao(a, membroDoFluxo);
    expect((await ligar(sessaoMembro, fluxoId, canalId)).status).toBe(200);
    expect((await desligar(sessaoMembro, fluxoId)).status).toBe(204);
    // No fluxo em que não é membro, continua sem poder.
    expect((await ligar(sessaoMembro, outroFluxo, canalId)).status).toBe(403);
  });
});

describe('DELETE /v1/gestao/fluxos/:id/canal', () => {
  it('desliga o bot do canal sem mexer no canal, registra, e desligar de novo é silencioso', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const canalId = await novoCanal(a);
    await ligar(sessaoEditor, fluxoId, canalId);

    expect((await desligar(sessaoEditor, fluxoId)).status).toBe(204);
    expect(await canalDoBanco(fluxoId)).toBeNull();
    const { rows } = await a.dono.execute<{ ativo: boolean }>(
      sql`select ativo from canal where id = ${canalId}::uuid`,
    );
    expect(rows[0]?.ativo).toBe(true);

    const log = await auditoriaDe(fluxoId);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', antes: { canalId }, depois: { canalId: null } });

    expect((await desligar(sessaoEditor, fluxoId)).status).toBe(204);
    expect(await auditoriaDe(fluxoId)).toHaveLength(log.length);

    const lido = await lerCanal(sessaoEditor, fluxoId);
    expect(lido.corpo['canal']).toBeNull();
  });
});

describe('conexão manual com fluxo_id', () => {
  const appSecret = 'a'.repeat(32);

  it('o canal nasce já ligado ao bot, com a permissão do bot', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`ligado-${fluxoId}`);
    const criado = await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      nome: 'Número do bot',
      fluxo_id: fluxoId,
    });
    expect(criado.status).toBe(201);
    const canalId = criado.corpo['id'] as string;
    expect(await canalDoBanco(fluxoId)).toBe(canalId);

    const lido = await lerCanal(sessaoEditor, fluxoId);
    expect(lido.corpo['canal']).toMatchObject({ id: canalId, tipo: 'whatsapp_cloud', nome: 'Número do bot', fluxoId });
  });

  it('sem poder no bot é 403 e NADA é criado; bot que já tem canal é 409 antes de gravar; fluxo malformado é 404', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
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

    expect((await chamar(sessaoSemPoder, 'POST', '/v1/canais/whatsapp/manual', corpo)).status).toBe(403);
    expect(await contar()).toBe(0);

    expect(
      (await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', { ...corpo, fluxo_id: 'nao-e-uuid' })).status,
    ).toBe(404);
    expect(await contar()).toBe(0);

    await ligar(sessaoEditor, fluxoId, await novoCanal(a));
    const cheio = await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', corpo);
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

describe('ligado o roteador ao número, a mensagem que chega nele cai no roteador', () => {
  it('a primeira mensagem do cliente é respondida pelo serviço principal do roteador', async () => {
    const principal = await noTenant(a.tenantId, (tx) =>
      importarFluxoDaBlip(tx, {
        tenantId: a.tenantId,
        nome: `Principal ${randomUUID().slice(0, 6)}`,
        canalId: null,
        json: PRINCIPAL,
        publicar: true,
      }),
    );
    expect(principal.erroDeValidacao).toBeNull();

    // Publicar o roteador não é gesto desta tarefa: nasce publicado, mas SEM canal.
    const roteadorId = await novoFluxo(a, 'roteador', { estado: 'publicado' });
    await a.dono.execute(sql`
      insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal, persistente, expiracao_min)
      values (${a.tenantId}, ${roteadorId}, ${principal.fluxoId}, 'Principal', true, false, null)
    `);

    // Pela tela: o canal do cenário (o número que recebe o webhook) vira o canal do roteador.
    expect((await ligar(sessaoEditor, roteadorId, a.canalId)).status).toBe(200);

    const CLIENTE = '5511933330001';
    const corpo = JSON.stringify(payloadDeMensagem(CLIENTE, 'oi'));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.canalId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);

    const { rows } = await a.dono.execute<{ conteudo: string }>(sql`
      select m.conteudo from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where ct.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
         and m.autor_tipo = 'bot'
       order by m.criada_em desc limit 1
    `);
    expect(rows[0]?.conteudo).toBe('Roteador: olá!');

    const { rows: posicao } = await a.dono.execute<{ servico_id: string }>(sql`
      select p.servico_id from posicao_no_roteador p
        join contato ct on ct.id = p.contato_id
       where p.roteador_id = ${roteadorId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
    `);
    expect(posicao[0]?.servico_id).toBe(principal.fluxoId);

    // Desligado o roteador do número, a próxima conversa nova já não passa por ele.
    expect((await desligar(sessaoEditor, roteadorId)).status).toBe(204);
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
  it('com canal_id troca a credencial do canal que já existe, em vez de recusar por número em uso', async () => {
    const fluxoId = await novoFluxo(a, 'fluxo');
    const numeroId = ClienteGraphDuble.sufixo(`reconecta-${fluxoId}`);
    const corpo = {
      waba_id: 'waba-do-bot',
      phone_number_id: numeroId,
      access_token: `manual-${numeroId}`,
      app_secret: appSecret,
      fluxo_id: fluxoId,
    };
    const criado = await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', corpo);
    expect(criado.status).toBe(201);
    const canalId = criado.corpo['id'] as string;

    /* Sem `canal_id`: é o beco que o dono encontrou — o número já é de um canal.
       Fora do bot quem manda é `canal.gerenciar`, daí a sessão própria. */
    const sessaoDeCanal = await abrirSessao(a, await pessoaCom(a, ['canal.gerenciar']));
    const { fluxo_id: _semBot, ...semBot } = corpo;
    const repetido = await chamar(sessaoDeCanal, 'POST', '/v1/canais/whatsapp/manual', semBot);
    expect(repetido.status).toBe(422);
    expect(codigo(repetido)).toBe('configuracao_invalida');

    /* O duble da Meta casa token com número, então o token de teste é o mesmo;
       o que prova a troca é o App Secret novo gravado no canal. */
    const novoSegredo = 'c'.repeat(32);
    const refeito = await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', {
      ...corpo,
      app_secret: novoSegredo,
      canal_id: canalId,
    });
    expect(refeito.status).toBe(201);
    expect(refeito.corpo['id']).toBe(canalId);
    /* O canal continua ligado ao mesmo bot e não nasceu um segundo. */
    expect(await canalDoBanco(fluxoId)).toBe(canalId);
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from canal where tenant_id = ${a.tenantId}::uuid and numero_id = ${numeroId}`,
    );
    expect(Number(rows[0]!.n)).toBe(1);

    const { rows: guardado } = await a.dono.execute<{ segredo: string }>(
      sql`select config->>'appSecret' as segredo from canal where id = ${canalId}::uuid`,
    );
    /* Cifrado no banco: o que importa é ter MUDADO, não o valor em claro. */
    expect(guardado[0]!.segredo).toBeTruthy();
    expect(guardado[0]!.segredo).not.toBe(appSecret);
  });

  it('canal de outro tenant não se reconecta por aqui', async () => {
    const alheio = await novoCanal(b);
    const resposta = await chamar(sessaoEditor, 'POST', '/v1/canais/whatsapp/manual', {
      waba_id: 'waba-do-bot',
      phone_number_id: ClienteGraphDuble.sufixo('alheio'),
      access_token: 'manual-alheio',
      app_secret: appSecret,
      canal_id: alheio,
    });
    expect(resposta.status).toBe(404);
  });
});
