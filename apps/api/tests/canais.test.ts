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
const { chaveiro, esquecerCanal, fecharBancos, resolverCanal } = await import('../src/banco.js');
const { processarPayload } = await import('../src/dominio/entrada.js');
const { aplicarEventosDeModelo } = await import('../src/dominio/whatsapp/eventos-de-modelo.js');
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
const { criarModeloNaMeta, excluirModeloNaMeta, sincronizarModelos } = await import(
  '../src/dominio/whatsapp/modelos.js'
);
const { formatoDaPergunta, gravarPreferencias, lerPreferencias } = await import(
  '../src/dominio/whatsapp/preferencias.js'
);
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

describe('modelos de mensagem na Meta (sincronizar, criar, excluir)', () => {
  async function modelosLocais(canalId: string) {
    const { rows } = await dono.execute<{
      nome: string;
      idioma: string;
      status_meta: string;
      categoria: string;
      cabecalho_tipo: string;
      variaveis: string[];
    }>(sql`
      select nome, idioma, status_meta, categoria, cabecalho_tipo, variaveis
        from template_mensagem where canal_id = ${canalId}::uuid order by nome, idioma
    `);
    return rows;
  }

  it('cria na Meta com exemplos, grava pendente, e a sincronização traz o status e remove o que sumiu', async () => {
    const canal = await conectar(A, { codigo: `modelos-${S}` });
    const criado = await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
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
    expect(await modelosLocais(canal.id)).toMatchObject([
      { nome: 'boas_vindas', status_meta: 'pendente', cabecalho_tipo: 'texto', variaveis: ['1', '2'] },
    ]);

    // Na Meta: aprovado, e aparece um segundo modelo criado lá fora; um terceiro de categoria desconhecida.
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
    expect(await modelosLocais(canal.id)).toMatchObject([
      // Os nomes dados às variáveis ficam: a quantidade não mudou.
      { nome: 'boas_vindas', status_meta: 'aprovado', variaveis: ['1', '2'] },
      { nome: 'promo', status_meta: 'rejeitado', categoria: 'marketing', cabecalho_tipo: 'imagem', variaveis: ['Variável 1'] },
    ]);

    // Apagado lá fora: some daqui na próxima sincronização.
    ClienteGraphDuble.modelos.set(
      canal.wabaId!,
      ClienteGraphDuble.modelos.get(canal.wabaId!)!.filter((m) => m.name !== 'promo'),
    );
    const segunda = await sincronizarModelos(A.tenantId, A.adminId, canal.id);
    expect(segunda.removidos).toBe(1);
    expect((await modelosLocais(canal.id)).map((m) => m.nome)).toEqual(['boas_vindas']);

    const excluido = await excluirModeloNaMeta(A.tenantId, A.adminId, canal.id, 'boas_vindas');
    expect(excluido).toEqual({ removidos: 1 });
    expect(await modelosLocais(canal.id)).toHaveLength(0);
    expect(ClienteGraphDuble.modelos.get(canal.wabaId!)!.some((m) => m.name === 'boas_vindas')).toBe(false);
  });

  it('recusas de formulário não chegam à Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const criar = (p: object) => criarModeloNaMeta(A.tenantId, A.adminId, canal.id, p);
    const ok = { nome: 'aviso', categoria: 'utilidade', corpo: 'Oi {{1}}', exemplos: ['Ana'] };
    await expect(criar({ ...ok, nome: 'Com Espaço' })).rejects.toMatchObject({ detalhe: { campo: 'nome' } });
    // Autenticação passou a existir (describe próprio abaixo); categoria desconhecida continua recusada.
    await expect(criar({ ...ok, categoria: 'promocional' })).rejects.toMatchObject({ detalhe: { campo: 'categoria' } });
    await expect(criar({ ...ok, idioma: 'português' })).rejects.toMatchObject({ detalhe: { campo: 'idioma' } });
    await expect(criar({ ...ok, corpo: '' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(criar({ ...ok, corpo: 'x'.repeat(1025) })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });
    await expect(criar({ ...ok, exemplos: [] })).rejects.toMatchObject({ detalhe: { campo: 'exemplos' } });
    await expect(criar({ ...ok, cabecalho: '{{1}} e {{2}}' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalho' },
    });
    await expect(criar({ ...ok, cabecalho: 'Oi {{1}}' })).rejects.toMatchObject({
      detalhe: { campo: 'exemploDoCabecalho' },
    });
    expect(chamadas('criar_modelo')).toHaveLength(0);
  });

  it('canal de outro tenant é 404 e a rota exige canal.gerenciar', async () => {
    const canal = await conectar(A, { codigo: `modelos-b-${S}` });
    await expect(sincronizarModelos(B.tenantId, B.adminId, canal.id)).rejects.toMatchObject({ status: 404 });
    await expect(excluirModeloNaMeta(B.tenantId, B.adminId, canal.id, 'x')).rejects.toMatchObject({ status: 404 });
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${A.tenantId}::uuid, 'Sem papel 2', ${`sem-papel-modelos-${S}@entrada.pipe.app`}) returning id
    `);
    await expect(
      controlador.sincronizarModelos(requisicao({ tenantId: A.tenantId, adminId: rows[0]!.id }), canal.id),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('modelos com mídia no cabeçalho (imagem, vídeo, documento)', () => {
  const dataUrl = (tipo: string, bytes: Buffer) => `data:${tipo};base64,${bytes.toString('base64')}`;
  const JPEG = dataUrl('image/jpeg', Buffer.from('jpeg-de-ensaio'));
  const PDF = dataUrl('application/pdf', Buffer.from('%PDF-1.4 de ensaio'));
  const MP4 = dataUrl('video/mp4', Buffer.from('mp4-de-ensaio'));

  it('cabeçalho de imagem: sobe o arquivo no app do canal e manda o handle em header_handle', async () => {
    const canal = await conectar(A, { codigo: `modelos-imagem-${S}` });
    ClienteGraphDuble.reiniciar();
    const criado = await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'oferta_com_foto',
      categoria: 'marketing',
      cabecalhoMidia: JPEG,
      corpo: 'Oferta para {{1}}.',
      exemplos: ['Ana'],
      rodape: 'Pipe',
    });
    expect(criado.statusMeta).toBe('pendente');

    // Subiu UMA vez, antes de criar — a ordem é a da Resumable Upload API: handle primeiro.
    expect(ClienteGraphDuble.chamadas.map((c) => c.acao)).toEqual(['subir_foto', 'criar_modelo']);

    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)!.find((m) => m.name === 'oferta_com_foto')!;
    expect(enviado.category).toBe('MARKETING');
    const cabecalho = enviado.components![0]!;
    expect(cabecalho).toMatchObject({ type: 'HEADER', format: 'IMAGE' });
    expect(cabecalho).not.toHaveProperty('text');
    const handles = (cabecalho.example as { header_handle: string[] }).header_handle;
    expect(handles).toHaveLength(1);
    // Embutido: o arquivo sobe no NOSSO app, e o dublê devolve `<app>-<sufixo dos bytes>`.
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

  it('vídeo e documento vão com o formato certo (VIDEO/DOCUMENT) e a cópia local sabe o tipo', async () => {
    const canal = await conectar(A, { codigo: `modelos-video-doc-${S}` });
    ClienteGraphDuble.reiniciar();
    const base = { categoria: 'utilidade', corpo: 'Segue o material.', exemplos: [] as string[] };
    await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, { ...base, nome: 'com_video', cabecalhoMidia: MP4 });
    await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, { ...base, nome: 'com_pdf', cabecalhoMidia: PDF });

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

    const { rows } = await dono.execute<{ nome: string; cabecalho_tipo: string }>(sql`
      select nome, cabecalho_tipo from template_mensagem
       where canal_id = ${canal.id}::uuid and nome in ('com_video', 'com_pdf') order by nome
    `);
    expect(rows).toMatchObject([
      { nome: 'com_pdf', cabecalho_tipo: 'documento' },
      { nome: 'com_video', cabecalho_tipo: 'video' },
    ]);
  });

  it('tipo ou tamanho errado recusa com a frase da tela, ANTES de subir e de chamar a Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-midia-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const criar = (p: object) =>
      criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
        nome: 'recusado',
        categoria: 'marketing',
        corpo: 'Oi.',
        ...p,
      });

    // Tipo fora da lista de cada formato: a frase é a que a origem mostra no campo.
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

    // Tamanho: 5 MB para imagem, 16 MB para vídeo (documento é 100 MB — grande demais para o teste).
    const imagemGrande = dataUrl('image/png', Buffer.alloc(5 * 1024 * 1024 + 1));
    await expect(criar({ cabecalhoMidia: imagemGrande })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
      message: 'A imagem do cabeçalho tem de ter no máximo 5 MB.',
    });
    const videoGrande = dataUrl('video/mp4', Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(criar({ cabecalhoMidia: videoGrande })).rejects.toMatchObject({
      message: 'O vídeo do cabeçalho tem de ter no máximo 16 MB.',
    });

    // Não é data URL, está vazio, ou veio junto com cabeçalho de texto.
    await expect(criar({ cabecalhoMidia: 'https://exemplo/foto.jpg' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
    });
    await expect(criar({ cabecalhoMidia: 'data:image/png;base64,' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalhoMidia' },
    });
    await expect(criar({ cabecalhoMidia: JPEG, cabecalho: 'Olá' })).rejects.toMatchObject({
      detalhe: { campo: 'cabecalho' },
    });

    // Mídia boa, mas corpo ruim: o arquivo NÃO sobe — tudo é conferido antes do upload.
    await expect(criar({ cabecalhoMidia: JPEG, corpo: '' })).rejects.toMatchObject({ detalhe: { campo: 'corpo' } });

    expect(chamadas('subir_foto')).toHaveLength(0);
    expect(chamadas('criar_modelo')).toHaveLength(0);
  });
});

describe('modelos de autenticação (componentes fixos da Meta)', () => {
  it('monta corpo com recomendação de segurança, rodapé com validade e botão de copiar; a cópia local tem {{1}}', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-${S}` });
    ClienteGraphDuble.reiniciar();
    const criado = await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'codigo_de_acesso',
      categoria: 'autenticacao',
      autenticacao: { expiraEmMinutos: 10, textoDoBotao: 'Copiar' },
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
    // Nenhum texto nosso vai para a Meta nessa categoria.
    expect(enviado.components!.some((c) => 'text' in c)).toBe(false);

    const { rows } = await dono.execute<{
      categoria: string;
      corpo: string;
      cabecalho_tipo: string;
      variaveis: string[];
    }>(sql`
      select categoria, corpo, cabecalho_tipo, variaveis from template_mensagem
       where canal_id = ${canal.id}::uuid and nome = 'codigo_de_acesso'
    `);
    expect(rows[0]).toMatchObject({ categoria: 'autenticacao', cabecalho_tipo: 'nenhum', variaveis: ['1'] });
    expect(rows[0]!.corpo).toContain('{{1}}');
    expect(rows[0]!.corpo).toContain('não compartilhe');
  });

  it('padrões: recomendação ligada, sem rodapé, botão "Copiar código"; e a sincronização mantém a categoria', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-padrao-${S}` });
    ClienteGraphDuble.reiniciar();
    await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, { nome: 'otp', categoria: 'autenticacao' });
    const enviado = ClienteGraphDuble.modelos.get(canal.wabaId!)![0]!;
    expect(enviado.components).toEqual([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }] },
    ]);

    // Desligada: o campo não vai, e a cópia local fica sem a frase de segurança.
    await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'otp_seco',
      categoria: 'autenticacao',
      autenticacao: { recomendacaoDeSeguranca: false },
    });
    const seco = ClienteGraphDuble.modelos.get(canal.wabaId!)!.find((m) => m.name === 'otp_seco')!;
    expect(seco.components![0]).toEqual({ type: 'BODY' });
    const { rows } = await dono.execute<{ corpo: string }>(sql`
      select corpo from template_mensagem where canal_id = ${canal.id}::uuid and nome = 'otp_seco'
    `);
    expect(rows[0]!.corpo).toBe('{{1}} é seu código de verificação.');

    // A Meta aprovou e devolve o BODY com o texto dela: a sincronização troca a cópia local por ele.
    enviado.status = 'APPROVED';
    enviado.components![0]!.text = '*{{1}}* é seu código de verificação. Para sua segurança, não compartilhe este código.';
    const resultado = await sincronizarModelos(A.tenantId, A.adminId, canal.id);
    expect(resultado).toMatchObject({ atualizados: 2, ignorados: 0 });
    const { rows: depois } = await dono.execute<{ status_meta: string; corpo: string; categoria: string }>(sql`
      select status_meta, corpo, categoria from template_mensagem
       where canal_id = ${canal.id}::uuid and nome = 'otp'
    `);
    expect(depois[0]).toMatchObject({
      status_meta: 'aprovado',
      categoria: 'autenticacao',
      corpo: '*{{1}}* é seu código de verificação. Para sua segurança, não compartilhe este código.',
    });
  });

  it('recusa texto livre, validade fora de 1–90 e botão longo — sem chamar a Meta', async () => {
    const canal = await conectar(A, { codigo: `modelos-auth-recusa-${S}` });
    ClienteGraphDuble.reiniciar();
    const criar = (p: object) =>
      criarModeloNaMeta(A.tenantId, A.adminId, canal.id, { nome: 'otp', categoria: 'autenticacao', ...p });

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

describe('preferências do canal (Configurações e Configurações de alerta)', () => {
  it('nasce com os dois interruptores ligados, grava só o que veio e aceita e-mails por vírgula', async () => {
    const canal = await conectar(A, { codigo: `pref-${S}` });
    expect(await lerPreferencias(A.tenantId, canal.id)).toEqual({
      quickReply: true,
      menu: true,
      alertaRecategorizacao: { ativo: true, emails: [] },
    });
    await gravarPreferencias(A.tenantId, A.adminId, canal.id, { menu: false });
    const depois = await gravarPreferencias(A.tenantId, A.adminId, canal.id, {
      alertaRecategorizacao: { emails: ' Ana@Pipe.app, bia@pipe.app ,ana@pipe.app' },
    });
    expect(depois).toEqual({
      quickReply: true,
      menu: false,
      alertaRecategorizacao: { ativo: true, emails: ['ana@pipe.app', 'bia@pipe.app'] },
    });
    // O resto do config (token, número) sobrevive à gravação.
    expect((await lerCanalWhatsApp(A.tenantId, canal.id)).config['phoneNumberId']).toBeTruthy();
  });

  it('recusas e isolamento', async () => {
    const canal = await conectar(A, { codigo: `pref-recusa-${S}` });
    await expect(
      gravarPreferencias(A.tenantId, A.adminId, canal.id, { menu: 'sim' as unknown as boolean }),
    ).rejects.toMatchObject({ detalhe: { campo: 'menu' } });
    await expect(
      gravarPreferencias(A.tenantId, A.adminId, canal.id, { alertaRecategorizacao: { emails: 'nao-e-email' } }),
    ).rejects.toMatchObject({ detalhe: { campo: 'emails' } });
    await expect(lerPreferencias(B.tenantId, canal.id)).rejects.toMatchObject({ status: 404 });
  });

  it('formato da pergunta segue a régua da origem: até 3 botões, até 10 lista, senão texto', () => {
    const ligado = { quickReply: true, menu: true };
    expect(formatoDaPergunta(3, ligado)).toBe('botoes');
    expect(formatoDaPergunta(4, ligado)).toBe('lista');
    expect(formatoDaPergunta(10, ligado)).toBe('lista');
    expect(formatoDaPergunta(11, ligado)).toBe('texto');
    expect(formatoDaPergunta(2, { quickReply: false, menu: true })).toBe('lista');
    expect(formatoDaPergunta(2, { quickReply: false, menu: false })).toBe('texto');
    expect(formatoDaPergunta(0, ligado)).toBe('texto');
  });
});

describe('eventos de modelo pelo webhook (status e recategorização)', () => {
  const evento = (field: string, value: Record<string, unknown>) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field, value }] }],
  });

  it('aprovação e recategorização chegam sozinhas; modelo desconhecido é ignorado', async () => {
    const canal = await conectar(A, { codigo: `eventos-${S}` });
    await criarModeloNaMeta(A.tenantId, A.adminId, canal.id, {
      nome: 'lembrete',
      categoria: 'utilidade',
      corpo: 'Oi',
    });
    const resolvido = (await resolverCanal(canal.id))!;

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
      await aplicarEventosDeModelo(
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
      await aplicarEventosDeModelo(
        resolvido,
        evento('message_template_status_update', {
          event: 'REJECTED',
          message_template_name: 'nao_existe',
          message_template_language: 'pt_BR',
        }),
      ),
    ).toBe(0);

    const { rows } = await dono.execute<{ status_meta: string; categoria: string }>(sql`
      select status_meta, categoria from template_mensagem where canal_id = ${canal.id}::uuid
    `);
    expect(rows).toEqual([{ status_meta: 'aprovado', categoria: 'marketing' }]);
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
