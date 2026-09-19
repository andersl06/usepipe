import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 29).toString('base64')}`;

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * As três telas de Integrações do fluxo (`dominio/gestao/integracoes.ts`):
 * chaves de acesso por fluxo, informações de conexão e webhook de saída.
 *
 * O que vale provar: as duas permissões diferentes (`chave_api.gerenciar`
 * para chave, `automacao.integracao.gerenciar` para webhook/conexão — a
 * leitura da conexão usa `automacao.fluxo.editar`), o limite de 3 chaves, o
 * segredo/token aparecendo só na criação e nunca mais, a recusa de SSRF
 * (http, localhost, IP privado), o cross-tenant e o uuid malformado como
 * 404, e o `webhook_saida` sendo da CONTA (não filtra por fluxo).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Tem as três permissões — chave, integração e edição de fluxo. */
let sessaoCompleta: string;
/** Só edita fluxo: prova que ler a conexão não pede a permissão de integração. */
let sessaoSoEditor: string;
/** Sem nenhuma das três. */
let sessaoSemPoder: string;
/** Tenant B, com as três permissões — prova que o tenant vem da sessão. */
let sessaoDoOutroTenant: string;
let fluxoId: string;

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return usuarioId;

  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  const papelId = papeis[0]!.id;
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papelId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papelId})
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

async function criarFluxo(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
  `);
  return rows[0]!.id;
}

type Resposta<T> = { status: number; corpo: T };

async function pedir<T>(
  caminho: string,
  sessao: string,
  init: RequestInit = {},
): Promise<Resposta<T>> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    ...init,
    headers: comCookie(sessao),
  });
  return { status: resposta.status, corpo: (await resposta.json().catch(() => null)) as T };
}

const get = <T>(caminho: string, sessao: string) => pedir<T>(caminho, sessao);
const post = <T>(caminho: string, sessao: string, corpo?: unknown) =>
  pedir<T>(caminho, sessao, { method: 'POST', body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
const patch = <T>(caminho: string, sessao: string, corpo: unknown) =>
  pedir<T>(caminho, sessao, { method: 'PATCH', body: JSON.stringify(corpo) });
const put = <T>(caminho: string, sessao: string, corpo: unknown) =>
  pedir<T>(caminho, sessao, { method: 'PUT', body: JSON.stringify(corpo) });
const del = <T>(caminho: string, sessao: string) => pedir<T>(caminho, sessao, { method: 'DELETE' });

beforeAll(async () => {
  a = await montarCenario(`ig-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ig-${randomUUID().slice(0, 8)}`);

  const completo = await pessoaCom(a, [
    'chave_api.gerenciar',
    'automacao.integracao.gerenciar',
    'automacao.fluxo.editar',
  ]);
  const soEditor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  const completoDoB = await pessoaCom(b, [
    'chave_api.gerenciar',
    'automacao.integracao.gerenciar',
    'automacao.fluxo.editar',
  ]);

  api = await subirApi(0);
  sessaoCompleta = await abrirSessao(a, completo);
  sessaoSoEditor = await abrirSessao(a, soEditor);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, completoDoB);
  fluxoId = await criarFluxo(a, `Fluxo de integração ${randomUUID().slice(0, 6)}`);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('Chaves de acesso do fluxo', () => {
  it('cria, mostra o token só na criação, e a lista seguinte só tem o prefixo', async () => {
    const { status, corpo } = await post<{
      id: string;
      nome: string;
      prefixo: string;
      token: string;
    }>(`/v1/gestao/fluxos/${fluxoId}/chaves`, sessaoCompleta, { nome: 'Integração CRM' });
    expect(status).toBe(201);
    expect(corpo.token).toMatch(/^pipe_[0-9a-f]{12}_[0-9a-f]{48}$/);
    expect(corpo.prefixo).toBe(corpo.token.split('_')[1]);

    const linha = (
      await a.dono.execute<{ hash: string; fluxo_id: string }>(sql`
        select hash, fluxo_id from chave_api where id = ${corpo.id}::uuid
      `)
    ).rows[0];
    expect(linha?.fluxo_id).toBe(fluxoId);
    // O banco guarda o HASH sha256, não o segredo em claro que veio no token.
    expect(linha?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(linha?.hash).not.toBe(corpo.token.split('_')[2]);

    const lista = await get<Array<Record<string, unknown>>>(
      `/v1/gestao/fluxos/${fluxoId}/chaves`,
      sessaoCompleta,
    );
    expect(lista.status).toBe(200);
    const criada = lista.corpo.find((c) => c['id'] === corpo.id);
    expect(criada).toBeDefined();
    expect(criada).not.toHaveProperty('token');
    expect(criada).not.toHaveProperty('hash');
    expect(criada?.['prefixo']).toBe(corpo.prefixo);
  });

  it('sem nome é 400; no limite de 3 chaves vivas, a quarta é 400', async () => {
    const fluxoDoLimite = await criarFluxo(a, `Limite ${randomUUID().slice(0, 6)}`);
    const semNome = await post(`/v1/gestao/fluxos/${fluxoDoLimite}/chaves`, sessaoCompleta, {
      nome: '   ',
    });
    expect(semNome.status).toBe(400);
    expect((semNome.corpo as { erro: { codigo: string } }).erro.codigo).toBe('nome_ausente');

    for (let i = 0; i < 3; i += 1) {
      const criada = await post(`/v1/gestao/fluxos/${fluxoDoLimite}/chaves`, sessaoCompleta, {
        nome: `Chave ${i}`,
      });
      expect(criada.status).toBe(201);
    }
    const quarta = await post(`/v1/gestao/fluxos/${fluxoDoLimite}/chaves`, sessaoCompleta, {
      nome: 'Quarta',
    });
    expect(quarta.status).toBe(400);
    expect((quarta.corpo as { erro: { codigo: string } }).erro.codigo).toBe('limite_de_chaves');
  });

  it('sem chave_api.gerenciar é 403; de outro tenant e uuid malformado são 404', async () => {
    const semPoder = await post(`/v1/gestao/fluxos/${fluxoId}/chaves`, sessaoSemPoder, {
      nome: 'Proibida',
    });
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo as { erro: { detalhe: { permissao: string } } }).erro.detalhe.permissao).toBe(
      'chave_api.gerenciar',
    );

    const outroTenant = await post(`/v1/gestao/fluxos/${fluxoId}/chaves`, sessaoDoOutroTenant, {
      nome: 'Vizinho',
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await get(`/v1/gestao/fluxos/nao-e-uuid/chaves`, sessaoCompleta);
    expect(malformado.status).toBe(404);
  });

  it('excluir REVOGA (não apaga a linha) e é idempotente; cross-tenant e sem permissão são recusa', async () => {
    const criada = await post<{ id: string }>(`/v1/gestao/fluxos/${fluxoId}/chaves`, sessaoCompleta, {
      nome: `A revogar ${randomUUID().slice(0, 6)}`,
    });
    expect(criada.status).toBe(201);
    const chaveId = criada.corpo.id;

    const outroTenant = await del(`/v1/gestao/fluxos/${fluxoId}/chaves/${chaveId}`, sessaoDoOutroTenant);
    expect(outroTenant.status).toBe(404);

    const semPoder = await del(`/v1/gestao/fluxos/${fluxoId}/chaves/${chaveId}`, sessaoSemPoder);
    expect(semPoder.status).toBe(403);

    const primeira = await del(`/v1/gestao/fluxos/${fluxoId}/chaves/${chaveId}`, sessaoCompleta);
    expect(primeira.status).toBe(204);

    const linha = (
      await a.dono.execute<{ revogada_em: Date | null }>(
        sql`select revogada_em from chave_api where id = ${chaveId}::uuid`,
      )
    ).rows[0];
    expect(linha).toBeDefined();
    expect(linha?.revogada_em).not.toBeNull();

    // Idempotente: revogar de novo não é erro, e não duplica o registro de auditoria.
    const segunda = await del(`/v1/gestao/fluxos/${fluxoId}/chaves/${chaveId}`, sessaoCompleta);
    expect(segunda.status).toBe(204);
    const log = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from log_auditoria
       where objeto_tipo = 'chave_api' and objeto_id = ${chaveId}::uuid and acao = 'desativou'
    `);
    expect(log.rows[0]?.n).toBe('1');
  });
});

describe('Informações de conexão do fluxo', () => {
  it('lê com automacao.fluxo.editar; identificador e endpoint são reais', async () => {
    const conexaoFluxo = await criarFluxo(a, `Conexão ${randomUUID().slice(0, 6)}`);
    const { status, corpo } = await get<{
      fluxoId: string;
      endpoint: string;
      chavePrefixo: string | null;
      urlMensagens: string | null;
      urlNotificacoes: string | null;
    }>(`/v1/gestao/fluxos/${conexaoFluxo}/conexao`, sessaoSoEditor);
    expect(status).toBe(200);
    expect(corpo.fluxoId).toBe(conexaoFluxo);
    expect(corpo.endpoint).toMatch(/\/v1$/);
    expect(corpo.urlMensagens).toBeNull();
    expect(corpo.urlNotificacoes).toBeNull();
  });

  it('recusa SSRF: http, localhost e IP privado; aceita https e some ao apagar', async () => {
    const conexaoFluxo = await criarFluxo(a, `SSRF ${randomUUID().slice(0, 6)}`);

    for (const urlProibida of [
      'http://exemplo.pipe.app/webhook',
      'https://localhost/webhook',
      'https://127.0.0.1/webhook',
      'https://10.0.0.5/webhook',
      'https://192.168.1.1/webhook',
    ]) {
      const resposta = await put(`/v1/gestao/fluxos/${conexaoFluxo}/conexao`, sessaoCompleta, {
        urlMensagens: urlProibida,
      });
      expect(resposta.status, urlProibida).toBe(400);
    }

    const salva = await put<{ urlMensagens: string | null }>(
      `/v1/gestao/fluxos/${conexaoFluxo}/conexao`,
      sessaoCompleta,
      { urlMensagens: 'https://exemplo.pipe.app/mensagens' },
    );
    expect(salva.status).toBe(200);
    expect(salva.corpo.urlMensagens).toBe('https://exemplo.pipe.app/mensagens');

    const relida = await get<{ urlMensagens: string | null }>(
      `/v1/gestao/fluxos/${conexaoFluxo}/conexao`,
      sessaoSoEditor,
    );
    expect(relida.corpo.urlMensagens).toBe('https://exemplo.pipe.app/mensagens');

    const apagada = await put<{ urlMensagens: string | null }>(
      `/v1/gestao/fluxos/${conexaoFluxo}/conexao`,
      sessaoCompleta,
      { urlMensagens: null },
    );
    expect(apagada.status).toBe(200);
    expect(apagada.corpo.urlMensagens).toBeNull();
  });

  it('só editar fluxo não basta para GRAVAR a conexão: pede automacao.integracao.gerenciar', async () => {
    const conexaoFluxo = await criarFluxo(a, `Sem integração ${randomUUID().slice(0, 6)}`);
    const resposta = await put(`/v1/gestao/fluxos/${conexaoFluxo}/conexao`, sessaoSoEditor, {
      urlMensagens: 'https://exemplo.pipe.app/mensagens',
    });
    expect(resposta.status).toBe(403);
    expect((resposta.corpo as { erro: { detalhe: { permissao: string } } }).erro.detalhe.permissao).toBe(
      'automacao.integracao.gerenciar',
    );
  });

  it('cross-tenant e uuid malformado são 404', async () => {
    const outroTenant = await get(`/v1/gestao/fluxos/${fluxoId}/conexao`, sessaoDoOutroTenant);
    expect(outroTenant.status).toBe(404);
    const malformado = await get(`/v1/gestao/fluxos/nao-e-uuid/conexao`, sessaoCompleta);
    expect(malformado.status).toBe(404);
  });
});

describe('Webhook de saída (Integrações)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cria com segredo mostrado só uma vez; recusa SSRF e evento fora do catálogo', async () => {
    const semEventos = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: 'https://exemplo.pipe.app/hook',
      eventos: [],
    });
    expect(semEventos.status).toBe(400);
    expect((semEventos.corpo as { erro: { codigo: string } }).erro.codigo).toBe('eventos_ausentes');

    const eventoInvalido = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: 'https://exemplo.pipe.app/hook',
      eventos: ['isto.nao.existe'],
    });
    expect(eventoInvalido.status).toBe(400);
    expect((eventoInvalido.corpo as { erro: { codigo: string } }).erro.codigo).toBe('evento_invalido');

    const http = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: 'http://exemplo.pipe.app/hook',
      eventos: ['mensagem.criada'],
    });
    expect(http.status).toBe(400);

    const privado = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: 'https://169.254.169.254/hook',
      eventos: ['mensagem.criada'],
    });
    expect(privado.status).toBe(400);

    const criado = await post<{ id: string; url: string; eventos: string[]; segredo: string }>(
      `/v1/gestao/webhooks`,
      sessaoCompleta,
      { url: `https://exemplo.pipe.app/hook-${randomUUID().slice(0, 8)}`, eventos: ['mensagem.criada', 'conversa.criada'] },
    );
    expect(criado.status).toBe(201);
    expect(criado.corpo.segredo).toMatch(/^[0-9a-f]{64}$/);

    const lista = await get<Array<Record<string, unknown>>>(`/v1/gestao/webhooks`, sessaoCompleta);
    const linha = lista.corpo.find((w) => w['id'] === criado.corpo.id);
    expect(linha).not.toHaveProperty('segredo');
    expect(linha?.['ativo']).toBe(true);
  });

  it('ativar/desativar registra a ação certa; excluir apaga a linha de verdade', async () => {
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/toggle-${randomUUID().slice(0, 8)}`,
      eventos: ['contato.criado'],
    });
    const id = criado.corpo.id;

    const desativado = await patch<{ ativo: boolean }>(`/v1/gestao/webhooks/${id}`, sessaoCompleta, {
      ativo: false,
    });
    expect(desativado.status).toBe(200);
    expect(desativado.corpo.ativo).toBe(false);

    const ativado = await patch<{ ativo: boolean }>(`/v1/gestao/webhooks/${id}`, sessaoCompleta, {
      ativo: true,
    });
    expect(ativado.corpo.ativo).toBe(true);

    const log = await a.dono.execute<{ acao: string }>(sql`
      select acao from log_auditoria
       where objeto_tipo = 'webhook_saida' and objeto_id = ${id}::uuid
       order by em asc
    `);
    expect(log.rows.map((l) => l.acao)).toEqual(['criou', 'desativou', 'ativou']);

    const excluido = await del(`/v1/gestao/webhooks/${id}`, sessaoCompleta);
    expect(excluido.status).toBe(204);
    const restante = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from webhook_saida where id = ${id}::uuid`,
    );
    expect(restante.rows[0]?.n).toBe('0');
  });

  it('testar assina e envia; falha de rede volta como { ok: false }, sem gravar entrega', async () => {
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/teste-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
    });
    const id = criado.corpo.id;

    // `fetch` global é usado tanto pelo domínio (para "entregar" ao webhook)
    // quanto por ESTE teste (para chamar a própria `api`) — o mesmo processo,
    // o mesmo global. O stub intercepta só a URL do webhook fake e deixa
    // tudo que vai para `api.url` (o servidor de teste) passar pelo fetch de
    // verdade, senão o teste conversa consigo mesmo.
    const fetchDeVerdade = fetch;
    const chamadas: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        return new Response('ok', { status: 200 });
      }),
    );

    const ok = await post<{ ok: boolean; status?: number }>(
      `/v1/gestao/webhooks/${id}/testar`,
      sessaoCompleta,
    );
    expect(ok.status).toBe(200);
    expect(ok.corpo.ok).toBe(true);
    expect(ok.corpo.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    const [, init] = chamadas[0]!;
    const cabecalhos = init?.headers as Record<string, string>;
    expect(cabecalhos['x-pipe-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        throw new Error('falha de rede simulada');
      }),
    );
    const falhou = await post<{ ok: boolean; erro?: string }>(
      `/v1/gestao/webhooks/${id}/testar`,
      sessaoCompleta,
    );
    expect(falhou.status).toBe(200);
    expect(falhou.corpo.ok).toBe(false);
    expect(falhou.corpo.erro).toContain('falha de rede simulada');

    const entregas = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from entrega_webhook where webhook_id = ${id}::uuid`,
    );
    expect(entregas.rows[0]?.n).toBe('0');
  });

  it('sem automacao.integracao.gerenciar é 403; de outro tenant e uuid malformado são 404', async () => {
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/perm-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
    });
    const id = criado.corpo.id;

    const semPoder = await get(`/v1/gestao/webhooks`, sessaoSemPoder);
    expect(semPoder.status).toBe(403);

    const outroTenant = await patch(`/v1/gestao/webhooks/${id}`, sessaoDoOutroTenant, { ativo: false });
    expect(outroTenant.status).toBe(404);

    const malformado = await del(`/v1/gestao/webhooks/nao-e-uuid`, sessaoCompleta);
    expect(malformado.status).toBe(404);
  });
});

describe('Webhook de saída — autenticação e cabeçalhos (migration 0036)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('autenticação básica: senha cifrada no banco, nunca devolvida, vira Authorization: Basic no teste', async () => {
    const criado = await post<{ id: string; autenticacao: Record<string, unknown> }>(
      `/v1/gestao/webhooks`,
      sessaoCompleta,
      {
        url: `https://exemplo.pipe.app/basica-${randomUUID().slice(0, 8)}`,
        eventos: ['mensagem.criada'],
        autenticacao: { tipo: 'basica', usuario: 'robo', senha: 'segredo-123' },
      },
    );
    expect(criado.status).toBe(201);
    expect(criado.corpo.autenticacao).toEqual({
      tipo: 'basica',
      usuario: 'robo',
      urlAutorizacao: null,
      clientId: null,
    });
    const id = criado.corpo.id;

    const linha = (
      await a.dono.execute<{ autenticacao_senha: string }>(
        sql`select autenticacao_senha from webhook_saida where id = ${id}::uuid`,
      )
    ).rows[0];
    expect(linha?.autenticacao_senha).toMatch(/^pipev1\./);
    expect(linha?.autenticacao_senha).not.toContain('segredo-123');

    const lista = await get<Array<Record<string, unknown>>>(`/v1/gestao/webhooks`, sessaoCompleta);
    const naLista = lista.corpo.find((w) => w['id'] === id);
    expect(JSON.stringify(naLista)).not.toContain('segredo-123');
    expect(JSON.stringify(naLista)).not.toContain('pipev1.');

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        return new Response('recebido', { status: 200 });
      }),
    );
    const teste = await post<{ ok: boolean; corpo?: string }>(
      `/v1/gestao/webhooks/${id}/testar`,
      sessaoCompleta,
    );
    expect(teste.status).toBe(200);
    expect(teste.corpo.ok).toBe(true);
    expect(teste.corpo.corpo).toBe('recebido');
    const cabecalhos = chamadas[0]?.[1]?.headers as Record<string, string>;
    expect(cabecalhos['authorization']).toBe(
      `Basic ${Buffer.from('robo:segredo-123').toString('base64')}`,
    );
  });

  it('OAuth 2.0 client_credentials: busca o token na URL de autorização e usa Bearer', async () => {
    const urlToken = `https://exemplo.pipe.app/oauth-${randomUUID().slice(0, 8)}/token`;
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/oauth-destino-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: {
        tipo: 'oauth2_client_credentials',
        urlAutorizacao: urlToken,
        clientId: 'cliente-abc',
        clientSecret: 'segredo-oauth-xyz',
      },
    });
    expect(criado.status).toBe(201);
    const id = criado.corpo.id;

    const linha = (
      await a.dono.execute<{ oauth2_client_secret: string }>(
        sql`select oauth2_client_secret from webhook_saida where id = ${id}::uuid`,
      )
    ).rows[0];
    expect(linha?.oauth2_client_secret).toMatch(/^pipev1\./);
    expect(linha?.oauth2_client_secret).not.toContain('segredo-oauth-xyz');

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        if (url === urlToken) {
          return new Response(JSON.stringify({ access_token: 'token-de-mentira' }), { status: 200 });
        }
        return new Response('ok', { status: 200 });
      }),
    );
    const teste = await post<{ ok: boolean }>(`/v1/gestao/webhooks/${id}/testar`, sessaoCompleta);
    expect(teste.status).toBe(200);
    expect(teste.corpo.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
    const [chamadaToken, chamadaDestino] = chamadas as [
      [string, RequestInit | undefined],
      [string, RequestInit | undefined],
    ];
    expect(chamadaToken[0]).toBe(urlToken);
    expect(String(chamadaToken[1]?.body)).toContain('grant_type=client_credentials');
    expect(String(chamadaToken[1]?.body)).toContain('client_secret=segredo-oauth-xyz');
    const cabecalhosDestino = chamadaDestino[1]?.headers as Record<string, string>;
    expect(cabecalhosDestino['authorization']).toBe('Bearer token-de-mentira');
  });

  it('cabeçalhos customizados chegam na entrega, sem derrubar a assinatura', async () => {
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/cabecalhos-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [{ chave: 'X-Minha-Chave', valor: 'valor-customizado' }],
    });
    expect(criado.status).toBe(201);
    const id = criado.corpo.id;

    const chamadas: Array<[string, RequestInit | undefined]> = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadas.push([url, init]);
        return new Response('ok', { status: 200 });
      }),
    );
    const teste = await post<{ ok: boolean }>(`/v1/gestao/webhooks/${id}/testar`, sessaoCompleta);
    expect(teste.status).toBe(200);
    expect(teste.corpo.ok).toBe(true);
    const cabecalhos = chamadas[0]?.[1]?.headers as Record<string, string>;
    expect(cabecalhos['X-Minha-Chave']).toBe('valor-customizado');
    expect(cabecalhos['x-pipe-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('recusa cabeçalho reservado, cabeçalho repetido e autenticação incompleta', async () => {
    const reservado = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/reservado-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [{ chave: 'Content-Type', valor: 'text/plain' }],
    });
    expect(reservado.status).toBe(400);
    expect((reservado.corpo as { erro: { codigo: string } }).erro.codigo).toBe('cabecalho_reservado');

    const repetido = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/repetido-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      cabecalhos: [
        { chave: 'X-A', valor: '1' },
        { chave: 'x-a', valor: '2' },
      ],
    });
    expect(repetido.status).toBe(400);
    expect((repetido.corpo as { erro: { codigo: string } }).erro.codigo).toBe('cabecalho_repetido');

    const semSenha = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/incompleta-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: { tipo: 'basica', usuario: 'robo' },
    });
    expect(semSenha.status).toBe(400);
    expect((semSenha.corpo as { erro: { codigo: string } }).erro.codigo).toBe('autenticacao_incompleta');

    const oauthSsrf = await post(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/oauth-ssrf-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: {
        tipo: 'oauth2_client_credentials',
        urlAutorizacao: 'http://169.254.169.254/token',
        clientId: 'x',
        clientSecret: 'y',
      },
    });
    expect(oauthSsrf.status).toBe(400);
  });

  it('editar autenticação substitui por inteiro; cross-tenant é 404', async () => {
    const criado = await post<{ id: string }>(`/v1/gestao/webhooks`, sessaoCompleta, {
      url: `https://exemplo.pipe.app/editar-auth-${randomUUID().slice(0, 8)}`,
      eventos: ['mensagem.criada'],
      autenticacao: { tipo: 'basica', usuario: 'robo', senha: 'senha-1' },
    });
    const id = criado.corpo.id;

    const editado = await patch<{ autenticacao: Record<string, unknown> }>(
      `/v1/gestao/webhooks/${id}`,
      sessaoCompleta,
      { autenticacao: { tipo: 'nenhuma' } },
    );
    expect(editado.status).toBe(200);
    expect(editado.corpo.autenticacao).toEqual({
      tipo: 'nenhuma',
      usuario: null,
      urlAutorizacao: null,
      clientId: null,
    });

    const outroTenant = await patch(`/v1/gestao/webhooks/${id}`, sessaoDoOutroTenant, {
      autenticacao: { tipo: 'nenhuma' },
    });
    expect(outroTenant.status).toBe(404);
  });
});
