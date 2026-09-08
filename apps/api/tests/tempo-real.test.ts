import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 23).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_ORIGENS'] = 'http://localhost:3200';
// Ping rápido para o teste não esperar 15 segundos pelo quadro de controle.
process.env['PIPE_WS_PING_MS'] = '150';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { evento, publicar, conexoesVivas } = await import('../src/tempo-real.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Tempo real: o canal, a autenticação e — o que mais importa — o ISOLAMENTO.
 *
 * A regra que o dono não abre mão: uma conexão só recebe evento do próprio tenant, e o
 * que é de uma pessoa só chega a ela. Isso não se confere por leitura; confere-se
 * abrindo dois tenants de verdade e provando que um não escuta o outro.
 */

let cenario: Cenario;
let outro: Cenario;
let api: ApiNoAr;
let urlWs: string;

async function abrirSessao(alvo: Cenario, usuarioId?: string): Promise<string> {
  const novo = criarToken();
  await alvo.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${alvo.tenantId}, ${usuarioId ?? alvo.atendenteId}, ${novo.hash},
            ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

beforeAll(async () => {
  cenario = await montarCenario(`ws-${randomUUID().slice(0, 8)}`);
  outro = await montarCenario(`ws-outro-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  urlWs = `${api.url.replace('http://', 'ws://')}/v1/eventos`;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
  await outro.encerrar();
});

const abertos: WebSocket[] = [];

/**
 * Fecha TODO socket aberto no caso anterior e espera o registro esvaziar.
 *
 * Sem isto, um caso empresta conexão para o seguinte e `conexoesVivas` conta lixo —
 * o teste do isolamento passaria a depender da ordem, que é a pior forma de um teste
 * de segurança falhar.
 */
afterEach(async () => {
  for (const ws of abertos.splice(0)) ws.close();
  const limite = Date.now() + 3_000;
  while (conexoesVivas() > 0 && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 20));
  }
});

interface Cliente {
  ws: WebSocket;
  recebidos: unknown[];
  fechar: () => void;
}

/** Conecta, assina os assuntos e espera a confirmação do servidor. */
async function conectar(token: string, assuntos: string[] = ['conversa', 'fila', 'atendente']) {
  const ws = new WebSocket(urlWs, {
    headers: { cookie: `${NOME_DO_COOKIE}=${token}`, origin: 'http://localhost:3200' },
  });
  abertos.push(ws);
  const recebidos: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const inscrito = new Promise<void>((resolve) => {
    ws.on('message', (cru) => {
      const q = JSON.parse(String(cru)) as { tipo?: string };
      if (q.tipo === 'inscrito') resolve();
      // O `ping` do contrato não é evento; não polui o que o teste inspeciona.
      else if (q.tipo !== 'ping') recebidos.push(q);
    });
  });
  ws.send(JSON.stringify({ assuntos }));
  await inscrito;
  return { ws, recebidos, fechar: () => ws.close() } satisfies Cliente;
}

/** Espera o evento chegar, sem `sleep` fixo: o canal é rápido, a máquina nem sempre. */
async function esperar(cliente: Cliente, quantos = 1, tetoMs = 3_000): Promise<void> {
  const limite = Date.now() + tetoMs;
  while (cliente.recebidos.length < quantos && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('autenticação do canal', () => {
  it('sem cookie, o socket nem chega a existir', async () => {
    const ws = new WebSocket(urlWs, { headers: { origin: 'http://localhost:3200' } });
    const erro = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(String(erro.message)).toContain('401');
  });

  it('cookie forjado, 401', async () => {
    const ws = new WebSocket(urlWs, {
      headers: { cookie: `${NOME_DO_COOKIE}=${criarToken().token}`, origin: 'http://localhost:3200' },
    });
    const erro = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(String(erro.message)).toContain('401');
  });

  it('origem fora de PIPE_ORIGENS, 403 — CORS não vale para WebSocket', async () => {
    // Sem esta conferência, um site qualquer abriria o socket e o navegador anexaria
    // o cookie da vítima: cross-site WebSocket hijacking.
    const token = await abrirSessao(cenario);
    const ws = new WebSocket(urlWs, {
      headers: { cookie: `${NOME_DO_COOKIE}=${token}`, origin: 'https://site-do-mal.example' },
    });
    const erro = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(String(erro.message)).toContain('403');
  });

  it('caminho errado, 404', async () => {
    const token = await abrirSessao(cenario);
    const ws = new WebSocket(`${api.url.replace('http://', 'ws://')}/v1/outra-coisa`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${token}`, origin: 'http://localhost:3200' },
    });
    const erro = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(String(erro.message)).toContain('404');
  });
});

describe('inscrição', () => {
  it('confirma os assuntos pedidos', async () => {
    const cliente = await conectar(await abrirSessao(cenario), ['conversa']);
    // A confirmação já foi esperada em `conectar`.
    expect(conexoesVivas(cenario.tenantId)).toBeGreaterThan(0);
    cliente.fechar();
  });

  it('recusa assunto que não existe', async () => {
    const ws = new WebSocket(urlWs, {
      headers: {
        cookie: `${NOME_DO_COOKIE}=${await abrirSessao(cenario)}`,
        origin: 'http://localhost:3200',
      },
    });
    abertos.push(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const resposta = new Promise<{ tipo: string; motivo?: string }>((resolve) => {
      ws.on('message', (cru) => {
        const q = JSON.parse(String(cru)) as { tipo: string; motivo?: string };
        if (q.tipo !== 'ping') resolve(q);
      });
    });
    ws.send(JSON.stringify({ assuntos: ['banco_de_dados_inteiro'] }));

    const q = await resposta;
    expect(q.tipo).toBe('recusado');
    expect(q.motivo).toBe('assunto_desconhecido');
    ws.close();
  });

  it('sem inscrição não chega evento nenhum', async () => {
    const ws = new WebSocket(urlWs, {
      headers: {
        cookie: `${NOME_DO_COOKIE}=${await abrirSessao(cenario)}`,
        origin: 'http://localhost:3200',
      },
    });
    abertos.push(ws);
    const recebidos: unknown[] = [];
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.on('message', (cru) => {
      const q = JSON.parse(String(cru)) as { tipo?: string };
      if (q.tipo !== 'ping') recebidos.push(q);
    });

    await publicar(cenario.tenantId, evento('conversa', randomUUID()));
    await new Promise((r) => setTimeout(r, 400));

    expect(recebidos).toHaveLength(0);
    ws.close();
  });
});

describe('isolamento — a regra que não se dobra', () => {
  it('entrega o evento do PRÓPRIO tenant', async () => {
    const cliente = await conectar(await abrirSessao(cenario));
    const conversaId = randomUUID();

    await publicar(cenario.tenantId, evento('conversa', conversaId));
    await esperar(cliente);

    expect(cliente.recebidos).toEqual([
      { assunto: 'conversa', id: conversaId, em: expect.any(String) },
    ]);
    cliente.fechar();
  });

  it('NUNCA entrega evento de outro tenant', async () => {
    const meu = await conectar(await abrirSessao(cenario));
    const alheio = await conectar(await abrirSessao(outro));

    await publicar(outro.tenantId, evento('conversa', randomUUID()));
    await esperar(alheio);
    // Folga extra: se fosse vazar, teria tempo de sobra para chegar.
    await new Promise((r) => setTimeout(r, 300));

    expect(alheio.recebidos).toHaveLength(1);
    expect(meu.recebidos).toHaveLength(0);
    meu.fechar();
    alheio.fechar();
  });

  it('evento com dono só chega ao dono', async () => {
    // É o que o chat do gestor com o atendente exige.
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${cenario.tenantId}, 'Outra Pessoa', ${`p-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
      returning id
    `);
    const outraPessoaId = rows[0]!.id;

    const dono = await conectar(await abrirSessao(cenario, outraPessoaId));
    const colega = await conectar(await abrirSessao(cenario));

    await publicar(cenario.tenantId, {
      ...evento('atendente', outraPessoaId),
      usuarioId: outraPessoaId,
    });
    await esperar(dono);
    await new Promise((r) => setTimeout(r, 300));

    expect(dono.recebidos).toHaveLength(1);
    // Mesmo tenant, mesma inscrição — e ainda assim não recebe.
    expect(colega.recebidos).toHaveLength(0);
    dono.fechar();
    colega.fechar();
  });

  it('só entrega o assunto assinado', async () => {
    const cliente = await conectar(await abrirSessao(cenario), ['fila']);

    await publicar(cenario.tenantId, evento('conversa', randomUUID()));
    await publicar(cenario.tenantId, evento('fila'));
    await esperar(cliente);
    await new Promise((r) => setTimeout(r, 200));

    expect(cliente.recebidos).toEqual([{ assunto: 'fila', em: expect.any(String) }]);
    cliente.fechar();
  });
});

describe('o evento diz O QUE mudou, nunca O QUE É', () => {
  it('o payload tem só assunto, id e hora — nada do registro', async () => {
    const cliente = await conectar(await abrirSessao(cenario), ['conversa']);
    const conversaId = randomUUID();

    await publicar(cenario.tenantId, evento('conversa', conversaId));
    await esperar(cliente);

    const recebido = cliente.recebidos[0] as Record<string, unknown>;
    expect(Object.keys(recebido).sort()).toEqual(['assunto', 'em', 'id']);
    // `usuarioId` é endereçamento interno e não pode vazar para o cliente.
    expect(recebido['usuarioId']).toBeUndefined();
    cliente.fechar();
  });
});

describe('queda', () => {
  it('a conexão some do registro quando o socket fecha', async () => {
    const antes = conexoesVivas(cenario.tenantId);
    const cliente = await conectar(await abrirSessao(cenario));
    expect(conexoesVivas(cenario.tenantId)).toBe(antes + 1);

    cliente.fechar();
    const limite = Date.now() + 2_000;
    while (conexoesVivas(cenario.tenantId) > antes && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 20));
    }
    // Conexão que não some do registro é vazamento de memória e entrega para socket
    // morto — o processo ficaria escrevendo em quem já foi embora.
    expect(conexoesVivas(cenario.tenantId)).toBe(antes);
  });

  it('manda o `ping` do contrato, que é como a tela sabe que está viva', async () => {
    const ws = new WebSocket(urlWs, {
      headers: {
        cookie: `${NOME_DO_COOKIE}=${await abrirSessao(cenario)}`,
        origin: 'http://localhost:3200',
      },
    });
    abertos.push(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const ping = await new Promise<{ tipo: string }>((resolve) => {
      ws.on('message', (cru) => {
        const q = JSON.parse(String(cru)) as { tipo: string };
        if (q.tipo === 'ping') resolve(q);
      });
    });
    expect(ping.tipo).toBe('ping');
    ws.close();
  });
});
