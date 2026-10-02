import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { noTenant } = await import('../src/database.js');
const { chooseForQueue } = await import('../src/domain/distribution.js');
const { atender } = await import('../src/domain/desk/actions.js');
const { Campos } = await import('../src/domain/management/actions/campos.js');
const { transferConversation, alternarEspera } = await import('../src/domain/conversation.js');
const { sendMessage } = await import('../src/domain/envio.js');
const { comPadroes, CONFIG_PADRAO } = await import('../src/domain/management/atendimento-config.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let gestor: string;
let semPoder: string;
let gestorDoB: string;
let sessaoDoAgente: string;

async function sessaoDe(c: Cenario, userId: string): Promise<string> {
  const novo = createToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')`);
  return novo.token;
}

async function pessoaCom(c: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${c.tenantId}, ${`Pessoa ${marca}`}, ${`p-${marca}@e2e.pipe.app`}) returning id`);
  const userId = rows[0]!.id;
  if (permissions.length > 0) {
    const papel = await c.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${c.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id`);
    for (const codigo of permissions) {
      await c.dono.execute(sql`insert into permissao (codigo, descricao, grupo) values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing`);
      await c.dono.execute(sql`insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${c.tenantId}, ${papel.rows[0]!.id}, ${codigo})`);
    }
    await c.dono.execute(sql`insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${c.tenantId}, ${userId}, ${papel.rows[0]!.id})`);
  }
  return sessaoDe(c, userId);
}

async function pedir(metodo: string, caminho: string, sessao: string, corpo?: unknown): Promise<{ status: number; body: Corpo }> {
  const r = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: { cookie: `${NOME_DO_COOKIE}=${sessao}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : undefined };
}

const CAMINHO = '/v1/management/settings/attendance';
const gravar = (sessao: string, corpo: unknown) => pedir('PUT', CAMINHO, sessao, corpo);

/** Grava direto o documento do tenant do teste (os consumidores leem dele). */
const definir = (c: Cenario, doc: Corpo) =>
  c.dono.execute(sql`update tenant set configuracao_atendimento = ${JSON.stringify(doc)}::jsonb where id = ${c.tenantId}::uuid`);

async function conversaDoAgente(c: Cenario, extra: { janela?: boolean } = {}): Promise<string> {
  const ct = await c.dono.execute<{ id: string }>(sql`insert into contato (tenant_id, nome) values (${c.tenantId}::uuid, 'Cliente') returning id`);
  const r = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em, janela_expira_em)
    values (${c.tenantId}::uuid, ${c.inboxId}::uuid, ${ct.rows[0]!.id}::uuid, ${c.queueId}::uuid, ${c.agentId}::uuid,
            'Open', now(), ${extra.janela === false ? null : sql`now() + interval '1 hour'`})
    returning id`);
  return r.rows[0]!.id;
}

beforeAll(async () => {
  a = await montarCenario(`sa-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`sa-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  gestor = await pessoaCom(a, ['tenant.configurar']);
  semPoder = await pessoaCom(a, []);
  gestorDoB = await pessoaCom(b, ['tenant.configurar']);
  sessaoDoAgente = await sessaoDe(a, a.agentId);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET/PUT settings/attendance', () => {
  it('devolve os padrões quando nada foi gravado', async () => {
    const r = await pedir('GET', CAMINHO, gestor);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(JSON.parse(JSON.stringify(CONFIG_PADRAO)));
    expect(r.body.modoEspera.ativo).toBe(true);
  });

  it('grava só as seções enviadas, devolve o documento e audita antes e depois', async () => {
    const r = await gravar(gestor, { esconderAguardando: { ativo: true } });
    expect(r.status).toBe(200);
    expect(r.body.esconderAguardando).toEqual({ ativo: true });
    expect(r.body.modoEspera).toEqual({ ativo: true });
    const log = await a.dono.execute<{ antes: Corpo; depois: Corpo }>(sql`
      select antes, depois from log_auditoria where objeto_tipo = 'tenant' and objeto_id = ${a.tenantId}::uuid order by em desc limit 1`);
    expect(log.rows[0]!.antes).toEqual({ esconderAguardando: { ativo: false } });
    expect(log.rows[0]!.depois).toEqual({ esconderAguardando: { ativo: true } });
    await gravar(gestor, { esconderAguardando: { ativo: false } });
  });

  it('valida o encerramento automático global como o da fila, ou aceita null', async () => {
    const boa = {
      ativo: true, tempo: 20, unidade: 'minutos', soSePrimeiroAtendimento: false, naoSeAguardandoAtendente: false,
      removerDaTela: false, alerta: { ativo: false, mensagem: '', antecedencia: 1, unidade: 'minutos' }, tags: { ativo: false, tags: [] },
    };
    const ok = await gravar(gestor, { encerramentoAutomatico: boa });
    expect(ok.status).toBe(200);
    expect(ok.body.encerramentoAutomatico).toMatchObject({ ativo: true, tempo: 20 });
    expect((await gravar(gestor, { encerramentoAutomatico: { ...boa, tempo: 0 } })).status).toBe(400);
    expect((await gravar(gestor, { encerramentoAutomatico: { ...boa, extra: 1 } })).body.error.code).toBe('config_key_unknown');
    expect((await gravar(gestor, { encerramentoAutomatico: null })).body.encerramentoAutomatico).toBeNull();
  });

  it('recusa seção e chave desconhecidas, chave faltando, tipo errado, valor fora da faixa e corpo vazio', async () => {
    expect((await gravar(gestor, { inventada: {} })).body.error.code).toBe('config_section_unknown');
    expect((await gravar(gestor, { modoEspera: { ativo: true, x: 1 } })).body.error.code).toBe('config_key_unknown');
    expect((await gravar(gestor, { modoEspera: {} })).body.error.code).toBe('config_key_missing');
    expect((await gravar(gestor, { modoEspera: { ativo: 'sim' } })).status).toBe(400);
    expect((await gravar(gestor, { distribuicao: { modo: 'x', atendimentosPorAtendente: 0, bloquearSolicitacaoManual: false } })).status).toBe(400);
    expect((await gravar(gestor, { distribuicao: { modo: 'menos_ativos', atendimentosPorAtendente: -1, bloquearSolicitacaoManual: false } })).status).toBe(400);
    expect((await gravar(gestor, { mensagensAtivas: { ativo: true, limitePorDisparo: 16 } })).status).toBe(400);
    expect((await gravar(gestor, {})).body.error.code).toBe('config_empty');
    expect((await gravar(gestor, [])).status).toBe(400);
  });

  it('exige tenant.configurar e isola por tenant', async () => {
    expect((await gravar(semPoder, { modoEspera: { ativo: false } })).status).toBe(403);
    await gravar(gestorDoB, { modoEspera: { ativo: false } });
    expect((await pedir('GET', CAMINHO, gestor)).body.modoEspera.ativo).toBe(true);
    expect((await pedir('GET', CAMINHO, gestorDoB)).body.modoEspera.ativo).toBe(false);
  });

  it('seção corrompida no banco cai no padrão sem derrubar a leitura', () => {
    expect(comPadroes({ midia: { audio: 'x' }, modoEspera: { ativo: false } }).midia).toEqual(CONFIG_PADRAO.midia);
    expect(comPadroes({ modoEspera: { ativo: false } }).modoEspera.ativo).toBe(false);
    expect(comPadroes('lixo')).toEqual(CONFIG_PADRAO);
  });
});

describe('distribuição', () => {
  it('o limite global por atendente reduz a capacidade; 0 desliga', async () => {
    await conversaDoAgente(a);
    await definir(a, {});
    expect((await noTenant(a.tenantId, (tx) => chooseForQueue(tx, a.tenantId, a.queueId))).escolhido?.id).toBe(a.agentId);
    await definir(a, { distribuicao: { modo: 'menos_ativos', atendimentosPorAtendente: 1, bloquearSolicitacaoManual: false } });
    const r = await noTenant(a.tenantId, (tx) => chooseForQueue(tx, a.tenantId, a.queueId));
    expect(r.escolhido).toBeNull();
    expect(r.descartados[0]?.motivo).toBe('sem_vaga');
    await definir(a, { distribuicao: { modo: 'menos_ativos', atendimentosPorAtendente: 0, bloquearSolicitacaoManual: false } });
    expect((await noTenant(a.tenantId, (tx) => chooseForQueue(tx, a.tenantId, a.queueId))).escolhido?.id).toBe(a.agentId);
  });

  it('bloquear solicitação manual recusa o "Atender" do Desk', async () => {
    await definir(a, { distribuicao: { modo: 'menos_ativos', atendimentosPorAtendente: 0, bloquearSolicitacaoManual: true } });
    const r = await noTenant(a.tenantId, (tx) => atender(tx, a.tenantId, a.agentId, new Campos({})));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/desabilitada/);
    await definir(a, {});
  });
});

describe('transferência pelo Desk', () => {
  async function destino(): Promise<string> {
    const q = await a.dono.execute<{ id: string }>(sql`
      insert into fila (tenant_id, fluxo_id, nome) values (${a.tenantId}::uuid, ${a.flowId}::uuid, ${`Destino ${randomUUID().slice(0, 6)}`}) returning id`);
    return q.rows[0]!.id;
  }
  const doDesk = (conversationId: string, forQueueId?: string, forAgentId?: string) =>
    transferConversation(
      { tenantId: a.tenantId, agentId: a.agentId, requireAssignment: true },
      { conversationId, forQueueId: forQueueId ?? null, forAgentId: forAgentId ?? null, reason: null },
    );

  it('desabilitada: o atendente é recusado (409), mas Monitoramento e API seguem', async () => {
    await definir(a, { transferencia: { habilitada: false, atendentesEspecificos: true, offline: true } });
    const fila = await destino();
    await expect(doDesk(await conversaDoAgente(a), fila)).rejects.toMatchObject({ codigo: 'transfer_disabled' });
    await expect(
      transferConversation(
        { tenantId: a.tenantId, agentId: a.agentId, requireAssignment: false },
        { conversationId: await conversaDoAgente(a), forQueueId: fila, forAgentId: null, reason: null },
      ),
    ).resolves.toBeDefined();
    await definir(a, {});
  });

  it('sem "atendentes específicos" recusa transferir para pessoa, mas aceita fila', async () => {
    await definir(a, { transferencia: { habilitada: true, atendentesEspecificos: false, offline: true } });
    const outro = await a.dono.execute<{ id: string }>(sql`insert into usuario (tenant_id, nome, email) values (${a.tenantId}::uuid, 'Outro', ${`o-${randomUUID().slice(0, 6)}@e2e.pipe.app`}) returning id`);
    await expect(doDesk(await conversaDoAgente(a), undefined, outro.rows[0]!.id)).rejects.toMatchObject({ codigo: 'transfer_to_agent_disabled' });
    await expect(doDesk(await conversaDoAgente(a), await destino())).resolves.toBeDefined();
    await definir(a, {});
  });

  it('sem "offline" recusa fila sem ninguém online e aceita fila com atendente online', async () => {
    await definir(a, { transferencia: { habilitada: true, atendentesEspecificos: true, offline: false } });
    const vazia = await destino();
    await expect(doDesk(await conversaDoAgente(a), vazia)).rejects.toMatchObject({ codigo: 'transfer_offline_disabled' });
    await a.dono.execute(sql`insert into fila_atendente (tenant_id, fila_id, usuario_id) values (${a.tenantId}::uuid, ${vazia}::uuid, ${a.agentId}::uuid)`);
    await expect(doDesk(await conversaDoAgente(a), vazia)).resolves.toBeDefined();
    await definir(a, {});
  });
});

describe('mídia, emojis e Modo de Espera', () => {
  const enviar = (conversationId: string, extra: Corpo) =>
    sendMessage({ tenantId: a.tenantId, conversationId, agentId: a.agentId, exigirAtribuicao: true, ...extra });

  it('áudio, arquivos e emoji desligados são recusados com 409; ligados (padrão) passam', async () => {
    const conv = await conversaDoAgente(a);
    await definir(a, {});
    await expect(enviar(conv, { texto: 'oi 😀' })).resolves.toBeDefined();
    await definir(a, { midia: { audio: false, emoji: false, arquivos: false } });
    await expect(enviar(conv, { texto: 'oi 😀' })).rejects.toMatchObject({ codigo: 'emoji_disabled' });
    await expect(enviar(conv, { texto: 'oi 123 #1' })).resolves.toBeDefined();
    await expect(enviar(conv, { type: 'audio', texto: 'x' })).rejects.toMatchObject({ codigo: 'audio_disabled' });
    await expect(enviar(conv, { type: 'imagem', texto: 'foto' })).rejects.toMatchObject({ codigo: 'files_disabled' });
    await definir(a, {});
  });

  it('Modo de Espera desligado impede pôr o ticket em espera', async () => {
    const conv = await conversaDoAgente(a);
    await definir(a, { modoEspera: { ativo: false } });
    await expect(alternarEspera({ tenantId: a.tenantId, agentId: a.agentId, requireAssignment: true }, conv)).rejects.toMatchObject({
      codigo: 'hold_mode_disabled',
    });
    await definir(a, {});
    await expect(alternarEspera({ tenantId: a.tenantId, agentId: a.agentId, requireAssignment: true }, conv)).resolves.toBeDefined();
  });
});

describe('Desk: número de aguardando e histórico', () => {
  it('esconder aguardando devolve null; padrão devolve número', async () => {
    await definir(a, {});
    expect(typeof (await pedir('GET', '/v1/desk/queue', sessaoDoAgente)).body.aguardando).toBe('number');
    await definir(a, { esconderAguardando: { ativo: true } });
    expect((await pedir('GET', '/v1/desk/queue', sessaoDoAgente)).body.aguardando).toBeNull();
    await definir(a, {});
  });

  it('histórico desligado esvazia a consulta de atendimentos anteriores', async () => {
    const conv = await conversaDoAgente(a);
    const contato = await a.dono.execute<{ id: string }>(sql`select contato_id as id from conversa where id = ${conv}::uuid`);
    const antiga = await a.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, encerrada_em)
      values (${a.tenantId}::uuid, ${a.inboxId}::uuid, ${contato.rows[0]!.id}::uuid, ${a.queueId}::uuid, 'ClosedAttendant', now() - interval '1 day') returning id`);
    expect(antiga.rows[0]!.id).toBeDefined();
    await definir(a, {});
    const ligado = await pedir('GET', `/v1/desk/contacts/${contato.rows[0]!.id}`, sessaoDoAgente);
    expect(ligado.body.history.length).toBeGreaterThan(0);
    await definir(a, { historico: { ativo: false } });
    expect((await pedir('GET', `/v1/desk/contacts/${contato.rows[0]!.id}`, sessaoDoAgente)).body.history).toEqual([]);
    expect((await pedir('GET', `/v1/desk/conversations/${conv}`, sessaoDoAgente)).body.aberta.history).toEqual([]);
    await definir(a, {});
  });
});

describe('mensagens ativas', () => {
  const disparar = (contatos: number) =>
    pedir('POST', '/v1/messages-active', sessaoDoAgente, {
      channelId: a.channelId,
      template_id: randomUUID(),
      contacts: Array.from({ length: contatos }, (_, i) => ({ phone: `+55119888877${String(70 + i)}` })),
      parametros: ['x'],
    });

  it('desligado, o disparo é recusado com 409', async () => {
    await definir(a, { mensagensAtivas: { ativo: false, limitePorDisparo: 15 } });
    const r = await disparar(1);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('active_messages_disabled');
    await definir(a, {});
  });

  it('o limite por disparo da configuração reduz o teto', async () => {
    await definir(a, { mensagensAtivas: { ativo: true, limitePorDisparo: 2 } });
    const r = await disparar(3);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('limit_of_contacts');
    await definir(a, {});
  });
});
