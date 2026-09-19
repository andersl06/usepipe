import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';

const { criarBanco, estaCifrado, fecharBanco, migrar, semear } = await import('@pipe/db');
const { dubleInstagram, processarOutbox } = await import('@pipe/workers');
const { esquecerCanal } = await import('../src/banco.js');
const { subirApi } = await import('../src/servidor.js');
const { enviarMensagem } = await import('../src/dominio/envio.js');
const { ClienteGraphInstagramDuble, ClienteGraphInstagramReal, definirFabricaGraphInstagram } = await import(
  '../src/dominio/instagram/cliente-graph.js'
);
const { atualizarConfigInstagram, lerCanalInstagram } = await import('../src/dominio/instagram/canal.js');
const { renovarTokenDoCanal } = await import('../src/dominio/instagram/renovacao.js');
const { ControladorCanaisInstagram } = await import('../src/controladores/canais-instagram.js');
import type { RequisicaoComSessao } from '../src/sessao.js';

/**
 * O canal do Instagram (Direct) pelo caminho manual, com banco de verdade e sem tocar
 * na Meta: conectar (e as recusas), a cifra, o webhook por HTTP, a entrada sem
 * telefone, a idempotência, o eco, a saída pelo worker, desconectar, o isolamento
 * entre clientes e a renovação do token.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const SEGREDO = 'ab'.repeat(16);
const controlador = new ControladorCanaisInstagram();

type Dono = ReturnType<typeof criarBanco>;
type Quem = { tenantId: string; adminId: string };
let dono: Dono;
let A: Quem;
let B: Quem;
let api: Awaited<ReturnType<typeof subirApi>>;

async function tenantComAdmin(nome: string): Promise<Quem> {
  const { tenantId } = await semear(dono, { nome: `ig ${nome}`, slug: `ig-${nome}` });
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}::uuid, 'Admin', ${`admin-${nome}@ig.pipe.app`}) returning id
  `);
  const adminId = rows[0]!.id;
  await dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    select ${tenantId}::uuid, ${adminId}::uuid, id from papel
     where tenant_id = ${tenantId}::uuid and nome = 'administrador'
  `);
  return { tenantId, adminId };
}

function requisicao(quem: Quem): RequisicaoComSessao {
  return { sessao: { tenantId: quem.tenantId, usuarioId: quem.adminId, origem: 'google' } } as unknown as RequisicaoComSessao;
}

function conectar(quem: Quem, token: string, extra: Record<string, string | undefined> = {}) {
  return controlador.manual(requisicao(quem), { access_token: token, app_secret: SEGREDO, ...extra });
}

async function linhas<T extends Record<string, unknown>>(consulta: ReturnType<typeof sql>): Promise<T[]> {
  return (await dono.execute(consulta)).rows as T[];
}

function evento(canalIg: string, de: string, mensagem: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    object: 'instagram',
    entry: [
      {
        id: canalIg,
        time: Date.now(),
        messaging: [{ sender: { id: de }, recipient: { id: canalIg }, timestamp: Date.now(), message: mensagem, ...extra }],
      },
    ],
  };
}

function postar(canalId: string, payload: unknown, segredo = SEGREDO): Promise<Response> {
  const corpo = JSON.stringify(payload);
  return fetch(`${api.url}/webhooks/instagram/${canalId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`,
    },
    body: corpo,
  });
}

beforeAll(async () => {
  await migrar(URL_DONO);
  dono = criarBanco({ url: URL_DONO, maxConexoes: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
  api = await subirApi(0);
}, 180_000);

afterAll(async () => {
  definirFabricaGraphInstagram(null);
  await api?.fechar();
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await fecharBanco(dono);
});

beforeEach(() => {
  definirFabricaGraphInstagram(null);
  ClienteGraphInstagramDuble.reiniciar();
  dubleInstagram.reiniciar();
  esquecerCanal();
});

describe('conexão manual (POST /v1/canais/instagram/manual)', () => {
  it('recusa sem token, sem segredo, segredo fora do formato, token inválido e segredo de outro app', async () => {
    const recusas: [Record<string, string | undefined>, string][] = [
      [{ access_token: undefined }, 'O token de acesso é obrigatório.'],
      [{ app_secret: undefined }, 'O App Secret é obrigatório.'],
      [{ app_secret: 'curto' }, 'O App Secret tem 32 caracteres, só números e letras de a a f.'],
      [{ access_token: `invalido-${S}` }, 'O token não foi aceito pelo Instagram.'],
      [{ app_secret: `bad${'0'.repeat(29)}` }, 'Este App Secret não é do aplicativo que gerou o token.'],
    ];
    for (const [extra, mensagem] of recusas) {
      await expect(conectar(A, `recusa-${S}`, extra)).rejects.toMatchObject({
        status: 422,
        codigo: 'configuracao_invalida',
        message: expect.stringContaining(mensagem),
      });
    }
    expect(await linhas(sql`select 1 from canal where tenant_id = ${A.tenantId}::uuid`)).toHaveLength(0);
    expect(ClienteGraphInstagramDuble.chamadas.filter((c) => c.acao === 'assinar')).toHaveLength(0);
  });

  it('sucesso: canal + caixa, segredos cifrados, webhook assinado e { url, verifyToken } devolvido', async () => {
    const token = `ok-${S}`;
    const feito = await conectar(A, token, { nome: 'Direct da loja' });
    const igUserId = ClienteGraphInstagramDuble.idDaConta(token);

    expect(feito).toMatchObject({ nome: 'Direct da loja', estado: 'conectado', igUserId, erroDeWebhook: null });
    expect(feito.webhook.url).toBe(`https://api.teste/webhooks/instagram/${feito.id}`);
    expect(feito.webhook.verifyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(ClienteGraphInstagramDuble.chamadas).toContainEqual({ acao: 'assinar', igUserId });

    const [linha] = await linhas<{ tipo: string; numero_id: string; config: Record<string, unknown> }>(
      sql`select tipo, numero_id, config from canal where id = ${feito.id}::uuid`,
    );
    expect(linha).toMatchObject({ tipo: 'instagram', numero_id: igUserId });
    for (const campo of ['tokenAcesso', 'appSecret', 'verifyToken']) {
      expect(estaCifrado(String(linha!.config[campo]))).toBe(true);
    }
    expect(JSON.stringify(linha!.config)).not.toContain(token);
    expect(await linhas(sql`select 1 from inbox where canal_id = ${feito.id}::uuid`)).toHaveLength(1);

    const { canais } = await controlador.listar(requisicao(A));
    expect(canais.map((c) => c.id)).toContain(feito.id);
  });

  it('a mesma conta não entra em outro cliente, nem duas vezes no mesmo', async () => {
    const token = `unica-${S}`;
    await conectar(A, token);
    await expect(conectar(B, token)).rejects.toMatchObject({
      codigo: 'configuracao_invalida',
      message: 'Esta conta do Instagram já está conectada a outra caixa de entrada.',
    });
    await expect(conectar(A, token)).rejects.toMatchObject({ codigo: 'configuracao_invalida' });
    expect(await linhas(sql`select 1 from canal where tenant_id = ${B.tenantId}::uuid`)).toHaveLength(0);
  });

  it('o cliente real nunca põe token nem segredo na mensagem de erro', async () => {
    const token = 'IGAAtoken-secreto-do-cliente';
    const buscar = (async () =>
      new Response(JSON.stringify({ error: { code: 190, message: `token ${token} inválido` } }), {
        status: 400,
      })) as typeof fetch;
    const cliente = new ClienteGraphInstagramReal(token, buscar);
    const erro = (await cliente.buscarConta().catch((e: unknown) => e)) as Error;
    expect(erro.message).not.toContain(token);
    expect(erro.message).toContain('«segredo»');
    expect(await cliente.conferirSegredoDoApp(SEGREDO)).toBe(false);
  });

  it('o envio real manda {recipient:{id}, message:{attachment}} e a legenda em seguida', async () => {
    const pedidos: { url: string; corpo: unknown }[] = [];
    const buscar = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, corpo: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ recipient_id: '1', message_id: `mid-${pedidos.length}` }));
    }) as unknown as typeof fetch;
    const { ClienteInstagramReal } = await import('@pipe/workers');
    const r = await new ClienteInstagramReal(buscar).enviar({
      para: '123',
      conteudo: { tipo: 'imagem', link: 'https://x.teste/a.png', legenda: 'veja' },
      credenciais: { igUserId: '178', tokenAcesso: 't', apiVersao: 'v23.0' },
    });
    expect(r.idProvedor).toBe('mid-1');
    expect(pedidos).toEqual([
      {
        url: 'https://graph.instagram.com/v23.0/178/messages',
        corpo: { recipient: { id: '123' }, message: { attachment: { type: 'image', payload: { url: 'https://x.teste/a.png' } } } },
      },
      { url: 'https://graph.instagram.com/v23.0/178/messages', corpo: { recipient: { id: '123' }, message: { text: 'veja' } } },
    ]);
  });
});

describe('webhook, entrada e saída', () => {
  let canalId: string;
  let igUserId: string;
  let verifyToken: string;
  const IGSID = `9${Date.now()}`;

  beforeAll(async () => {
    definirFabricaGraphInstagram(null);
    const feito = await conectar(A, `webhook-${S}`);
    canalId = feito.id;
    igUserId = feito.igUserId!;
    verifyToken = feito.webhook.verifyToken;
  });

  it('responde ao desafio com o verify_token do canal e recusa o errado', async () => {
    const base = `${api.url}/webhooks/instagram/${canalId}?hub.mode=subscribe&hub.challenge=4242`;
    const certo = await fetch(`${base}&hub.verify_token=${verifyToken}`);
    expect(certo.status).toBe(200);
    expect(await certo.text()).toBe('4242');
    expect((await fetch(`${base}&hub.verify_token=errado`)).status).toBe(403);
  });

  it('assinatura inválida é 401 e não grava nada', async () => {
    const r = await postar(canalId, evento(igUserId, IGSID, { mid: `mid-x-${S}`, text: 'oi' }), 'cd'.repeat(16));
    expect(r.status).toBe(401);
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-x-${S}`}`)).toHaveLength(0);
  });

  it('corpo válido: cria contato SEM telefone, identidade pelo IGSID, conversa e mensagem; repetir não duplica', async () => {
    const payload = evento(igUserId, IGSID, { mid: `mid-1-${S}`, text: 'Olá, quero um orçamento' });
    expect((await postar(canalId, payload)).status).toBe(200);
    expect((await postar(canalId, payload)).status).toBe(200);

    const msgs = await linhas<{ conteudo: string; direcao: string; conversa_id: string }>(
      sql`select conteudo, direcao, conversa_id from mensagem where id_provedor = ${`mid-1-${S}`}`,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ conteudo: 'Olá, quero um orçamento', direcao: 'entrada' });

    const [contato] = await linhas<{ telefone_e164: string | null; canal_tipo: string }>(sql`
      select ct.telefone_e164, ci.canal_tipo from contato_identidade ci
        join contato ct on ct.id = ci.contato_id
       where ci.tenant_id = ${A.tenantId}::uuid and ci.identificador = ${IGSID}
    `);
    expect(contato).toEqual({ telefone_e164: null, canal_tipo: 'instagram' });

    const [conversa] = await linhas<{ canal_id: string }>(sql`
      select ib.canal_id from conversa c join inbox ib on ib.id = c.inbox_id where c.id = ${msgs[0]!.conversa_id}::uuid
    `);
    expect(conversa!.canal_id).toBe(canalId);
  });

  it('eco da própria conta é ignorado; anexo chega pela URL; conta alheia é descartada', async () => {
    await postar(canalId, evento(igUserId, igUserId, { mid: `mid-eco-${S}`, text: 'eco', is_echo: true }));
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-eco-${S}`}`)).toHaveLength(0);

    const url = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
    await postar(canalId, evento(igUserId, IGSID, { mid: `mid-img-${S}`, attachments: [{ type: 'image', payload: { url } }] }));
    const [img] = await linhas<{ tipo: string; chave_storage: string }>(sql`
      select m.tipo, a.chave_storage from mensagem m join anexo a on a.id = m.anexo_id
       where m.id_provedor = ${`mid-img-${S}`}
    `);
    expect(img).toEqual({ tipo: 'imagem', chave_storage: url });

    await postar(canalId, evento('17800000000000000', IGSID, { mid: `mid-alheia-${S}`, text: 'x' }));
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-alheia-${S}`}`)).toHaveLength(0);
  });

  it('a resposta sai pelo worker para o IGSID, com o token decifrado, e o `read` marca lida', async () => {
    const [{ conversa_id: conversaId }] = (await linhas<{ conversa_id: string }>(
      sql`select conversa_id from mensagem where id_provedor = ${`mid-1-${S}`}`,
    )) as [{ conversa_id: string }];
    const enviada = await enviarMensagem({ tenantId: A.tenantId, conversaId, texto: 'Claro! Qual o modelo?' });

    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.mensagemId === enviada.id);
    expect(meu).toMatchObject({ estado: 'enviada' });
    expect(dubleInstagram.chamadas).toContainEqual(
      expect.objectContaining({ para: IGSID, tipo: 'texto', igUserId }),
    );

    const [saida] = await linhas<{ id_provedor: string; estado_entrega: string }>(
      sql`select id_provedor, estado_entrega from mensagem where id = ${enviada.id}::uuid`,
    );
    expect(saida!.estado_entrega).toBe('enviada');

    await postar(canalId, {
      object: 'instagram',
      entry: [{ id: igUserId, messaging: [{ sender: { id: IGSID }, recipient: { id: igUserId }, timestamp: Date.now(), read: { mid: saida!.id_provedor } }] }],
    });
    const [lida] = await linhas<{ estado_entrega: string }>(
      sql`select estado_entrega from mensagem where id = ${enviada.id}::uuid`,
    );
    expect(lida!.estado_entrega).toBe('lida');
  });

  it('outro cliente não vê nem desconecta o canal: 404', async () => {
    const { canais } = await controlador.listar(requisicao(B));
    expect(canais.map((c) => c.id)).not.toContain(canalId);
    await expect(controlador.desconectar(requisicao(B), canalId)).rejects.toMatchObject({ status: 404 });
  });

  it('renovação: cedo demais não chama a Meta; depois de 24h troca o token cifrado; recusa marca reautorização', async () => {
    let canal = await lerCanalInstagram(A.tenantId, canalId);
    expect(await renovarTokenDoCanal(canal)).toBe('cedo_demais');
    expect(ClienteGraphInstagramDuble.chamadas.filter((c) => c.acao === 'renovar')).toHaveLength(0);

    const antigo = String(canal.config['tokenAcesso']);
    canal = await atualizarConfigInstagram(canal, {
      tokenRenovadoEm: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    });
    expect(await renovarTokenDoCanal(canal)).toBe('renovado');
    canal = await lerCanalInstagram(A.tenantId, canalId);
    expect(canal.config['tokenAcesso']).not.toBe(antigo);
    expect(Date.parse(String(canal.config['tokenExpiraEm']))).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000);
    const [bruto] = await linhas<{ config: Record<string, unknown> }>(sql`select config from canal where id = ${canalId}::uuid`);
    expect(estaCifrado(String(bruto!.config['tokenAcesso']))).toBe(true);

    canal = await atualizarConfigInstagram(canal, {
      tokenAcesso: `expirado-${S}`,
      tokenRenovadoEm: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    });
    expect(await renovarTokenDoCanal(canal)).toBe('recusado');
    const { canais } = await controlador.listar(requisicao(A));
    expect(canais.find((c) => c.id === canalId)).toMatchObject({ estado: 'indisponivel', motivo: 'reautorizacao_pendente' });
  });

  it('desconectar desassina, desliga sem apagar histórico, fecha o webhook e deixa reconectar', async () => {
    const desligado = await controlador.desconectar(requisicao(A), canalId);
    expect(desligado.estado).toBe('desligado');
    expect(ClienteGraphInstagramDuble.chamadas).toContainEqual({ acao: 'desassinar', igUserId });
    expect(await linhas(sql`select 1 from mensagem where id_provedor = ${`mid-1-${S}`}`)).toHaveLength(1);

    const r = await postar(canalId, evento(igUserId, IGSID, { mid: `mid-depois-${S}`, text: 'oi?' }));
    expect(r.status).toBe(409);

    const religado = await conectar(A, `webhook-${S}`);
    expect(religado).toMatchObject({ id: canalId, estado: 'conectado' });
  });
});
