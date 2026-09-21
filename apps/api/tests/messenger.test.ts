import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';
const { criarBanco, estaCifrado, fecharBanco, migrar, semear } = await import('@pipe/db');
const { dubleMessenger, processarOutbox } = await import('@pipe/workers');
const { subirApi } = await import('../src/servidor.js');
const { enviarMensagem } = await import('../src/dominio/envio.js');
const { ControladorCanaisMessenger } = await import('../src/controladores/canais-messenger.js');
const { aplicarPerfilMessenger, lerCanalMessenger } = await import('../src/dominio/messenger/canal.js');
import type { RequisicaoComSessao } from '../src/sessao.js';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
const { ClienteGraphMessengerDuble, clienteGraphMessenger, definirFabricaGraphMessenger } = await import('../src/dominio/messenger/cliente-graph.js');
const { payloadDoMessenger, valoresDoMessenger } = await import('../src/dominio/messenger/entrada.js');

describe('Messenger', () => {
  beforeEach(() => { definirFabricaGraphMessenger(null); ClienteGraphMessengerDuble.reiniciar(); });
  it('identifica a Página de forma determinística e confere o segredo', async () => {
    const cliente = clienteGraphMessenger('pagina-teste');
    expect((await cliente.buscarPagina()).id).toBe(ClienteGraphMessengerDuble.idDaPagina('pagina-teste'));
    expect(await cliente.conferirSegredoDoApp('ab'.repeat(16))).toBe(true);
    expect(await cliente.conferirSegredoDoApp(`bad${'0'.repeat(29)}`)).toBe(false);
  });
  it('traduz PSID, postback e mídia, mas ignora echo', () => {
    const payload = { object: 'page', entry: [{ id: 'pagina', messaging: [
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, message: { mid: 'mid-1', text: 'Olá' } },
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, postback: { mid: 'mid-2', title: 'Começar' } },
      { sender: { id: 'pagina' }, message: { mid: 'eco', text: 'não entra', is_echo: true } },
      { sender: { id: 'psid' }, message: { mid: 'mid-3', attachments: [{ type: 'image', payload: { url: 'https://imagem.teste/a.jpg' } }] } },
    ] }] };
    expect(payloadDoMessenger(payload)).toBe(true);
    expect(valoresDoMessenger(payload, 'pagina')[0]?.messages).toMatchObject([
      { from: 'psid', id: 'mid-1', text: { body: 'Olá' } }, { id: 'mid-2', text: { body: 'Começar' } }, { id: 'mid-3', image: { url: 'https://imagem.teste/a.jpg' } },
    ]);
  });
  it('descarta eventos de outra Página', () => expect(valoresDoMessenger({ object: 'page', entry: [{ id: 'outra', messaging: [] }] }, 'pagina')).toEqual([]));
});

describe('Messenger com banco, webhook e worker', () => {
  const segredo = 'ab'.repeat(16);
  const sufixo = randomUUID().slice(0, 8);
  let dono: ReturnType<typeof criarBanco>;
  let api: Awaited<ReturnType<typeof subirApi>>;
  let A: { tenantId: string; adminId: string };
  let B: { tenantId: string; adminId: string };
  let canalId: string;
  let paginaId: string;
  const controlador = new ControladorCanaisMessenger();

  async function tenant(nome: string) {
    const { tenantId } = await semear(dono, { nome: `messenger ${nome}`, slug: `messenger-${nome}` });
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email) values (${tenantId}::uuid, 'Admin', ${`admin-${nome}@pipe.app`}) returning id
    `);
    const adminId = rows[0]!.id;
    await dono.execute(sql`insert into usuario_papel (tenant_id, usuario_id, papel_id)
      select ${tenantId}::uuid, ${adminId}::uuid, id from papel
       where tenant_id = ${tenantId}::uuid and nome = 'administrador'`);
    return { tenantId, adminId };
  }

  const requisicao = (q: { tenantId: string; adminId: string }) =>
    ({ sessao: { tenantId: q.tenantId, usuarioId: q.adminId, origem: 'google' } }) as unknown as RequisicaoComSessao;

  async function linhas<T extends Record<string, unknown>>(consulta: ReturnType<typeof sql>) {
    return (await dono.execute(consulta)).rows as T[];
  }

  async function conectar(q: { tenantId: string; adminId: string }, token: string, appSecret = segredo) {
    return controlador.manual(requisicao(q), { access_token: token, app_secret: appSecret });
  }

  function payload(mid: string, de = 'psid-1') {
    return { object: 'page', entry: [{ id: paginaId, messaging: [{ sender: { id: de }, recipient: { id: paginaId }, timestamp: Date.now(), message: { mid, text: 'Olá' } }] }] };
  }

  async function postar(corpo: unknown, chave = segredo) {
    const bruto = JSON.stringify(corpo);
    return fetch(`${api.url}/webhooks/messenger/${canalId}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', chave).update(bruto).digest('hex')}` }, body: bruto,
    });
  }

  beforeAll(async () => {
    await migrar(process.env['DATABASE_URL']!);
    dono = criarBanco({ url: process.env['DATABASE_URL']!, maxConexoes: 2 });
    A = await tenant(`a-${sufixo}`); B = await tenant(`b-${sufixo}`); api = await subirApi(0);
    const ligado = await conectar(A, `ok-${sufixo}`); canalId = ligado.id; paginaId = ligado.paginaId!;
  }, 180_000);
  afterAll(async () => { await api?.fechar(); await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`); await fecharBanco(dono); });
  beforeEach(() => { ClienteGraphMessengerDuble.reiniciar(); dubleMessenger.reiniciar(); });

  it('recusa token inválido, App Secret ausente ou fora do formato e cifra credenciais', async () => {
    await expect(conectar(A, `invalido-${sufixo}`)).rejects.toMatchObject({ status: 422 });
    await expect(controlador.manual(requisicao(A), { access_token: 'ok', app_secret: undefined })).rejects.toMatchObject({ status: 422 });
    await expect(controlador.manual(requisicao(A), { access_token: 'ok', app_secret: 'curto' })).rejects.toMatchObject({ status: 422 });
    const canal = await lerCanalMessenger(A.tenantId, canalId);
    expect(canal.config['tokenAcesso']).toBe(`ok-${sufixo}`);
    const [linha] = await linhas<{ config: Record<string, unknown> }>(sql`select config from canal where id=${canalId}::uuid`);
    expect(estaCifrado(String(linha!.config['tokenAcesso']))).toBe(true);
    expect(estaCifrado(String(linha!.config['appSecret']))).toBe(true);
  });

  it('recusa a mesma página em outro tenant e mantém isolamento ao desconectar', async () => {
    await expect(conectar(B, `ok-${sufixo}`)).rejects.toMatchObject({ status: 422 });
    await expect(controlador.desconectar(requisicao(B), canalId)).rejects.toMatchObject({ status: 404 });
    const desligado = await controlador.desconectar(requisicao(A), canalId);
    expect(desligado.estado).toBe('desligado');
    expect(ClienteGraphMessengerDuble.chamadas).toContainEqual({ acao: 'desassinar', paginaId });
  });

  it('verifica desafio, recusa assinatura inválida e enfileira corpo válido sem duplicar mid', async () => {
    const ligado = await conectar(A, `novo-${sufixo}`); canalId = ligado.id; paginaId = ligado.paginaId!;
    const certo = await fetch(`${api.url}/webhooks/messenger/${canalId}?hub.mode=subscribe&hub.verify_token=${ligado.webhook.verifyToken}&hub.challenge=42`);
    expect(certo.status).toBe(200); expect(await certo.text()).toBe('42');
    expect((await postar(payload('mid-invalido'), 'cd'.repeat(16))).status).toBe(401);
    expect((await postar(payload('mid-1'))).status).toBe(200);
    expect((await postar(payload('mid-1'))).status).toBe(200);
    const mensagens = await linhas<{ id_provedor: string; conversa_id: string }>(sql`select id_provedor, conversa_id from mensagem where id_provedor='mid-1'`);
    expect(mensagens).toHaveLength(1);
    const [contato] = await linhas<{ telefone_e164: string | null }>(sql`select c.telefone_e164 from contato c join contato_identidade i on i.contato_id=c.id where i.identificador='psid-1'`);
    expect(contato!.telefone_e164).toBeNull();
    const enviada = await enviarMensagem({ tenantId: A.tenantId, conversaId: mensagens[0]!.conversa_id, texto: 'Olá de volta' });
    expect((await processarOutbox()).find((r) => r.mensagemId === enviada.id)).toMatchObject({ estado: 'enviada' });
    expect(dubleMessenger.chamadas).toContainEqual(expect.objectContaining({ para: 'psid-1', tipo: 'texto' }));
  });

  it('ignora echo e aplica Começar e menu persistente no perfil da Página', async () => {
    const canal = await lerCanalMessenger(A.tenantId, canalId);
    await aplicarPerfilMessenger(canal, { get_started: { payload: 'PIPE_COMECAR' }, greeting: [{ locale: 'default', text: 'Bem-vindo' }] });
    await aplicarPerfilMessenger(canal, { persistent_menu: [{ locale: 'default', call_to_actions: [{ type: 'web_url', title: 'Ajuda', url: 'https://pipe.test/ajuda' }] }] });
    expect(ClienteGraphMessengerDuble.chamadas).toEqual([
      { acao: 'perfil', perfil: { get_started: { payload: 'PIPE_COMECAR' }, greeting: [{ locale: 'default', text: 'Bem-vindo' }] } },
      { acao: 'perfil', perfil: { persistent_menu: [{ locale: 'default', call_to_actions: [{ type: 'web_url', title: 'Ajuda', url: 'https://pipe.test/ajuda' }] }] } },
    ]);
  });
});
