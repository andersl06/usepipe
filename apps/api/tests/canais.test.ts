import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
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

const { criarBanco, decifrar, estaCifrado, fecharBanco, migrar, semear } = await import('@pipe/db');
const { chaveiro, esquecerCanal, fecharBancos } = await import('../src/banco.js');
const { ErroPipe } = await import('../src/erros.js');
const { desconectarWhatsApp, listarCanaisWhatsApp, urlDoWebhook } = await import(
  '../src/dominio/canais.js'
);
const { ClienteGraphDuble, ClienteGraphReal, definirFabricaGraph } = await import(
  '../src/dominio/whatsapp/cliente-graph.js'
);
const { executarCadastroEmbutido } = await import('../src/dominio/whatsapp/cadastro-embutido.js');
const { lerCanalWhatsApp } = await import('../src/dominio/whatsapp/canal.js');
const { configurarWebhook } = await import('../src/dominio/whatsapp/configuracao-de-webhook.js');
const { executarConfiguracaoManual } = await import('../src/dominio/whatsapp/configuracao-manual.js');
const { emitirEstado } = await import('../src/dominio/whatsapp/estado-de-conexao.js');
const { gravarPerfilDoCanal, lerPerfilDoCanal } = await import('../src/dominio/whatsapp/perfil.js');
const { buscarInfoDoNumero } = await import('../src/dominio/whatsapp/info-do-numero.js');
const { trocarCodigo } = await import('../src/dominio/whatsapp/troca-de-token.js');
const { ControladorCanais } = await import('../src/controladores/canais.js');
import type { RequisicaoComSessao } from '../src/sessao.js';
import type { NumeroDaWaba } from '../src/dominio/whatsapp/cliente-graph.js';

/**
 * Conectar o WhatsApp do cliente, com banco de verdade e sem tocar na Meta.
 *
 * Os casos seguem os specs do Chatwoot de onde a conexão foi portada
 * (`spec/services/whatsapp/*_spec.rb`), mais os do Pipe: o `state` contra CSRF, a
 * cifra do token e o isolamento entre clientes. O "callback" é exercitado pelo
 * controlador de verdade, com a permissão `canal.gerenciar` conferida no banco.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);
const WABA = 'waba-duble-1';

type Dono = ReturnType<typeof criarBanco>;
let dono: Dono;
let A: { tenantId: string; adminId: string };
let B: { tenantId: string; adminId: string };
const controlador = new ControladorCanais();

async function tenantComAdmin(nome: string): Promise<{ tenantId: string; adminId: string }> {
  const { tenantId } = await semear(dono, { nome: `entrada ${nome}`, slug: `entrada-${nome}` });
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

function requisicao(quem: { tenantId: string; adminId: string }): RequisicaoComSessao {
  return {
    sessao: { tenantId: quem.tenantId, usuarioId: quem.adminId, origem: 'google' },
  } as unknown as RequisicaoComSessao;
}

async function contarCanais(tenantId: string): Promise<number> {
  const { rows } = await dono.execute<{ n: string }>(
    sql`select count(*)::text as n from canal where tenant_id = ${tenantId}::uuid`,
  );
  return Number(rows[0]!.n);
}

async function configDoBanco(canalId: string): Promise<Record<string, unknown>> {
  const { rows } = await dono.execute<{ config: Record<string, unknown> }>(
    sql`select config from canal where id = ${canalId}::uuid`,
  );
  return rows[0]!.config;
}

function chamadas(acao: string) {
  return ClienteGraphDuble.chamadas.filter((c) => c.acao === acao);
}

/** Conecta pelo controlador, com um `state` válido desta sessão. */
function conectar(quem: { tenantId: string; adminId: string }, extra: Record<string, unknown>) {
  return controlador.conectar(requisicao(quem), {
    waba_id: WABA,
    estado: emitirEstado(quem.tenantId, quem.adminId),
    ...extra,
  });
}

beforeAll(async () => {
  await migrar(URL_DONO);
  dono = criarBanco({ url: URL_DONO, maxConexoes: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
}, 180_000);

afterAll(async () => {
  definirFabricaGraph(null);
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await fecharBanco(dono);
  await fecharBancos();
});

beforeEach(() => {
  definirFabricaGraph(null);
  ClienteGraphDuble.reiniciar();
  esquecerCanal();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o callback do cadastro embutido (POST /v1/canais/whatsapp), contra o dublê', () => {
  it('sucesso: cria canal e caixa, cifra o token e aponta o webhook do número para a rota do canal', async () => {
    const canal = await conectar(A, { codigo: `ok-${S}` });

    expect(canal.estado).toBe('conectado');
    expect(canal.ativo).toBe(true);
    expect(canal.wabaId).toBe(WABA);
    expect(canal.webhookUrl).toBe(`https://api.teste/webhooks/whatsapp/${canal.id}`);
    expect(canal.nome).toBe('Empresa de Ensaio WhatsApp');

    // A WABA é assinada ANTES do override, com os campos do Chatwoot e os três
    // da rota guarda-chuva; o override aponta para a URL DAQUELE canal.
    const ordem = ClienteGraphDuble.chamadas.map((c) => c.acao);
    expect(ordem.indexOf('assinar')).toBeLessThan(ordem.indexOf('override'));
    expect(chamadas('assinar')[0]?.campos).toEqual(
      expect.arrayContaining(['messages', 'smb_message_echoes', 'account_update']),
    );
    expect(chamadas('override')[0]?.url).toBe(urlDoWebhook(canal.id));
    // Número já verificado e provisionado: não registra (webhook_setup_service_spec).
    expect(chamadas('registrar')).toHaveLength(0);

    // Token e verify_token vivem CIFRADOS. Isto é o que um `pg_dump` veria.
    const config = await configDoBanco(canal.id);
    expect(estaCifrado(String(config['tokenAcesso']))).toBe(true);
    expect(estaCifrado(String(config['verifyToken']))).toBe(true);
    expect(decifrar(String(config['verifyToken']), chaveiro())).toMatch(/^[0-9a-f]{32}$/);
    expect(config['origem']).toBe('embedded_signup');

    const { rows } = await dono.execute<{ nome: string; fila_padrao_id: string | null }>(
      sql`select nome, fila_padrao_id from inbox where canal_id = ${canal.id}::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nome).toBe('Empresa de Ensaio WhatsApp');
    expect(rows[0]!.fila_padrao_id).not.toBeNull();
  });

  it('state inválido — ausente, forjado, de outra sessão ou vencido — nada chega à Meta', async () => {
    const antes = await contarCanais(A.tenantId);
    const onzeMinutosAtras = Date.now() - 11 * 60 * 1000;
    const estados = [
      undefined,
      'forjado',
      emitirEstado(B.tenantId, B.adminId),
      emitirEstado(A.tenantId, B.adminId),
      emitirEstado(A.tenantId, A.adminId, onzeMinutosAtras),
    ];
    for (const estado of estados) {
      await expect(
        controlador.conectar(requisicao(A), { codigo: `csrf-${S}`, waba_id: WABA, estado }),
      ).rejects.toMatchObject({ codigo: 'estado_invalido', status: 403 });
    }
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
    expect(await contarCanais(A.tenantId)).toBe(antes);
  });

  it('token sem permissão na WABA: a Meta recusa a busca dos números e nenhum canal nasce', async () => {
    const antes = await contarCanais(A.tenantId);
    await expect(conectar(A, { codigo: `sem-permissao-${S}` })).rejects.toMatchObject({
      codigo: 'meta_recusou',
      detalhe: { codigo_meta: 200 },
    });
    expect(chamadas('override')).toHaveLength(0);
    expect(await contarCanais(A.tenantId)).toBe(antes);
  });

  it('número já usado por outro tenant: recusado, com a frase do Chatwoot', async () => {
    const codigo = `disputado-${S}`;
    await conectar(A, { codigo });
    const antes = await contarCanais(B.tenantId);

    const erro = await conectar(B, { codigo }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'numero_em_uso', status: 409 });
    expect((erro as Error).message).toContain('Já existe um canal para este número de telefone');
    expect(await contarCanais(B.tenantId)).toBe(antes);
  });

  it('parâmetros ausentes: a mesma recusa do original, antes de falar com a Meta', async () => {
    await expect(conectar(A, { codigo: '', waba_id: '' })).rejects.toMatchObject({
      codigo: 'parametros_ausentes',
      message: 'Parâmetros obrigatórios ausentes: code, waba_id',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });

  it('canal de outro tenant não pode ser reautorizado daqui: 404, nem a existência se confirma', async () => {
    const deA = await conectar(A, { codigo: `alheio-${S}` });
    await expect(conectar(B, { codigo: `alheio-${S}`, canal_id: deA.id })).rejects.toMatchObject({
      codigo: 'nao_encontrado',
      status: 404,
    });
  });
});

describe('troca de token (token_exchange_service_spec)', () => {
  it('devolve o token', async () => {
    expect(await trocarCodigo(`troca-${S}`)).toMatch(/^duble-token-\d{11}$/);
  });

  it('código em branco é recusado sem falar com a Meta', async () => {
    await expect(trocarCodigo('')).rejects.toMatchObject({
      codigo: 'codigo_ausente',
      message: 'O código de autorização é obrigatório.',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });

  it('resposta sem access_token é erro', async () => {
    await expect(trocarCodigo('sem-token-1')).rejects.toMatchObject({ codigo: 'meta_sem_token' });
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

  it('sem identificador e com vários números: recusa em vez de escolher o primeiro', async () => {
    comNumeros([um('a', '1234567890', 'A'), um('b', '9876543210', 'B')]);
    await expect(buscarInfoDoNumero('waba', undefined, 'tok')).rejects.toMatchObject({
      codigo: 'numero_ambiguo',
    });
  });

  it('na reautorização sem phone_number_id, casa pelo número esperado', async () => {
    comNumeros([um('outro', '9876543210', 'O'), um('alvo', '1112223333', 'T')]);
    const info = await buscarInfoDoNumero('waba', undefined, 'tok', '+1112223333');
    expect(info).toMatchObject({ numeroId: 'alvo', numero: '+1112223333' });
  });

  it('WABA sem número nenhum é erro', async () => {
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

describe('configuração do webhook (webhook_setup_service_spec)', () => {
  it('número não verificado: registra com PIN de 6 dígitos e guarda o PIN cifrado', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'numeroVerificado').mockResolvedValue(false);
    const canal = await conectar(A, { codigo: `pin-${S}` });

    const registro = chamadas('registrar');
    expect(registro).toHaveLength(1);
    expect(registro[0]!.pin).toMatch(/^[1-9]\d{5}$/);

    const config = await configDoBanco(canal.id);
    expect(estaCifrado(String(config['pinVerificacao']))).toBe(true);
    expect(decifrar(String(config['pinVerificacao']), chaveiro())).toBe(registro[0]!.pin);

    // PIN já guardado: a próxima configuração reaproveita, não sorteia outro.
    ClienteGraphDuble.reiniciar();
    await configurarWebhook(await lerCanalWhatsApp(A.tenantId, canal.id));
    expect(chamadas('registrar')[0]?.pin).toBe(registro[0]!.pin);
  });

  it('coexistência: não registra e nem pergunta a saúde', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'numeroVerificado').mockResolvedValue(false);
    await executarCadastroEmbutido({
      tenantId: A.tenantId,
      usuarioId: A.adminId,
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
      new ErroPipe(502, 'meta_recusou', 'O registro do número falhou: PIN'),
    );
    ClienteGraphDuble.reiniciar();

    const resultado = await configurarWebhook(await lerCanalWhatsApp(A.tenantId, canal.id));
    expect(resultado.erroDeRegistro?.message).toContain('O registro do número falhou');
    expect(chamadas('override')).toHaveLength(1);
  });

  it('webhook que falha: o canal fica, marcado para reautorização (embedded_signup_service_spec)', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'sobrescreverCallbackDoNumero').mockRejectedValue(
      new ErroPipe(502, 'meta_recusou', 'Invalid access token'),
    );
    const canal = await conectar(A, { codigo: `webhook-ruim-${S}` });
    expect(canal).toMatchObject({ estado: 'indisponivel', motivo: 'reautorizacao_pendente' });

    await expect(
      configurarWebhook(await lerCanalWhatsApp(A.tenantId, canal.id)),
    ).rejects.toMatchObject({
      codigo: 'webhook_falhou',
      message: expect.stringMatching(/Falha ao configurar o webhook: .*Invalid access token/),
    });

    const lista = await listarCanaisWhatsApp(A.tenantId);
    expect(lista.find((c) => c.id === canal.id)).toMatchObject({
      estado: 'indisponivel',
      motivo: 'reautorizacao_pendente',
    });
  });

  it('canal sem WABA é recusado antes de falar com a Meta', async () => {
    const canal = await conectar(A, { codigo: `sem-waba-${S}` });
    const lido = await lerCanalWhatsApp(A.tenantId, canal.id);
    ClienteGraphDuble.reiniciar();
    await expect(configurarWebhook({ ...lido, wabaId: null })).rejects.toMatchObject({
      codigo: 'waba_ausente',
    });
    expect(ClienteGraphDuble.chamadas).toHaveLength(0);
  });
});

describe('reautorização (reauthorization_service_spec)', () => {
  it('desconectado e reconectado pelo canal_id: o mesmo canal volta ligado, sem duplicar', async () => {
    const codigo = `volta-${S}`;
    const primeira = await conectar(A, { codigo });
    await desconectarWhatsApp(A.tenantId, A.adminId, primeira.id);
    const antes = await contarCanais(A.tenantId);

    const segunda = await conectar(A, { codigo, canal_id: primeira.id });
    expect(segunda.id).toBe(primeira.id);
    expect(segunda).toMatchObject({ ativo: true, estado: 'conectado', mensagem: 'Reautorização concluída.' });
    expect(await contarCanais(A.tenantId)).toBe(antes);
  });

  it('número diferente do canal é recusado', async () => {
    const canal = await conectar(A, { codigo: `um-numero-${S}` });
    // Com o `phone_number_id` do outro número, a Meta o acha e a reautorização recusa a troca.
    await expect(
      conectar(A, {
        codigo: `outro-numero-${S}`,
        canal_id: canal.id,
        phone_number_id: ClienteGraphDuble.sufixo(`outro-numero-${S}`),
      }),
    ).rejects.toMatchObject({ codigo: 'numero_divergente' });
    // Sem ele, casa pelo número do canal — que não está naquela WABA.
    await expect(
      conectar(A, { codigo: `outro-numero-${S}`, canal_id: canal.id }),
    ).rejects.toMatchObject({ codigo: 'numero_nao_encontrado' });
  });
});

describe('configuração manual (manual_setup_validation_service_spec)', () => {
  const numeroId = ClienteGraphDuble.sufixo(`manual-${S}`);
  const token = `manual-${numeroId}`;
  /** App Secret do app do cliente: 32 hexadecimais. `bad…` o dublê trata como de outro app. */
  const appSecret = 'a'.repeat(32);
  const base = () => ({
    tenantId: A.tenantId,
    usuarioId: A.adminId,
    wabaId: 'waba-m',
    numeroId,
    token,
    appSecret,
  });

  it('token sem permissão de mensagem: recusado com a frase do original', async () => {
    vi.spyOn(ClienteGraphDuble.prototype, 'buscarPermissoes').mockResolvedValue({ data: [] });
    await expect(executarConfiguracaoManual(base())).rejects.toMatchObject({
      codigo: 'configuracao_invalida',
      message: expect.stringContaining('whatsapp_business_messaging'),
    });
  });

  it('Phone Number ID que não é da WABA: recusado', async () => {
    await expect(executarConfiguracaoManual({ ...base(), numeroId: 'outro' })).rejects.toMatchObject({
      message: 'Este Phone Number ID não pertence ao WABA ID informado.',
    });
  });

  it('App Secret: obrigatório, com formato, e tem de ser do app dono do token', async () => {
    await expect(executarConfiguracaoManual({ ...base(), appSecret: undefined })).rejects.toMatchObject({
      message: 'O App Secret é obrigatório.',
    });
    await expect(executarConfiguracaoManual({ ...base(), appSecret: 'curto' })).rejects.toMatchObject({
      message: 'O App Secret tem 32 caracteres, só números e letras de a a f.',
    });
    await expect(
      executarConfiguracaoManual({ ...base(), appSecret: `bad${'0'.repeat(29)}` }),
    ).rejects.toMatchObject({ message: 'Este App Secret não é do aplicativo que gerou o token.' });
    expect(chamadas('override')).toHaveLength(0);
  });

  it('sucesso: grava segredo e app DO CLIENTE, devolve o webhook, e desconectar não solta o número', async () => {
    const feito = await executarConfiguracaoManual({ ...base(), nome: 'Suporte manual' });
    expect(feito.erroDeWebhook).toBeNull();
    expect(feito.canal.nome).toBe('Suporte manual');
    expect(feito.canal.config['origem']).toBe('manual_setup_v2');
    // O webhook deste canal confere a assinatura com o segredo do app do cliente, não o nosso.
    expect(feito.canal.config['appSecret']).toBe(appSecret);
    expect(feito.canal.config['appId']).toMatch(/^app-/);
    expect(feito.webhook).toEqual({
      url: urlDoWebhook(feito.canal.id),
      verifyToken: feito.canal.config['verifyToken'],
    });
    expect(estaCifrado(String((await configDoBanco(feito.canal.id))['appSecret']))).toBe(true);

    ClienteGraphDuble.reiniciar();
    await desconectarWhatsApp(A.tenantId, A.adminId, feito.canal.id);
    expect(chamadas('limpar_override')).toHaveLength(1);
    expect(chamadas('descadastrar')).toHaveLength(0);
    expect(chamadas('desassinar')).toHaveLength(0);
  });
});

describe('perfil do número (GET/PATCH /v1/canais/whatsapp/:id/perfil)', () => {
  const PNG = `data:image/png;base64,${Buffer.from('png-de-ensaio').toString('base64')}`;

  it('lê vazio, grava só o que veio, sobe a foto no app do canal e registra auditoria', async () => {
    const canal = await conectar(A, { codigo: `perfil-${S}` });
    const antes = await lerPerfilDoCanal(A.tenantId, canal.id);
    expect(antes).toMatchObject({
      sobre: '',
      sites: [],
      fotoUrl: null,
      nome: { exibicao: 'Empresa de Ensaio' },
    });

    const depois = await gravarPerfilDoCanal(A.tenantId, A.adminId, canal.id, {
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

    // Campo ausente não é mexido.
    const deNovo = await gravarPerfilDoCanal(A.tenantId, A.adminId, canal.id, { descricao: 'Escola' });
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
    const gravar = (p: object) => gravarPerfilDoCanal(A.tenantId, A.adminId, canal.id, p);
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

  it('canal de outro tenant é 404, e a rota exige canal.gerenciar', async () => {
    const canal = await conectar(A, { codigo: `perfil-b-${S}` });
    await expect(lerPerfilDoCanal(B.tenantId, canal.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      gravarPerfilDoCanal(B.tenantId, B.adminId, canal.id, { sobre: 'invasão' }),
    ).rejects.toMatchObject({ status: 404 });

    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${A.tenantId}::uuid, 'Sem papel', ${`sem-papel-${S}@entrada.pipe.app`}) returning id
    `);
    const semPapel = requisicao({ tenantId: A.tenantId, adminId: rows[0]!.id });
    await expect(controlador.perfil(semPapel, canal.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe('desconectar (webhook_teardown_service_spec)', () => {
  it('apaga o callback, solta o número, desassina a WABA do último canal e NÃO apaga a conversa', async () => {
    const canal = await conectar(A, { codigo: `desligar-${S}` });
    const { rows: caixas } = await dono.execute<{ id: string }>(
      sql`select id from inbox where canal_id = ${canal.id}::uuid`,
    );
    const { rows: contatos } = await dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${A.tenantId}::uuid, 'Cliente') returning id
    `);
    await dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, estado)
      values (${A.tenantId}::uuid, ${caixas[0]!.id}::uuid, ${contatos[0]!.id}::uuid, 'na_fila')
    `);
    // Os outros canais desta WABA, dos testes anteriores, saem para este ser o último.
    await dono.execute(sql`
      update canal set ativo = false where waba_id = ${WABA} and id <> ${canal.id}::uuid
    `);

    ClienteGraphDuble.reiniciar();
    const depois = await desconectarWhatsApp(A.tenantId, A.adminId, canal.id);
    expect(depois).toMatchObject({ ativo: false, estado: 'desligado' });
    expect(chamadas('limpar_override')).toHaveLength(1);
    expect(chamadas('descadastrar')).toHaveLength(1);
    expect(chamadas('desassinar')).toHaveLength(1);

    const { rows: sobrou } = await dono.execute<{ n: string }>(
      sql`select count(*)::text as n from conversa where inbox_id = ${caixas[0]!.id}::uuid`,
    );
    expect(Number(sobrou[0]!.n)).toBe(1);
  });

  it('desmontagem que falha na Meta não impede desligar', async () => {
    const canal = await conectar(A, { codigo: `revogado-${S}` });
    vi.spyOn(ClienteGraphDuble.prototype, 'limparCallbackDoNumero').mockRejectedValue(
      new ErroPipe(502, 'meta_recusou', 'token revogado'),
    );
    const depois = await desconectarWhatsApp(A.tenantId, A.adminId, canal.id);
    expect(depois.ativo).toBe(false);
  });

  it('canal de outro tenant é 404', async () => {
    const canal = await conectar(A, { codigo: `de-a-${S}` });
    await expect(desconectarWhatsApp(B.tenantId, B.adminId, canal.id)).rejects.toMatchObject({
      codigo: 'nao_encontrado',
      status: 404,
    });
  });
});

describe('estado da conexão na tela de Canais', () => {
  it('traz número, qualidade e limite pela saúde do número', async () => {
    const canal = await conectar(A, { codigo: `estado-${S}` });
    const meu = (await listarCanaisWhatsApp(A.tenantId)).find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'conectado', qualidade: 'GREEN', limite: 'TIER_1K' });
  });

  it('Meta fora do ar vira `indisponivel` com motivo, não erro na tela inteira', async () => {
    const canal = await conectar(A, { codigo: `fora-${S}` });
    vi.spyOn(ClienteGraphDuble.prototype, 'buscarNumero').mockRejectedValue(
      new ErroPipe(502, 'meta_inacessivel', 'sem rede'),
    );
    const meu = (await listarCanaisWhatsApp(A.tenantId)).find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'indisponivel', motivo: 'meta_inacessivel' });
  });
});

describe('o cliente real, com fetch injetado (facebook_api_client_spec) — nenhuma chamada sai para a rede', () => {
  type Pedido = { url: string; init: RequestInit | undefined };
  function fetchFalso(respostas: { ok?: boolean; status?: number; corpo: unknown }[]) {
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

  it('troca o código por GET, com client_id, client_secret e code na consulta, na v26.0', async () => {
    const { buscar, pedidos } = fetchFalso([{ corpo: { access_token: 'token-do-cliente-abcdefgh' } }]);
    const resposta = await new ClienteGraphReal('', buscar).trocarCodigoPorToken('codigo-da-meta');
    expect(resposta.access_token).toBe('token-do-cliente-abcdefgh');
    const url = new URL(pedidos[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
    expect(url.searchParams.get('client_id')).toBe('app-de-teste');
    expect(url.searchParams.get('code')).toBe('codigo-da-meta');
  });

  it('segue a paginação dos números da WABA', async () => {
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

  it('recusa da Meta vira 502 com o código dela, e sem o token do cliente na mensagem', async () => {
    const { buscar } = fetchFalso([
      { ok: false, status: 400, corpo: { error: { code: 190, message: 'Token token-do-cliente-abcdefgh has expired' } } },
    ]);
    const erro = (await new ClienteGraphReal('token-do-cliente-abcdefgh', buscar)
      .buscarTodosOsNumeros('waba-1')
      .catch((e: unknown) => e)) as InstanceType<typeof ErroPipe>;
    expect(erro).toMatchObject({ status: 502, codigo: 'meta_recusou', detalhe: { codigo_meta: 190 } });
    expect(erro.message).not.toContain('token-do-cliente-abcdefgh');
    expect(erro.message).toContain('A busca dos números da WABA falhou');
  });
});

describe('o desafio de inscrição do webhook do aplicativo', () => {
  it('devolve o `hub.challenge` cru com o token do ambiente, e 403 sem ele', async () => {
    const { ControladorWebhookWhatsApp } = await import('../src/controladores/webhooks-whatsapp.js');
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'token-do-aplicativo';
    const webhook = new ControladorWebhookWhatsApp();

    const visto: string[] = [];
    const resposta = {
      status: () => resposta,
      type: () => resposta,
      send: (corpo: string) => visto.push(corpo),
    } as unknown as Parameters<typeof webhook.verificarDaConta>[3];

    await webhook.verificarDaConta('subscribe', 'token-do-aplicativo', 'desafio-42', resposta);
    expect(visto).toEqual(['desafio-42']);

    await expect(
      webhook.verificarDaConta('subscribe', 'chute', 'desafio-42', resposta),
    ).rejects.toMatchObject({ codigo: 'verificacao_recusada', status: 403 });
  });
});
