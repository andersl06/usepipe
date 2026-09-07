import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ClienteMeta } from '../src/dominio/meta.js';

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

const { estaCifrado } = await import('@pipe/db');
const { conectarWhatsApp, desconectarWhatsApp, listarCanaisWhatsApp, urlDoWebhook } = await import(
  '../src/dominio/canais.js'
);
const { ClienteMetaReal, definirClienteMeta, dubleMeta } = await import('../src/dominio/meta.js');
const { ErroPipe } = await import('../src/erros.js');
const { montarCenario } = await import('./ajuda.js');
const { esquecerCanal, fecharBancos } = await import('../src/banco.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Conectar o WhatsApp do cliente, com banco de verdade e sem tocar na Meta.
 *
 * A conversa com o Graph tem duas provas separadas, e é de propósito:
 *
 * - o **dublê** exercita o caminho inteiro (troca de código → canal → override),
 *   que é o que o dono roda na VPS antes de o aplicativo ser aprovado;
 * - o **cliente real** é exercitado com `fetch` injetado, como `trocarCodigo` do
 *   Google faz — código inválido e override recusado passam pelo mesmo código que
 *   vai para produção, sem uma única chamada de rede.
 */

const SUFIXO = randomUUID().slice(0, 8);

let cenario: Cenario;
let outro: Cenario;
let admin: string;

/** Uma sessão só não basta: `conectarWhatsApp` grava auditoria com o autor. */
beforeAll(async () => {
  cenario = await montarCenario(`canais-${SUFIXO}`);
  outro = await montarCenario(`canais-b-${SUFIXO}`);

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Admin', ${`admin-${SUFIXO}@e2e.pipe.app`})
    returning id
  `);
  admin = rows[0]!.id;

  // O cenário já traz um canal de WhatsApp da semente, sem `numero_id`. Ele não
  // atrapalha: o teste sempre olha o canal pelo id que a conexão devolveu.
}, 180_000);

afterAll(async () => {
  definirClienteMeta(null);
  await outro?.encerrar();
  await cenario?.encerrar();
  await fecharBancos();
});

beforeEach(() => {
  definirClienteMeta(null);
  dubleMeta.reiniciar();
  esquecerCanal();
});

/**
 * O dublê com UM método trocado.
 *
 * Espalhar a instância não serve: método de classe mora no protótipo e some no
 * `...`. Delegar explicitamente é o que mantém o resto do caminho igual ao real.
 */
function dubleCom(sobrescrever: Partial<ClienteMeta>): ClienteMeta {
  return {
    nome: 'duble',
    trocarCodigo: (c) => dubleMeta.trocarCodigo(c),
    descobrirConta: (t) => dubleMeta.descobrirConta(t),
    assinarCampos: (w, t) => dubleMeta.assinarCampos(w, t),
    definirOverride: (n, t, u, v) => dubleMeta.definirOverride(n, t, u, v),
    apagarOverride: (n, t) => dubleMeta.apagarOverride(n, t),
    lerNumero: (n, t) => dubleMeta.lerNumero(n, t),
    ...sobrescrever,
  };
}

/** Um `fetch` de mentira: devolve, em ordem, o que cada chamada deve receber. */
function fetchFalso(respostas: { ok?: boolean; status?: number; corpo: unknown }[]): {
  buscar: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  let indice = 0;
  const buscar = (async (url: string | URL) => {
    urls.push(String(url));
    const proxima = respostas[Math.min(indice, respostas.length - 1)]!;
    indice += 1;
    return {
      ok: proxima.ok ?? true,
      status: proxima.status ?? (proxima.ok === false ? 400 : 200),
      text: async () => JSON.stringify(proxima.corpo),
    } as Response;
  }) as unknown as typeof fetch;
  return { buscar, urls };
}

describe('conectar pelo cadastro embutido, com o dublê', () => {
  it('cria o canal, cifra o token e aponta o override para a rota do canal', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `codigo-${SUFIXO}`,
    });

    expect(canal.estado).toBe('conectado');
    expect(canal.ativo).toBe(true);
    expect(canal.numeroId).toBeTruthy();
    expect(canal.wabaId).toBeTruthy();
    expect(canal.webhookUrl).toBe(`https://api.teste/webhooks/whatsapp/${canal.id}`);

    // O override foi configurado, e para a URL DAQUELE canal.
    const override = dubleMeta.chamadas.find((c) => c.acao === 'override');
    expect(override?.url).toBe(urlDoWebhook(canal.id));
    expect(dubleMeta.chamadas.some((c) => c.acao === 'assinar')).toBe(true);

    // Token e verifyToken vivem CIFRADOS na coluna. Isto é o que um `pg_dump` veria.
    const { rows } = await cenario.dono.execute<{
      config: Record<string, unknown>;
      numero_id: string;
      waba_id: string;
    }>(sql`select config, numero_id, waba_id from canal where id = ${canal.id}::uuid`);
    const config = rows[0]!.config;
    expect(estaCifrado(String(config['tokenAcesso']))).toBe(true);
    expect(estaCifrado(String(config['verifyToken']))).toBe(true);
    expect(estaCifrado(String(config['appSecret']))).toBe(true);
    // O que NÃO é segredo continua legível: é o que se lê no diagnóstico.
    expect(config['phoneNumberId']).toBe(canal.numeroId);
    expect(rows[0]!.numero_id).toBe(canal.numeroId);
    expect(rows[0]!.waba_id).toBe(canal.wabaId);
  });

  it('cria a caixa de entrada: canal sem inbox recebe mensagem que não tem onde cair', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `inbox-${SUFIXO}`,
    });
    const { rows } = await cenario.dono.execute<{ fila_padrao_id: string | null }>(
      sql`select fila_padrao_id from inbox where canal_id = ${canal.id}::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fila_padrao_id).toBe(cenario.filaId);
  });

  it('cada canal tem o seu verify_token, e ele não se repete', async () => {
    const um = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `vt-a-${SUFIXO}`,
    });
    const dois = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `vt-b-${SUFIXO}`,
    });
    const { rows } = await cenario.dono.execute<{ config: Record<string, unknown> }>(
      sql`select config from canal where id in (${um.id}::uuid, ${dois.id}::uuid)`,
    );
    const tokens = rows.map((r) => String(r.config['verifyToken']));
    expect(new Set(tokens).size).toBe(2);
  });

  it('reconectar o MESMO número no mesmo tenant atualiza o canal, não cria outro', async () => {
    const codigo = `mesmo-${SUFIXO}`;
    const primeira = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo,
    });
    const segunda = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo,
      nome: 'Renomeado',
    });
    expect(segunda.id).toBe(primeira.id);
    expect(segunda.nome).toBe('Renomeado');
  });

  it('número já usado por OUTRO tenant é barrado pelo índice único', async () => {
    const codigo = `disputado-${SUFIXO}`;
    await conectarWhatsApp({ tenantId: cenario.tenantId, usuarioId: admin, codigo });

    const { rows } = await outro.dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${outro.tenantId}, 'Admin B', ${`admin-b-${SUFIXO}@e2e.pipe.app`})
      returning id
    `);

    await expect(
      conectarWhatsApp({ tenantId: outro.tenantId, usuarioId: rows[0]!.id, codigo }),
    ).rejects.toMatchObject({ codigo: 'numero_em_uso', status: 409 });
  });

  it('código vazio nem chega à Meta', async () => {
    await expect(
      conectarWhatsApp({ tenantId: cenario.tenantId, usuarioId: admin, codigo: '   ' }),
    ).rejects.toMatchObject({ codigo: 'codigo_ausente', status: 400 });
    expect(dubleMeta.chamadas).toHaveLength(0);
  });

  it('código recusado pela Meta não cria canal nenhum', async () => {
    const antes = await contarCanais(cenario);
    await expect(
      conectarWhatsApp({ tenantId: cenario.tenantId, usuarioId: admin, codigo: 'invalido-x' }),
    ).rejects.toMatchObject({ codigo: 'meta_recusou' });
    expect(await contarCanais(cenario)).toBe(antes);
  });

  it('override recusado pela Meta desfaz o canal: canal sem override nunca receberia nada', async () => {
    const antes = await contarCanais(cenario);
    definirClienteMeta(
      dubleCom({
        definirOverride: () =>
          Promise.reject(new ErroPipe(502, 'meta_recusou', 'A Meta recusou: URL não permitida.')),
      }),
    );

    await expect(
      conectarWhatsApp({
        tenantId: cenario.tenantId,
        usuarioId: admin,
        codigo: `override-ruim-${SUFIXO}`,
      }),
    ).rejects.toMatchObject({ codigo: 'meta_recusou' });
    expect(await contarCanais(cenario)).toBe(antes);
  });
});

describe('estado da conexão', () => {
  it('traz número, qualidade e limite do canal ligado', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `estado-${SUFIXO}`,
    });
    const lista = await listarCanaisWhatsApp(cenario.tenantId);
    const meu = lista.find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'conectado', qualidade: 'GREEN', limite: 'TIER_1K' });
    expect(meu?.numero).toBeTruthy();
  });

  it('Meta fora do ar vira `indisponivel` com motivo, não erro na tela inteira', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `indisponivel-${SUFIXO}`,
    });
    definirClienteMeta(
      dubleCom({
        lerNumero: () => Promise.reject(new ErroPipe(502, 'meta_inacessivel', 'sem rede')),
      }),
    );

    const meu = (await listarCanaisWhatsApp(cenario.tenantId)).find((c) => c.id === canal.id);
    expect(meu).toMatchObject({ estado: 'indisponivel', motivo: 'meta_inacessivel' });
  });
});

describe('desconectar', () => {
  it('apaga o override, desliga o canal e NÃO apaga a conversa', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `desligar-${SUFIXO}`,
    });

    const { rows: caixas } = await cenario.dono.execute<{ id: string }>(
      sql`select id from inbox where canal_id = ${canal.id}::uuid`,
    );
    const { rows: contatos } = await cenario.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${cenario.tenantId}, 'Cliente')
      returning id
    `);
    await cenario.dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, estado)
      values (${cenario.tenantId}, ${caixas[0]!.id}, ${contatos[0]!.id}, 'na_fila')
    `);

    dubleMeta.reiniciar();
    const depois = await desconectarWhatsApp(cenario.tenantId, admin, canal.id);
    expect(depois.ativo).toBe(false);
    expect(depois.estado).toBe('desligado');
    expect(dubleMeta.chamadas.some((c) => c.acao === 'apagar_override')).toBe(true);

    const { rows: sobrou } = await cenario.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from conversa where inbox_id = ${caixas[0]!.id}::uuid`,
    );
    expect(Number(sobrou[0]!.n)).toBe(1);
  });

  it('canal de outro tenant é 404, não 403: nem a existência dele se confirma', async () => {
    const canal = await conectarWhatsApp({
      tenantId: cenario.tenantId,
      usuarioId: admin,
      codigo: `alheio-${SUFIXO}`,
    });
    await expect(
      desconectarWhatsApp(outro.tenantId, admin, canal.id),
    ).rejects.toMatchObject({ codigo: 'nao_encontrado', status: 404 });
  });
});

describe('o cliente real, com fetch injetado — nenhuma chamada sai para a rede', () => {
  it('troca o código, descobre WABA e número e configura o override', async () => {
    const { buscar, urls } = fetchFalso([
      { corpo: { access_token: 'token-do-cliente-abcdefgh' } },
      {
        corpo: {
          data: {
            granular_scopes: [
              { scope: 'whatsapp_business_messaging', target_ids: ['waba-1'] },
              { scope: 'whatsapp_business_management', target_ids: ['waba-1'] },
            ],
          },
        },
      },
      { corpo: { data: [{ id: '77712345', display_phone_number: '+55 11 98888-7777' }] } },
      { corpo: { success: true } },
    ]);
    const real = new ClienteMetaReal(buscar);

    const token = await real.trocarCodigo('codigo-da-meta');
    expect(token).toBe('token-do-cliente-abcdefgh');

    const conta = await real.descobrirConta(token);
    expect(conta).toMatchObject({ wabaId: 'waba-1', numeroId: '77712345' });

    await real.definirOverride('77712345', token, 'https://api.teste/webhooks/whatsapp/x', 'vt');
    // O `client_secret` vai no corpo do POST, nunca na URL.
    expect(urls[0]).toBe('https://graph.facebook.com/v21.0/oauth/access_token');
    expect(urls.some((u) => u.includes('segredo-do-app-da-meta'))).toBe(false);
  });

  it('código inválido vira erro da Meta, e o segredo do app não aparece na mensagem', async () => {
    const { buscar } = fetchFalso([
      {
        ok: false,
        status: 400,
        corpo: {
          error: {
            code: 100,
            message: 'Invalid verification code for app segredo-do-app-da-meta',
          },
        },
      },
    ]);
    const real = new ClienteMetaReal(buscar);
    const erro = await real.trocarCodigo('codigo-ruim').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroPipe);
    expect((erro as InstanceType<typeof ErroPipe>).codigo).toBe('meta_recusou');
    // Nem o segredo do app nem o código ecoado sobrevivem à mensagem de erro.
    expect((erro as Error).message).not.toContain('segredo-do-app-da-meta');
    expect((erro as Error).message).toContain('«segredo»');
  });

  it('override recusado vira 502 com o código da Meta, sem o token do cliente', async () => {
    const { buscar } = fetchFalso([
      {
        ok: false,
        status: 400,
        corpo: {
          error: { code: 190, message: 'Token token-do-cliente-abcdefgh has expired' },
        },
      },
    ]);
    const real = new ClienteMetaReal(buscar);
    const erro = (await real
      .definirOverride('7771', 'token-do-cliente-abcdefgh', 'https://api.teste/w', 'vt')
      .catch((e: unknown) => e)) as InstanceType<typeof ErroPipe>;

    expect(erro.status).toBe(502);
    expect(erro.codigo).toBe('meta_recusou');
    expect(erro.detalhe).toMatchObject({ codigo_meta: 190 });
    expect(erro.message).not.toContain('token-do-cliente-abcdefgh');
  });

  it('token sem WABA nenhum é recusado antes de gravar qualquer coisa', async () => {
    const { buscar } = fetchFalso([{ corpo: { data: { granular_scopes: [] } } }]);
    const real = new ClienteMetaReal(buscar);
    await expect(real.descobrirConta('token-do-cliente-abcdefgh')).rejects.toMatchObject({
      codigo: 'sem_waba',
    });
  });
});

describe('o desafio de inscrição do webhook do aplicativo', () => {
  it('devolve o `hub.challenge` cru com o token do ambiente, e 403 sem ele', async () => {
    const { ControladorWebhookWhatsApp } = await import('../src/controladores/webhooks-whatsapp.js');
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'token-do-aplicativo';
    const controlador = new ControladorWebhookWhatsApp();

    const visto: string[] = [];
    const resposta = {
      status: () => resposta,
      type: () => resposta,
      send: (corpo: string) => visto.push(corpo),
    } as unknown as Parameters<typeof controlador.verificarDaConta>[3];

    await controlador.verificarDaConta('subscribe', 'token-do-aplicativo', 'desafio-42', resposta);
    expect(visto).toEqual(['desafio-42']);

    await expect(
      controlador.verificarDaConta('subscribe', 'chute', 'desafio-42', resposta),
    ).rejects.toMatchObject({ codigo: 'verificacao_recusada', status: 403 });
  });
});

async function contarCanais(qual: Cenario): Promise<number> {
  const { rows } = await qual.dono.execute<{ n: string }>(
    sql`select count(*)::text as n from canal where tenant_id = ${qual.tenantId}::uuid`,
  );
  return Number(rows[0]!.n);
}
