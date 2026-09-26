import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';
process.env['WHATSAPP_APP_ID'] = 'app-de-teste';
process.env['WHATSAPP_APP_SECRET'] = 'segredo-do-app-da-meta';
delete process.env['WHATSAPP_API_VERSAO'];

const { createDatabase, decifrar, estaCifrado, closeDatabase, migrate, seed } = await import('@pipe/db');
const { keyring, forgetChannelesquecerChannelforgetChannel, fecharBancos, resolveChannel } = await import('../src/database.js');
const { processarPayload } = await import('../src/domain/inbound.js');
const { applyEventsOfTemplateaplicarEventsOfTemplateapplyEventsOfTemplate } = await import('../src/domain/whatsapp/events-of-template.js');
const { PipeError } = await import('../src/errors.js');
const { desconectarWhatsApp, listChannelsWhatsApp, urlDoWebhook } = await import(
  '../src/domain/channels.js'
);
const { ClienteGraphDuble, ClienteGraphReal, definirFabricaGraph } = await import(
  '../src/domain/whatsapp/cliente-graph.js'
);
const { runRegistrationEmbedded } = await import('../src/domain/whatsapp/registration-embedded.js');
const { readChannelWhatsApp } = await import('../src/domain/whatsapp/channel.js');
const { configurarWebhook } = await import('../src/domain/whatsapp/configuration-of-webhook.js');
const { runConfigurationManual } = await import('../src/domain/whatsapp/configuration-manual.js');
const { issueState } = await import('../src/domain/whatsapp/state-of-connection.js');
const { writeProfileOfChannel, readProfileOfChannel } = await import('../src/domain/whatsapp/perfil.js');
const { createTemplateInMeta, deleteTemplateInMeta, sincronizarModelos } = await import(
  '../src/domain/whatsapp/modelos.js'
);
const { formatOfQuestion, writePreferences, readPreferences } = await import(
  '../src/domain/whatsapp/preferences.js'
);
const { buscarInfoDoNumero } = await import('../src/domain/whatsapp/info-do-numero.js');
const { exchangeCode } = await import('../src/domain/whatsapp/troca-de-token.js');
const { ChannelsController } = await import('../src/controllers/channels.js');
import type { RequestWithSession } from '../src/session.js';
import type { NumeroDaWaba } from '../src/domain/whatsapp/cliente-graph.js';

/**
 * Connecting the client's WhatsApp, with a real database and without touching Meta.
 *
 * The cases follow the Chatwoot specs the connection was ported from (`spec/services/whatsapp/*_spec.rb`), plus Pipe's own: the CSRF `state`, the token cipher, and isolation between customers. The "callback" is exercised through the real controller, with the `canal.gerenciar` permission checked in the database.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const WABA = 'waba-duble-1';

type Dono = ReturnType<typeof createDatabase>;
let dono: Dono;
let A: { tenantId: string; adminId: string };
let B: { tenantId: string; adminId: string };
const controller = new ChannelsController();

async function tenantComAdmin(nome: string): Promise<{ tenantId: string; adminId: string }> {
  const { tenantId } = await seed(dono, { name: `entrada ${nome}`, slug: `entrada-${nome}` });
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}::uuid, 'Admin', ${`admin-${nome}@entrada.pipe.app`})
    returning id
  `);
  const adminId = rows[0]!.id;
  await dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    select ${tenantId}::uuid, ${adminId}::uuid, id from papel
     where tenant_id = ${tenantId}::uuid and nome = 'administrador'
  `);
  return { tenantId, adminId };
}

function request(quem: { tenantId: string; adminId: string }): RequestWithSession {
  return {
    sessao: { tenantId: quem.tenantId, usuarioId: quem.adminId, origem: 'google' },
  } as unknown as RequestWithSession;
}

async function countChannels(tenantId: string): Promise<number> {
  const { rows } = await dono.execute<{ n: string }>(
    sql`select count(*)::text as n from canal where tenant_id = ${tenantId}::uuid`,
  );
  return Number(rows[0]!.n);
}

async function configOfDatabase(canalId: string): Promise<Record<string, unknown>> {
  const { rows } = await dono.execute<{ config: Record<string, unknown> }>(
    sql`select config from canal where id = ${canalId}::uuid`,
  );
  return rows[0]!.config;
}

function chamadas(acao: string) {
  return ClienteGraphDuble.chamadas.filter((c) => c.acao === acao);
}

/** Connects through the controller, with a valid `state` from this session. */
function conectar(quem: { tenantId: string; adminId: string }, extra: Record<string, unknown>) {
  return controller.conectar(request(quem), {
    waba_id: WABA,
    state: issueState(quem.tenantId, quem.adminId),
    ...extra,
  });
}

beforeAll(async () => {
  await migrate(URL_DONO);
  dono = createDatabase({ url: URL_DONO, maxConexoes: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
}, 180_000);

afterAll(async () => {
  definirFabricaGraph(null);
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await closeDatabase(dono);
  await fecharBancos();
});

beforeEach(() => {
  definirFabricaGraph(null);
  ClienteGraphDuble.reiniciar();
  forgetChannelesquecerChannelforgetChannel();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o callback do cadastro embutido (POST /v1/channels/whatsapp), contra o dublê', () => {
  it('Create the channel and inbox, encrypt its token, and point the number webhook to its route', async () => {
    const canal = await conectar(A, { codigo: `ok-${S}` });

    expect(canal.state).toBe('conectado');
    expect(canal.ativo).toBe(true);
    expect(canal.wabaId).toBe(WABA);
    expect(canal.webhookUrl).toBe(`https://api.teste/webhooks/whatsapp/${canal.id}`);
    expect(canal.nome).toBe('Empresa de Ensaio WhatsApp');

    // // The WABA is signed BEFORE the override, with the Chatwoot fields and the three
    // // from the umbrella route; the override points to THAT channel's URL.
    const order = ClienteGraphDuble.chamadas.map((c) => c.acao);
    expect(order.indexOf('assinar')).toBeLessThan(order.indexOf('override'));
    expect(chamadas('assinar')[0]?.campos).toEqual(
      expect.arrayContaining(['messages', 'smb_message_echoes', 'account_update']),
    );
    expect(chamadas('override')[0]?.url).toBe(urlDoWebhook(canal.id));
    // // Number already verified and provisioned: doesn't register (webhook_setup_service_spec).
    expect(chamadas('registrar')).toHaveLength(0);

    // // Token and verify_token live ENCRYPTED. This is what a `pg_dump` would see.
    const config = await configOfDatabase(canal.id);
    expect(estaCifrado(String(config['tokenAcesso']))).toBe(true);
    expect(estaCifrado(String(config['verifyToken']))).toBe(true);
    expect(decifrar(String(config['verifyToken']), keyring())).toMatch(/^[0-9a-f]{32}$/);
    expect(config['origem']).toBe('embedded_signup');

    const { rows } = await dono.execute<{ name: string; queueDefaultId: string | null }>(
      sql`select nome, fila_padrao_id from inbox where canal_id = ${canal.id}::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Empresa de Ensaio WhatsApp');
    expect(rows[0]!.fila_padrao_id).not.toBeNull();
  });

  it('Reject missing, forged, cross-session, or expired state before calling Meta', async () => {
    const antes = await countChannels(A.tenantId);
    const onzeMinutosAtras = Date.now() - 11 * 60 * 1000;
    const estados = [
      undefined,
      'forjado',
      issueState(B.tenantId, B.adminId),
      issueState(A.tenantId, B.adminId),
      issueState(A.tenantId, A.adminId, onzeMinutosAtras),
    ];
    for (const state of estados) {
      await expect(
        controller.conectar(request(A), { codigo: `csrf-${S}`, waba_id: WABA, state }),
      ).rejects.toMatchObject({ codigo: 'estado_invalido', status: 403 });
    }
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
    expect(await countChannels(A.tenantId)).toBe(antes);
  });

  it('Create no channel when Meta denies WABA phone-number access', async () => {
    const antes = await countChannels(A.tenantId);
    await expect(conectar(A, { codigo: `sem-permissao-${S}` })).rejects.toMatchObject({
      codigo: 'meta_recusou',
      detalhe: { codigo_meta: 200 },
    });
    expect(chamadas('override')).toHaveLength(0);
    expect(await countChannels(A.tenantId)).toBe(antes);
  });

  it('Reject a number already used by another tenant with the expected Chatwoot message', async () => {
    const codigo = `disputado-${S}`;
    await conectar(A, { codigo });
    const antes = await countChannels(B.tenantId);

    const erro = await conectar(B, { codigo }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'numero_em_uso', status: 409 });
    expect((erro as Error).message).toContain('Já existe um canal para este número de telefone');
    expect(await countChannels(B.tenantId)).toBe(antes);
  });

  it('parâmetros ausentes: a mesma recusa do original, antes de falar com a Meta', async () => {
    await expect(conectar(A, { codigo: '', waba_id: '' })).rejects.toMatchObject({
      codigo: 'parametros_ausentes',
      message: 'Parâmetros obrigatórios ausentes: code, waba_id',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });

  it('Return 404 without revealing another tenant\'s channel during reauthorization', async () => {
    const deA = await conectar(A, { codigo: `alheio-${S}` });
    await expect(conectar(B, { codigo: `alheio-${S}`, canal_id: deA.id })).rejects.toMatchObject({
      codigo: 'nao_encontrado',
      status: 404,
    });
  });
});

describe('troca de token (token_exchange_service_spec)', () => {
  it('devolve o token', async () => {
    expect(await exchangeCode(`troca-${S}`)).toMatch(/^duble-token-\d{11}$/);
  });

  it('código em branco é recusado sem falar com a Meta', async () => {
    await expect(exchangeCode('')).rejects.toMatchObject({
      codigo: 'codigo_ausente',
      message: 'O código de autorização é obrigatório.',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });

  it('Reject a code exchange response without access_token', async () => {
    await expect(exchangeCode('sem-token-1')).rejects.toMatchObject({ codigo: 'meta_sem_token' });
  });
});

describe('info do número (phone_info_service_spec)', () => {
  function comNumeros(numeros: NumeroDaWaba[]): void {
    class ComLista extends ClienteGraphDuble {
      override buscarTodosOsNumeros(): Promise<NumeroDaWaba[]> {
        return Promise.resolve(numeros);
      }
    }
    definirFabricaGraph((t) => new ComLista(t));
  }
  const um = (id: string, numero: string, nome: string): NumeroDaWaba => ({
    id,
    display_phone_number: numero,
    verified_name: nome,
    code_verification_status: 'VERIFIED',
  });

  it('devolve o número formatado', async () => {
    comNumeros([um('pn-1', '1234567890', 'Test Business')]);
    expect(await buscarInfoDoNumero('waba', 'pn-1', 'tok')).toEqual({
      numeroId: 'pn-1',
      numero: '+1234567890',
      verificado: true,
      nomeDaEmpresa: 'Test Business',
    });
  });

  it('sem phone_number_id e um número só: usa esse', async () => {
    comNumeros([um('primeiro', '1234567890', 'X')]);
    expect((await buscarInfoDoNumero('waba', undefined, 'tok')).numeroId).toBe('primeiro');
  });

  it('phone_number_id informado e ausente da WABA: recusa em vez de cair para outro número', async () => {
    comNumeros([um('outro', '9876543210', 'Y')]);
    await expect(buscarInfoDoNumero('waba', 'diferente', 'tok')).rejects.toMatchObject({
      codigo: 'numero_nao_encontrado',
    });
  });

  it('Reject an ambiguous WABA with multiple numbers when no number ID is supplied', async () => {
    comNumeros([um('a', '1234567890', 'A'), um('b', '9876543210', 'B')]);
    await expect(buscarInfoDoNumero('waba', undefined, 'tok')).rejects.toMatchObject({
      codigo: 'numero_ambiguo',
    });
  });

  it('Match the expected phone number during reauthorization without phone_number_id', async () => {
    comNumeros([um('outro', '9876543210', 'O'), um('alvo', '1112223333', 'T')]);
    const info = await buscarInfoDoNumero('waba', undefined, 'tok', '+1112223333');
    expect(info).toMatchObject({ numeroId: 'alvo', numero: '+1112223333' });
  });

  it('Reject a WABA with no phone numbers', async () => {
    comNumeros([]);
    await expect(buscarInfoDoNumero('waba', 'x', 'tok')).rejects.toMatchObject({
      codigo: 'waba_sem_numero',
    });
  });

  it('WABA ou token em branco são recusados', async () => {
    await expect(buscarInfoDoNumero('', 'x', 'tok')).rejects.toMatchObject({ codigo: 'waba_ausente' });
    await expect(buscarInfoDoNumero('w', 'x', '')).rejects.toMatchObject({ codigo: 'token_ausente' });
  });

  it('limpa espaço, hífen, parêntese e o +', async () => {
    comNumeros([um('pn', '+1 (234) 567-8900', 'Z')]);
    expect((await buscarInfoDoNumero('waba', 'pn', 'tok')).numero).toBe('+12345678900');
  });
});

describe('Configure the channel webhook (`webhook_setup_service_spec`)', () => {
  it('Register an unverified number with a six-digit PIN and store the PIN encrypted', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'numeroVerificado').mockResolvedValue(false);
    const canal = await conectar(A, { codigo: `pin-${S}` });

    const registro = chamadas('registrar');
    expect(registro).toHaveLength(1);
    expect(registro[0]!.pin).toMatch(/^[1-9]\d{5}$/);

    const config = await configOfDatabase(canal.id);
    expect(estaCifrado(String(config['pinVerificacao']))).toBe(true);
    expect(decifrar(String(config['pinVerificacao']), keyring())).toBe(registro[0]!.pin);

    // // PIN already stored: the next setup reuses it, doesn't roll a new one.
    ClienteGraphDuble.reiniciar();
    await configurarWebhook(await readChannelWhatsApp(A.tenantId, canal.id));
    expect(chamadas('registrar')[0]?.pin).toBe(registro[0]!.pin);
  });

  it('coexistência: não registra e nem pergunta a saúde', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'numeroVerificado').mockResolvedValue(false);
    await runRegistrationEmbedded({
      tenantId: A.tenantId,
      userId: A.adminId,
      codigo: `coexistencia-${S}`,
      wabaId: WABA,
      coexistencia: true,
    });
    expect(chamadas('registrar')).toHaveLength(0);
    expect(chamadas('buscar_numero')).toHaveLength(0);
    expect(chamadas('override')).toHaveLength(1);
  });

  it('registro que falha não bloqueia: o webhook é configurado assim mesmo', async () => {
    const canal = await conectar(A, { codigo: `registro-ruim-${S}` });
    vi.spyOn(ClienteGraphDuble.prototype, 'numeroVerificado').mockResolvedValue(false);
    vi.spyOn(ClienteGraphDuble.prototype, 'registrarNumero').mockRejectedValue(
      new PipeError(502, 'meta_refused', 'O registro do número falhou: PIN'),
    );
    ClienteGraphDuble.reiniciar();

    const resultado = await configurarWebhook(await readChannelWhatsApp(A.tenantId, canal.id));
    expect(resultado.errorOfRecord?.message).toContain('O registro do número falhou');
    expect(chamadas('override')).toHaveLength(1);
  });

  it('Keep a channel whose webhook setup fails and mark it for reauthorization (`embedded_signup_service_spec`)', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'sobrescreverCallbackDoNumero').mockRejectedValue(
      new PipeError(502, 'meta_refused', 'Invalid access token'),
    );
    const canal = await conectar(A, { codigo: `webhook-ruim-${S}` });
    expect(canal).toMatchObject({ estado: 'indisponivel', motivo: 'reautorizacao_pendente' });

    await expect(
      configurarWebhook(await readChannelWhatsApp(A.tenantId, canal.id)),
    ).rejects.toMatchObject({
      codigo: 'webhook_falhou',
      message: expect.stringMatching(/Falha ao configurar o webhook: .*Invalid access token/),
    });

    const lista = await listChannelsWhatsApp(A.tenantId);
    expect(lista.find((c) => c.id === canal.id)).toMatchObject({
      estado: 'indisponivel',
      motivo: 'reautorizacao_pendente',
    });
  });

  it('Reject a channel without a WABA before calling Meta', async () => {
    const canal = await conectar(A, { codigo: `sem-waba-${S}` });
    const lido = await readChannelWhatsApp(A.tenantId, canal.id);
    ClienteGraphDuble.reiniciar();
    await expect(configurarWebhook({ ...lido, wabaId: null })).rejects.toMatchObject({
      codigo: 'waba_ausente',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });
});

describe('Reauthorize disconnected WhatsApp channels (`reauthorization_service_spec`)', () => {
  it('Reconnect a disconnected channel by canal_id without creating a duplicate', async () => {
    const codigo = `volta-${S}`;
    const first = await conectar(A, { codigo });
    await desconectarWhatsApp(A.tenantId, A.adminId, first.id);
    const antes = await countChannels(A.tenantId);

    const segunda = await conectar(A, { codigo, canal_id: first.id });
    expect(segunda.id).toBe(first.id);
    expect(segunda).toMatchObject({ ativo: true, estado: 'conectado', mensagem: 'Reautorização concluída.' });
    expect(await countChannels(A.tenantId)).toBe(antes);
  });

  it('Reject a phone number that does not match the channel', async () => {
    const canal = await conectar(A, { codigo: `um-numero-${S}` });
    // // With the other number's `phone_number_id`, Meta finds it and reauthorization rejects the swap.
    await expect(
      conectar(A, {
        codigo: `outro-numero-${S}`,
        canal_id: canal.id,
        phone_number_id: ClienteGraphDuble.sufixo(`outro-numero-${S}`),
      }),
    ).rejects.toMatchObject({ codigo: 'numero_divergente' });
    // // Without it, it matches by the channel's number — which isn't in that WABA.
    await expect(
      conectar(A, { codigo: `outro-numero-${S}`, canal_id: canal.id }),
    ).rejects.toMatchObject({ codigo: 'numero_nao_encontrado' });
  });
});

describe('Validate manual channel configuration (`manual_setup_validation_service_spec`)', () => {
  const numeroId = ClienteGraphDuble.sufixo(`manual-${S}`);
  const token = `manual-${numeroId}`;
  /** The client app's App Secret: 32 hex characters. `bad…` the double treats as belonging to another app. */
  const appSecret = 'a'.repeat(32);
  const base = () => ({
    tenantId: A.tenantId,
    usuarioId: A.adminId,
    wabaId: 'waba-m',
    numeroId,
    token,
    appSecret,
  });

  it('Reject a token without messaging permission using Meta\'s message', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'buscarPermissoes').mockResolvedValue({ data: [] });
    await expect(runConfigurationManual(base())).rejects.toMatchObject({
      codigo: 'configuracao_invalida',
      message: expect.stringContaining('whatsapp_business_messaging'),
    });
  });

  it('Phone Number ID que não é da WABA: recusado', async () => {
    await expect(runConfigurationManual({ ...base(), numeroId: 'outro' })).rejects.toMatchObject({
      message: 'Este Phone Number ID não pertence ao WABA ID informado.',
    });
  });

  it('Require a correctly formatted App Secret belonging to the token\'s app', async () => {
    await expect(runConfigurationManual({ ...base(), appSecret: undefined })).rejects.toMatchObject({
      message: 'O App Secret é obrigatório.',
    });
    await expect(runConfigurationManual({ ...base(), appSecret: 'curto' })).rejects.toMatchObject({
      message: 'O App Secret tem 32 caracteres, só números e letras de a a f.',
    });
    await expect(
      runConfigurationManual({ ...base(), appSecret: `bad${'0'.repeat(29)}` }),
    ).rejects.toMatchObject({ message: 'Este App Secret não é do aplicativo que gerou o token.' });
    expect(chamadas('override')).toHaveLength(0);
  });

  it('Save the customer app and secret, return the webhook, and keep the number on disconnect', async () => {
    const feito = await runConfigurationManual({ ...base(), nome: 'Suporte manual' });
    expect(feito.webhookError).toBeNull();
    expect(feito.channel.nome).toBe('Suporte manual');
    expect(feito.channel.config['origem']).toBe('manual_setup_v2');
    // // This channel's webhook checks the signature with the client app's secret, not ours.
    expect(feito.channel.config['appSecret']).toBe(appSecret);
    expect(feito.channel.config['appId']).toMatch(/^app-/);
    expect(feito.webhook).toEqual({
      url: urlDoWebhook(feito.channel.id),
      verifyToken: feito.channel.config['verifyToken'],
    });
    expect(estaCifrado(String((await configOfDatabase(feito.channel.id))['appSecret']))).toBe(true);

    ClienteGraphDuble.reiniciar();
    await desconectarWhatsApp(A.tenantId, A.adminId, feito.channel.id);
    expect(chamadas('limpar_override')).toHaveLength(1);
    expect(chamadas('descadastrar')).toHaveLength(0);
    expect(chamadas('desassinar')).toHaveLength(0);
  });
});

describe('perfil do número (GET/PATCH /v1/channels/whatsapp/:id/perfil)', () => {
  const PNG = `data:image/png;base64,${Buffer.from('png-de-ensaio').toString('base64')}`;

  it('Read an empty profile, update only supplied fields, upload its photo, and audit the change', async () => {
    const canal = await conectar(A, { codigo: `perfil-${S}` });
    const antes = await readProfileOfChannel(A.tenantId, canal.id);
    expect(antes).toMatchObject({
      sobre: '',
      sites: [],
      fotoUrl: null,
      nome: { exibicao: 'Empresa de Ensaio' },
    });

    const depois = await writeProfileOfChannel(A.tenantId, A.adminId, canal.id, {
      sobre: '  Atendimento de seg a sex  ',
      sites: ['https://pipe.app'],
      categoria: 'PROF_SERVICES',
      foto: PNG,
    });
    expect(depois).toMatchObject({
      sobre: 'Atendimento de seg a sex',
      sites: ['https://pipe.app'],
      categoria: 'PROF_SERVICES',
      descricao: '',
    });
    // Embutido: a foto sobe no NOSSO app (o do ambiente).
    expect(depois.fotoUrl).toContain('app-de-teste-');
    expect(chamadas('subir_foto')).toHaveLength(1);

    // // A missing field isn't touched.
    const deNovo = await writeProfileOfChannel(A.tenantId, A.adminId, canal.id, { descricao: 'Escola' });
    expect(deNovo).toMatchObject({ sobre: 'Atendimento de seg a sex', descricao: 'Escola' });

    const { rows } = await dono.execute<{ n: string }>(sql`
      select count(*)::text as n from log_auditoria
       where objeto_id = ${canal.id}::uuid and acao = 'alterou'
    `);
    expect(Number(rows[0]!.n)).toBe(2);
  });

  it('recusas apontam o campo errado e não chegam à Meta', async () => {
    const canal = await conectar(A, { codigo: `perfil-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const gravar = (p: object) => writeProfileOfChannel(A.tenantId, A.adminId, canal.id, p);
    await expect(gravar({})).rejects.toMatchObject({ codigo: 'nada_para_gravar' });
    await expect(gravar({ sobre: '' })).rejects.toMatchObject({ detalhe: { campo: 'sobre' } });
    await expect(gravar({ sobre: 'x'.repeat(140) })).rejects.toMatchObject({ detalhe: { campo: 'sobre' } });
    await expect(gravar({ descricao: 'x'.repeat(513) })).rejects.toMatchObject({
      detalhe: { campo: 'descricao' },
    });
    await expect(gravar({ email: 'sem-arroba' })).rejects.toMatchObject({ detalhe: { campo: 'email' } });
    await expect(gravar({ sites: ['https://a', 'https://b', 'https://c'] })).rejects.toMatchObject({
      detalhe: { campo: 'sites' },
    });
    await expect(gravar({ sites: ['pipe.app'] })).rejects.toMatchObject({ detalhe: { campo: 'sites' } });
    await expect(gravar({ categoria: 'escola' })).rejects.toMatchObject({ detalhe: { campo: 'categoria' } });
    await expect(gravar({ foto: 'data:image/gif;base64,R0lG' })).rejects.toMatchObject({
      detalhe: { campo: 'foto' },
    });
    const grande = `data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(gravar({ foto: grande })).rejects.toMatchObject({ detalhe: { campo: 'foto' } });
    expect(chamadas('gravar_perfil')).toHaveLength(0);
  });

  it('Return 404 for another tenant\'s channel and require `canal.gerenciar`', async () => {
    const canal = await conectar(A, { codigo: `perfil-b-${S}` });
    await expect(readProfileOfChannel(B.tenantId, canal.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      writeProfileOfChannel(B.tenantId, B.adminId, canal.id, { sobre: 'invasão' }),
    ).rejects.toMatchObject({ status: 404 });

    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${A.tenantId}::uuid, 'Sem papel', ${`sem-papel-${S}@entrada.pipe.app`}) returning id
    `);
    const withoutRole = request({ tenantId: A.tenantId, adminId: rows[0]!.id });
    await expect(controller.perfil(withoutRole, canal.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe('Synchronize, create, and delete Meta message templates', () => {
  async function templatesLocations(channelId: string) {
    const { rows } = await dono.execute<{
      name: string;
      idioma: string;
      status_meta: string;
      category: string;
      cabecalho_tipo: string;
      variables: string[];
    }>(sql`
      select nome, idioma, status_meta, categoria, cabecalho_tipo, variaveis
        from template_mensagem where canal_id = ${channelId}::uuid order by nome, idioma
    `);
    return rows;
  }

  it('Create a Meta template with examples, mark it pending, and sync status and deletions', async () => {
    const canal = await conectar(A, { codigo: `modelos-${S}` });
    const criado = await createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'boas_vindas',
      categoria: 'utilidade',
      cabecalho: 'Olá {{1}}',
      exemploDoCabecalho: 'Ana',
      corpo: 'Seu protocolo é {{1}} e vence em {{2}}.',
      exemplos: ['123', '10/10'],
      rodape: 'Pipe',
    });
    expect(criado.statusMeta).toBe('pendente');
    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)![0]!;
    expect(enviado.category).toBe('UTILITY');
    expect(enviado.components).toEqual([
      { type: 'HEADER', format: 'TEXT', text: 'Olá {{1}}', example: { header_text: ['Ana'] } },
      { type: 'BODY', text: 'Seu protocolo é {{1}} e vence em {{2}}.', example: { body_text: [['123', '10/10']] } },
      { type: 'FOOTER', text: 'Pipe' },
    ]);
    expect(await templatesLocations(canal.id)).toMatchObject([
      { nome: 'boas_vindas', status_meta: 'pendente', cabecalho_tipo: 'texto', variaveis: ['1', '2'] },
    ]);

    // // On Meta: approved, and a second template created out there shows up; a third of unknown category.
    enviado.status = 'APPROVED';
    ClienteGraphDuble.modelos.get(canal.wabaId!)!.push(
      {
        name: 'promo',
        language: 'pt_BR',
        status: 'REJECTED',
        category: 'MARKETING',
        components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Oferta {{1}}' }],
      },
      { name: 'estranho', language: 'pt_BR', status: 'APPROVED', category: 'NOVA_CATEGORIA' },
    );
    const primeira = await sincronizarModelos(A.tenantId, A.adminId, canal.id);
    expect(primeira).toEqual({ criados: 1, atualizados: 1, removidos: 0, ignorados: 1 });
    expect(await templatesLocations(canal.id)).toMatchObject([
      // // The variable names stay: the count didn't change.
      { nome: 'boas_vindas', status_meta: 'aprovado', variaveis: ['1', '2'] },
      { nome: 'promo', status_meta: 'rejeitado', categoria: 'marketing', cabecalho_tipo: 'imagem', variaveis: ['Variável 1'] },
    ]);

    // // Deleted out there: disappears here on the next sync.
    ClienteGraphDuble.modelos.set(
      canal.wabaId!,
      ClienteGraphDuble.modelos.get(canal.wabaId!)!.filter((m) => m.name !== 'promo'),
    );
    const segunda = await sincronizarModelos(A.tenantId, A.adminId, canal.id);
    expect(segunda.removidos).toBe(1);
    expect((await templatesLocations(canal.id)).map((m) => m.name)).toEqual(['boas_vindas']);

    const excluido = await deleteTemplateInMeta(A.tenantId, A.adminId, canal.id, 'boas_vindas');
    expect(excluido).toEqual({ removidos: 1 });
    expect(await templatesLocations(canal.id)).toHaveLength(0);
    expect(ClienteGraphDuble.modelos.get(canal.wabaId!)!.some((m) => m.name === 'boas_vindas')).toBe(false);
  });

  it('recusas de formulário não chegam à Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const create = (p: object) => createTemplateInMeta(A.tenantId, A.adminId, canal.id, p);
    const ok = { nome: 'aviso', categoria: 'utilidade', corpo: 'Oi {{1}}', exemplos: ['Ana'] };
    await expect(create({ ...ok, nome: 'Com Espaço' })).rejects.toMatchObject({ detalhe: { campo: 'nome' } });
    // // Authentication category now exists (own describe below); unknown category is still rejected.
    await expect(create({ ...ok, categoria: 'promocional' })).rejects.toMatchObject({ detalhe: { campo: 'categoria' } });
    await expect(create({ ...ok, idioma: 'português' })).rejects.toMatchObject({ detalhe: { campo: 'idioma' } });
    await expect(create({ ...ok, corpo: '' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(create({ ...ok, corpo: 'x'.repeat(1025) })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(create({ ...ok, exemplos: [] })).rejects.toMatchObject({ detalhe: { campo: 'exemplos' } });
    await expect(create({ ...ok, cabecalho: '{{1}} e {{2}}' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalho' },
    });
    await expect(create({ ...ok, cabecalho: 'Oi {{1}}' })).rejects.toMatchObject({
      detalhe: { campo: 'exemploDoCabecalho' },
    });
    expect(chamadas('criar_modelo')).toHaveLength(0);
  });

  it('Return 404 for another tenant\'s channel and require `canal.gerenciar` for templates', async () => {
    const canal = await conectar(A, { codigo: `modelos-b-${S}` });
    await expect(sincronizarModelos(B.tenantId, B.adminId, canal.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteTemplateInMeta(B.tenantId, B.adminId, canal.id, 'x')).rejects.toMatchObject({ status: 404 });
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${A.tenantId}::uuid, 'Sem papel 2', ${`sem-papel-modelos-${S}@entrada.pipe.app`}) returning id
    `);
    await expect(
      controller.sincronizarModelos(request({ tenantId: A.tenantId, adminId: rows[0]!.id }), canal.id),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('Create templates with image, video, and document headers', () => {
  const dataUrl = (tipo: string, bytes: Buffer) => `data:${tipo};base64,${bytes.toString('base64')}`;
  const JPEG = dataUrl('image/jpeg', Buffer.from('jpeg-de-ensaio'));
  const PDF = dataUrl('application/pdf', Buffer.from('%PDF-1.4 de ensaio'));
  const MP4 = dataUrl('video/mp4', Buffer.from('mp4-de-ensaio'));

  it('Upload an image header through the channel app and send its handle in header_handle', async () => {
    const canal = await conectar(A, { codigo: `modelos-imagem-${S}` });
    ClienteGraphDuble.reiniciar();
    const criado = await createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'oferta_com_foto',
      categoria: 'marketing',
      headerMedia: JPEG,
      corpo: 'Oferta para {{1}}.',
      exemplos: ['Ana'],
      rodape: 'Pipe',
    });
    expect(criado.statusMeta).toBe('pendente');

    // // Uploaded ONCE, before creating — the order follows the Resumable Upload API: handle first.
    expect(ClienteGraphDuble.chamadas.map((c) => c.acao)).toEqual(['subir_foto', 'criar_modelo']);

    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)!.find((m) => m.name === 'oferta_com_foto')!;
    expect(enviado.category).toBe('MARKETING');
    const cabecalho = enviado.components![0]!;
    expect(cabecalho).toMatchObject({ type: 'HEADER', format: 'IMAGE' });
    expect(cabecalho).not.toHaveProperty('text');
    const handles = (cabecalho.example as { header_handle: string[] }).header_handle;
    expect(handles).toHaveLength(1);
    // // Embedded: the file uploads to OUR app, and the double returns `<app>-<bytes suffix>`.
    expect(handles[0]).toMatch(/^app-de-teste-\d{11}$/);
    expect(enviado.components!.slice(1)).toEqual([
      { type: 'BODY', text: 'Oferta para {{1}}.', example: { body_text: [['Ana']] } },
      { type: 'FOOTER', text: 'Pipe' },
    ]);

    const { rows } = await dono.execute<{ cabecalho_tipo: string; variaveis: string[] }>(sql`
      select cabecalho_tipo, variaveis from template_mensagem
       where canal_id = ${canal.id}::uuid and nome = 'oferta_com_foto'
    `);
    expect(rows[0]).toMatchObject({ cabecalho_tipo: 'imagem', variaveis: ['1'] });
  });

  it('Send VIDEO and DOCUMENT templates with their correct types and store those types locally', async () => {
    const canal = await conectar(A, { codigo: `modelos-video-doc-${S}` });
    ClienteGraphDuble.reiniciar();
    const base = { categoria: 'utilidade', corpo: 'Segue o material.', exemplos: [] as string[] };
    await createTemplateInMeta(A.tenantId, A.adminId, canal.id, { ...base, nome: 'com_video', headerMedia: MP4 });
    await createTemplateInMeta(A.tenantId, A.adminId, canal.id, { ...base, nome: 'com_pdf', headerMedia: PDF });

    const naMeta = ClienteGraphDuble.modelos.get(canal.wabaId!)!;
    expect(naMeta.find((m) => m.name === 'com_video')!.components![0]).toMatchObject({
      type: 'HEADER',
      format: 'VIDEO',
    });
    expect(naMeta.find((m) => m.name === 'com_pdf')!.components![0]).toMatchObject({
      type: 'HEADER',
      format: 'DOCUMENT',
    });
    expect(chamadas('subir_foto')).toHaveLength(2);

    const { rows } = await dono.execute<{ name: string; cabecalho_tipo: string }>(sql`
      select nome, cabecalho_tipo from template_mensagem
       where canal_id = ${canal.id}::uuid and nome in ('com_video', 'com_pdf') order by nome
    `);
    expect(rows).toMatchObject([
      { nome: 'com_pdf', cabecalho_tipo: 'documento' },
      { nome: 'com_video', cabecalho_tipo: 'video' },
    ]);
  });

  it('Reject unsupported media type or size before uploading or calling Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-midia-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const criar = (p: object) =>
      createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
        nome: 'recusado',
        categoria: 'marketing',
        corpo: 'Oi.',
        ...p,
      });

    // // A type outside each format's list: the message is the one the source shows in the field.
    await expect(criar({ cabecalhoMidia: dataUrl('image/gif', Buffer.from('gif')) })).rejects.toMatchObject({
      status: 422,
      detalhe: { campo: 'cabecalhoMidia' },
      message: 'A imagem do cabeçalho é compatível com JPG, JPEG ou PNG.',
    });
    await expect(criar({ cabecalhoMidia: dataUrl('video/avi', Buffer.from('avi')) })).rejects.toMatchObject({
      message: 'O vídeo do cabeçalho é compatível com MP4 até 16MB.',
    });
    await expect(criar({ cabecalhoMidia: dataUrl('text/plain', Buffer.from('txt')) })).rejects.toMatchObject({
      message: 'O documento do cabeçalho é formato PDF.',
    });

    // // Size: 5 MB for image, 16 MB for video (document is 100 MB — too big for the test).
    const imageLarge = dataUrl('image/png', Buffer.alloc(5 * 1024 * 1024 + 1));
    await expect(criar({ cabecalhoMidia: imageLarge })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
      message: 'A imagem do cabeçalho tem de ter no máximo 5 MB.',
    });
    const videoGrande = dataUrl('video/mp4', Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(criar({ cabecalhoMidia: videoGrande })).rejects.toMatchObject({
      message: 'O vídeo do cabeçalho tem de ter no máximo 16 MB.',
    });

    // // Not a data URL, is empty, or came with a text header.
    await expect(criar({ cabecalhoMidia: 'https://exemplo/foto.jpg' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
    });
    await expect(criar({ cabecalhoMidia: 'data:image/png;base64,' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
    });
    await expect(criar({ cabecalhoMidia: JPEG, cabecalho: 'Olá' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalho' },
    });

    // // Good media, bad body: the file does NOT upload — everything is checked before the upload.
    await expect(criar({ cabecalhoMidia: JPEG, corpo: '' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });

    expect(chamadas('subir_foto')).toHaveLength(0);
    expect(chamadas('criar_modelo')).toHaveLength(0);
  });
});

describe('Build Meta authentication templates with their fixed components', () => {
  it('Build authentication templates with security advice, expiry footer, copy button, and local {{1}}', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-${S}` });
    ClienteGraphDuble.reiniciar();
    const criado = await createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'codigo_de_acesso',
      categoria: 'autenticacao',
      authentication: { expiraEmMinutos: 10, textoDoBotao: 'Copiar' },
    });
    expect(criado.statusMeta).toBe('pendente');
    expect(chamadas('subir_foto')).toHaveLength(0);

    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)![0]!;
    expect(enviado.category).toBe('AUTHENTICATION');
    expect(enviado.components).toEqual([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar' }] },
    ]);
    // // None of our text goes to Meta in this category.
    expect(enviado.components!.some((c) => 'text' in c)).toBe(false);

    const { rows } = await dono.execute<{
      category: string;
      body: string;
      cabecalho_tipo: string;
      variaveis: string[];
    }>(sql`
      select categoria, corpo, cabecalho_tipo, variaveis from template_mensagem
       where canal_id = ${canal.id}::uuid and nome = 'codigo_de_acesso'
    `);
    expect(rows[0]).toMatchObject({ categoria: 'autenticacao', cabecalho_tipo: 'nenhum', variaveis: ['1'] });
    expect(rows[0]!.body).toContain('{{1}}');
    expect(rows[0]!.body).toContain('não compartilhe');
  });

  it('Default to security advice and a copy-code button without a footer, and preserve the category on sync', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-padrao-${S}` });
    ClienteGraphDuble.reiniciar();
    await createTemplateInMeta(A.tenantId, A.adminId, canal.id, { nome: 'otp', categoria: 'autenticacao' });
    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)![0]!;
    expect(enviado.components).toEqual([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }] },
    ]);

    // // Off: the field doesn't go out, and the local copy is left without the security phrase.
    await createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'otp_seco',
      categoria: 'autenticacao',
      authentication: { recommendationOfSecurity: false },
    });
    const seco = ClienteGraphDuble.modelos.get(canal.wabaId!)!.find((m) => m.name === 'otp_seco')!;
    expect(seco.components![0]).toEqual({ type: 'BODY' });
    const { rows } = await dono.execute<{ body: string }>(sql`
      select corpo from template_mensagem where canal_id = ${canal.id}::uuid and nome = 'otp_seco'
    `);
    expect(rows[0]!.body).toBe('{{1}} é seu código de verificação.');

    // // Meta approved it and returns the BODY with its own text: the sync replaces the local copy with it.
    enviado.status = 'APPROVED';
    enviado.components![0]!.text = '*{{1}}* é seu código de verificação. Para sua segurança, não compartilhe este código.';
    const resultado = await sincronizarModelos(A.tenantId, A.adminId, canal.id);
    expect(resultado).toMatchObject({ atualizados: 2, ignorados: 0 });
    const { rows: depois } = await dono.execute<{ status_meta: string; body: string; category: string }>(sql`
      select status_meta, corpo, categoria from template_mensagem
       where canal_id = ${canal.id}::uuid and nome = 'otp'
    `);
    expect(depois[0]).toMatchObject({
      status_meta: 'aprovado',
      categoria: 'autenticacao',
      corpo: '*{{1}}* é seu código de verificação. Para sua segurança, não compartilhe este código.',
    });
  });

  it('Reject free text, expiry outside 1?90 minutes, and long buttons before calling Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const criar = (p: object) =>
      createTemplateInMeta(A.tenantId, A.adminId, canal.id, { nome: 'otp', categoria: 'autenticacao', ...p });

    await expect(criar({ corpo: 'Seu código é {{1}}' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(criar({ cabecalho: 'Código' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(criar({ rodape: 'Pipe' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(
      criar({ cabecalhoMidia: `data:image/png;base64,${Buffer.from('png').toString('base64')}` }),
    ).rejects.toMatchObject({ detalhe: { campo: 'cabecalhoMidia' } });
    await expect(criar({ autenticacao: { expiraEmMinutos: 0 } })).rejects.toMatchObject({
      detalhe: { campo: 'autenticacao.expiraEmMinutos' },
    });
    await expect(criar({ autenticacao: { expiraEmMinutos: 91 } })).rejects.toMatchObject({
      detalhe: { campo: 'autenticacao.expiraEmMinutos' },
    });
    await expect(criar({ autenticacao: { expiraEmMinutos: 2.5 } })).rejects.toMatchObject({
      detalhe: { campo: 'autenticacao.expiraEmMinutos' },
    });
    await expect(criar({ autenticacao: { textoDoBotao: 'x'.repeat(26) } })).rejects.toMatchObject({
      detalhe: { campo: 'autenticacao.textoDoBotao' },
    });
    expect(chamadas('criar_modelo')).toHaveLength(0);
    expect(chamadas('subir_foto')).toHaveLength(0);
  });
});

describe('Read and update channel and alert preferences', () => {
  it('Default both switches on, update only supplied preferences, and parse comma-separated emails', async () => {
    const canal = await conectar(A, { codigo: `pref-${S}` });
    expect(await readPreferences(A.tenantId, canal.id)).toEqual({
      quickReply: true,
      menu: true,
      alertaRecategorizacao: { ativo: true, emails: [] },
    });
    await writePreferences(A.tenantId, A.adminId, canal.id, { menu: false });
    const depois = await writePreferences(A.tenantId, A.adminId, canal.id, {
      alertaRecategorizacao: { emails: ' Ana@Pipe.app, bia@pipe.app ,ana@pipe.app' },
    });
    expect(depois).toEqual({
      quickReply: true,
      menu: false,
      alertaRecategorizacao: { ativo: true, emails: ['ana@pipe.app', 'bia@pipe.app'] },
    });
    // // The rest of the config (token, number) survives the write.
    expect((await readChannelWhatsApp(A.tenantId, canal.id)).config['phoneNumberId']).toBeTruthy();
  });

  it('Reject invalid preferences and isolate channels by tenant', async () => {
    const canal = await conectar(A, { codigo: `pref-recusa-${S}` });
    await expect(
      writePreferences(A.tenantId, A.adminId, canal.id, { menu: 'sim' as unknown as boolean }),
    ).rejects.toMatchObject({ detalhe: { campo: 'menu' } });
    await expect(
      writePreferences(A.tenantId, A.adminId, canal.id, { alertaRecategorizacao: { emails: 'nao-e-email' } }),
    ).rejects.toMatchObject({ detalhe: { campo: 'emails' } });
    await expect(readPreferences(B.tenantId, canal.id)).rejects.toMatchObject({ status: 404 });
  });

  it('Choose buttons for up to three options, a list for up to ten, and text otherwise', () => {
    const ligado = { quickReply: true, menu: true };
    expect(formatOfQuestion(3, ligado)).toBe('botoes');
    expect(formatOfQuestion(4, ligado)).toBe('lista');
    expect(formatOfQuestion(10, ligado)).toBe('lista');
    expect(formatOfQuestion(11, ligado)).toBe('texto');
    expect(formatOfQuestion(2, { quickReply: false, menu: true })).toBe('lista');
    expect(formatOfQuestion(2, { quickReply: false, menu: false })).toBe('texto');
    expect(formatOfQuestion(0, ligado)).toBe('texto');
  });
});

describe('Update template status and category from webhooks', () => {
  const evento = (field: string, value: Record<string, unknown>) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field, value }] }],
  });

  it('Apply template approval and recategorization webhooks and ignore unknown templates', async () => {
    const canal = await conectar(A, { codigo: `eventos-${S}` });
    await createTemplateInMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'lembrete',
      categoria: 'utilidade',
      corpo: 'Oi',
    });
    const resolvido = (await resolveChannel(canal.id))!;

    expect(
      await processarPayload(
        resolvido,
        evento('message_template_status_update', {
          event: 'APPROVED',
          message_template_name: 'lembrete',
          message_template_language: 'pt_BR',
        }),
      ),
    ).toMatchObject({ mensagensRecebidas: 0 });
    expect(
      await applyEventsOfTemplateaplicarEventsOfTemplateapplyEventsOfTemplate(
        resolvido,
        evento('template_category_update', {
          message_template_name: 'lembrete',
          message_template_language: 'pt_BR',
          previous_category: 'UTILITY',
          new_category: 'MARKETING',
        }),
      ),
    ).toBe(1);
    expect(
      await applyEventsOfTemplateaplicarEventsOfTemplateapplyEventsOfTemplate(
        resolvido,
        evento('message_template_status_update', {
          event: 'REJECTED',
          message_template_name: 'nao_existe',
          message_template_language: 'pt_BR',
        }),
      ),
    ).toBe(0);

    const { rows } = await dono.execute<{ status_meta: string; category: string }>(sql`
      select status_meta, categoria from template_mensagem where canal_id = ${canal.id}::uuid
    `);
    expect(rows).toEqual([{ status_meta: 'aprovado', categoria: 'marketing' }]);
  });
});

describe('desconectar (webhook_teardown_service_spec)', () => {
  it('Remove the callback, release the number, unsubscribe the last WABA channel, and keep conversations', async () => {
    const channel = await conectar(A, { codigo: `desligar-${S}` });
    const { rows: caixas } = await dono.execute<{ id: string }>(
      sql`select id from inbox where canal_id = ${channel.id}::uuid`,
    );
    const { rows: contacts } = await dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${A.tenantId}::uuid, 'Cliente') returning id
    `);
    await dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, estado)
      values (${A.tenantId}::uuid, ${caixas[0]!.id}::uuid, ${contacts[0]!.id}::uuid, 'na_fila')
    `);
    // // The other channels on this WABA, from earlier tests, leave so this one is the last.
    await dono.execute(sql`
      update canal set ativo = false where waba_id = ${WABA} and id <> ${channel.id}::uuid
    `);

    ClienteGraphDuble.reiniciar();
    const depois = await desconectarWhatsApp(A.tenantId, A.adminId, channel.id);
    expect(depois).toMatchObject({ ativo: false, estado: 'desligado' });
    expect(chamadas('limpar_override')).toHaveLength(1);
    expect(chamadas('descadastrar')).toHaveLength(1);
    expect(chamadas('desassinar')).toHaveLength(1);

    const { rows: sobrou } = await dono.execute<{ n: string }>(
      sql`select count(*)::text as n from conversa where inbox_id = ${caixas[0]!.id}::uuid`,
    );
    expect(Number(sobrou[0]!.n)).toBe(1);
  });

  it('Disconnect the channel even if Meta cleanup fails', async () => {
    const canal = await conectar(A, { codigo: `revogado-${S}` });
    vi.spyOn(ClienteGraphDuble.prototype, 'limparCallbackDoNumero').mockRejectedValue(
      new PipeError(502, 'meta_refused', 'token revogado'),
    );
    const depois = await desconectarWhatsApp(A.tenantId, A.adminId, canal.id);
    expect(depois.ativo).toBe(false);
  });

  it('Return 404 for another tenant\'s channel', async () => {
    const canal = await conectar(A, { codigo: `de-a-${S}` });
    await expect(desconectarWhatsApp(B.tenantId, B.adminId, canal.id)).rejects.toMatchObject({
      codigo: 'nao_encontrado',
      status: 404,
    });
  });
});

describe('Show channel connection health on the Channels screen', () => {
  it('Report the phone number, quality, and limit from Meta health data', async () => {
    const canal = await conectar(A, { codigo: `estado-${S}` });
    const meu = (await listChannelsWhatsApp(A.tenantId)).find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'conectado', qualidade: 'GREEN', limite: 'TIER_1K' });
  });

  it('Show Meta outages as `unavailable` with a reason instead of failing the whole screen', async () => {
    const canal = await conectar(A, { codigo: `fora-${S}` });
    vi.spyOn(ClienteGraphDuble.prototype, 'buscarNumero').mockRejectedValue(
      new PipeError(502, 'meta_unreachable', 'sem rede'),
    );
    const meu = (await listChannelsWhatsApp(A.tenantId)).find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'indisponivel', motivo: 'meta_inacessivel' });
  });
});

describe('o cliente real, com fetch injetado (facebook_api_client_spec) — nenhuma chamada sai para a rede', () => {
  type Pedido = { url: string; init: RequestInit | undefined };
  function fetchFalso(respostas: { ok?: boolean; status?: number; body: unknown }[]) {
    const pedidos: Pedido[] = [];
    let i = 0;
    const buscar = (async (url: string | URL, init?: RequestInit) => {
      pedidos.push({ url: String(url), init });
      const r = respostas[Math.min(i, respostas.length - 1)]!;
      i += 1;
      return {
        ok: r.ok ?? true,
        status: r.status ?? (r.ok === false ? 400 : 200),
        text: async () => JSON.stringify(r.corpo),
      } as Response;
    }) as unknown as typeof fetch;
    return { buscar, pedidos };
  }

  it('Exchange the code by GET with client_id, client_secret, and code in the v26.0 query', async () => {
    const { buscar, pedidos } = fetchFalso([{ corpo: { access_token: 'token-do-cliente-abcdefgh' } }]);
    const resposta = await new ClienteGraphReal('', buscar).exchangeCodeByToken('codigo-da-meta');
    expect(resposta.access_token).toBe('token-do-cliente-abcdefgh');
    const url = new URL(pedidos[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
    expect(url.searchParams.get('client_id')).toBe('app-de-teste');
    expect(url.searchParams.get('code')).toBe('codigo-da-meta');
  });

  it('Follow pagination when listing WABA phone numbers', async () => {
    const { buscar, pedidos } = fetchFalso([
      { corpo: { data: [{ id: '1' }], paging: { next: 'x', cursors: { after: 'c1' } } } },
      { corpo: { data: [{ id: '2' }] } },
    ]);
    const numeros = await new ClienteGraphReal('tok', buscar).buscarTodosOsNumeros('waba-1');
    expect(numeros.map((n) => n.id)).toEqual(['1', '2']);
    expect(new URL(pedidos[1]!.url).searchParams.get('after')).toBe('c1');
  });

  it('assina a WABA e depois sobrescreve o callback do número com webhook_configuration', async () => {
    const { buscar, pedidos } = fetchFalso([{ corpo: { success: true } }]);
    await new ClienteGraphReal('tok', buscar).assinarWebhookDoNumero(
      'waba-1',
      '777',
      'https://api.teste/webhooks/whatsapp/x',
      'vt-123',
      ['messages'],
    );
    expect(pedidos[0]!.url).toBe('https://graph.facebook.com/v26.0/waba-1/subscribed_apps');
    expect(JSON.parse(String(pedidos[0]!.init?.body))).toEqual({ subscribed_fields: ['messages'] });
    expect(pedidos[1]!.url).toBe('https://graph.facebook.com/v26.0/777');
    expect(JSON.parse(String(pedidos[1]!.init?.body))).toEqual({
      webhook_configuration: {
        override_callback_uri: 'https://api.teste/webhooks/whatsapp/x',
        verify_token: 'vt-123',
      },
    });
  });

  it('registra o número com messaging_product e o PIN em texto', async () => {
    const { buscar, pedidos } = fetchFalso([{ corpo: { success: true } }]);
    await new ClienteGraphReal('tok', buscar).registrarNumero('777', '123456');
    expect(pedidos[0]!.url).toBe('https://graph.facebook.com/v26.0/777/register');
    expect(JSON.parse(String(pedidos[0]!.init?.body))).toEqual({
      messaging_product: 'whatsapp',
      pin: '123456',
    });
  });

  it('Return Meta\'s error code as 502 without exposing the customer token', async () => {
    const { buscar } = fetchFalso([
      { ok: false, status: 400, corpo: { error: { code: 190, message: 'Token token-do-cliente-abcdefgh has expired' } } },
    ]);
    const error = (await new ClienteGraphReal('token-do-cliente-abcdefgh', buscar)
      .buscarTodosOsNumeros('waba-1')
      .catch((e: unknown) => e)) as InstanceType<typeof PipeError>;
    expect(error).toMatchObject({ status: 502, codigo: 'meta_recusou', detalhe: { codigo_meta: 190 } });
    expect(error.message).not.toContain('token-do-cliente-abcdefgh');
    expect(error.message).toContain('A busca dos números da WABA falhou');
  });
});

describe('Return the raw `hub.challenge` with the app verification token and 403 without it', () => {
  it('devolve o `hub.challenge` cru com o token do ambiente, e 403 sem ele', async () => {
    const { WhatsAppWebhookController } = await import('../src/controllers/webhooks-whatsapp.js');
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'token-do-aplicativo';
    const webhook = new WhatsAppWebhookController();

    const visto: string[] = [];
    const resposta = {
      status: () => resposta,
      type: () => resposta,
      send: (corpo: string) => visto.push(corpo),
    } as unknown as Parameters<typeof webhook.checkOfAccount>[3];

    await webhook.checkOfAccount('subscribe', 'token-do-aplicativo', 'desafio-42', resposta);
    expect(visto).toEqual(['desafio-42']);

    await expect(
      webhook.checkOfAccount('subscribe', 'chute', 'desafio-42', resposta),
    ).rejects.toMatchObject({ codigo: 'verificacao_recusada', status: 403 });
  });
});
