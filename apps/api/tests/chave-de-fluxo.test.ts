import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 31).toString('base64')}`;

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { conferirFluxoDaChave, fluxoDaRota } = await import('../src/autenticacao.js');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
import type { Request } from 'express';

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * A chave de acesso criada na tela "Chaves de acesso" do fluxo
 * (`chave_api.fluxo_id`, migração 0032) é uma credencial CERCADA, não um
 * rótulo: o guarda de chave (`conferirFluxoDaChave`, `autenticacao.ts`)
 * carrega o `fluxoId` na sessão da chave e
 *
 * - em rota POR FLUXO, só deixa agir no fluxo dela (outro fluxo é 403);
 * - em rota que NÃO é por fluxo, recusa (403 `chave_de_fluxo`) — decisão
 *   Pipe, explicada no próprio guarda;
 * - chave de CONTA (`fluxo_id` nulo) segue como sempre: o tenant inteiro;
 * - revogada é 401, e o escopo continua sendo conferido antes da cerca.
 *
 * A chave é criada pela rota de verdade (`POST /v1/gestao/fluxos/:id/chaves`),
 * com sessão de navegador, para provar que é ESSA chave — a que a tela entrega
 * ao cliente — que sai cercada.
 */

let a: Cenario;
let api: ApiNoAr;
let sessao: string;
let fluxoA: string;
let fluxoB: string;
/** Chave criada na tela do fluxo A: `conversas:*`, `mensagens:*`, `contatos:ler`. */
let chaveDoFluxoA: string;

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
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

async function criarFluxo(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
  `);
  return rows[0]!.id;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

function comChave(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

type Resposta = { status: number; corpo: Record<string, unknown> };

async function chamar(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  cabecalhos: Record<string, string>,
  corpo?: unknown,
): Promise<Resposta> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return {
    status: resposta.status,
    corpo: ((await resposta.json().catch(() => null)) ?? {}) as Record<string, unknown>,
  };
}

/** O erro estruturado de `erros.ts`: `{ erro: { codigo, mensagem, detalhe? } }`. */
function erroDe(resposta: Resposta): { codigo: string; mensagem: string; detalhe?: Record<string, unknown> } {
  return resposta.corpo['erro'] as { codigo: string; mensagem: string; detalhe?: Record<string, unknown> };
}

/** Cria a chave do fluxo pela ROTA da tela, e devolve o token `pipe_…`. */
async function chaveDaTela(fluxoId: string, nome: string): Promise<{ id: string; token: string }> {
  const criada = await chamar('POST', `/v1/gestao/fluxos/${fluxoId}/chaves`, comCookie(sessao), { nome });
  expect(criada.status).toBe(201);
  return { id: criada.corpo['id'] as string, token: criada.corpo['token'] as string };
}

/** Uma requisição do Express já casada com a rota — o que o guarda enxerga. */
function requisicaoCasada(padrao: string, params: Record<string, string>): Request {
  return { params, route: { path: padrao } } as unknown as Request;
}

beforeAll(async () => {
  a = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  const gestor = await pessoaCom(a, ['chave_api.gerenciar']);
  api = await subirApi(0);
  sessao = await abrirSessao(a, gestor);
  fluxoA = await criarFluxo(a, `Fluxo A ${randomUUID().slice(0, 6)}`);
  fluxoB = await criarFluxo(a, `Fluxo B ${randomUUID().slice(0, 6)}`);
  chaveDoFluxoA = (await chaveDaTela(fluxoA, 'Integração do fluxo A')).token;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('a cerca do guarda (conferirFluxoDaChave + fluxoDaRota)', () => {
  it('chave do fluxo A age no fluxo A e é 403 no fluxo B, com o código e a mensagem certos', () => {
    const chave = { fluxoId: fluxoA };
    expect(() => conferirFluxoDaChave(chave, fluxoA)).not.toThrow();
    // Uuid vem em caixa diferente conforme quem o escreveu; a cerca não é sensível a isso.
    expect(() => conferirFluxoDaChave(chave, fluxoA.toUpperCase())).not.toThrow();

    let erro: unknown;
    try {
      conferirFluxoDaChave(chave, fluxoB);
    } catch (e) {
      erro = e;
    }
    expect(erro).toMatchObject({
      status: 403,
      codigo: 'chave_de_outro_fluxo',
      detalhe: { fluxoId: fluxoA },
    });
    expect((erro as Error).message).toBe('Esta chave pertence a outro fluxo e não pode agir neste.');
  });

  it('chave de fluxo em rota que não é por fluxo é 403 `chave_de_fluxo`; chave de conta passa em qualquer rota', () => {
    let erro: unknown;
    try {
      conferirFluxoDaChave({ fluxoId: fluxoA }, null);
    } catch (e) {
      erro = e;
    }
    expect(erro).toMatchObject({ status: 403, codigo: 'chave_de_fluxo' });
    expect((erro as Error).message).toContain('/v1/gestao/fluxos/:id/');

    expect(() => conferirFluxoDaChave({ fluxoId: null }, null)).not.toThrow();
    expect(() => conferirFluxoDaChave({ fluxoId: null }, fluxoA)).not.toThrow();
    expect(() => conferirFluxoDaChave({ fluxoId: null }, fluxoB)).not.toThrow();
  });

  it('fluxoDaRota lê o PADRÃO da rota: `:id` depois de /fluxos/, `:fluxoId` em qualquer lugar, e nada fora disso', () => {
    expect(fluxoDaRota(requisicaoCasada('/v1/gestao/fluxos/:id/chaves', { id: fluxoA }))).toBe(fluxoA);
    expect(fluxoDaRota(requisicaoCasada('/v1/gestao/fluxos/:id', { id: fluxoB }))).toBe(fluxoB);
    expect(
      fluxoDaRota(
        requisicaoCasada('/v1/gestao/fluxos/:fluxoId/links-rastreados/:linkId', {
          fluxoId: fluxoA,
          linkId: randomUUID(),
        }),
      ),
    ).toBe(fluxoA);
    // `:id` de conversa não é fluxo, mesmo que o valor coincida com o id de um fluxo.
    expect(fluxoDaRota(requisicaoCasada('/v1/conversas/:id/mensagens', { id: fluxoA }))).toBeNull();
    expect(fluxoDaRota(requisicaoCasada('/v1/conversas', {}))).toBeNull();
  });
});

describe('a chave do fluxo na API (Bearer)', () => {
  it('é recusada em rota que não é por fluxo, com 403 e mensagem clara — a chave de conta continua passando', async () => {
    const recusada = await chamar('GET', '/v1/conversas', comChave(chaveDoFluxoA));
    expect(recusada.status).toBe(403);
    expect(erroDe(recusada).codigo).toBe('chave_de_fluxo');
    expect(erroDe(recusada).mensagem).toContain('só vale nas rotas desse fluxo');
    expect(erroDe(recusada).detalhe).toEqual({ fluxoId: fluxoA });

    const escrita = await chamar('POST', `/v1/conversas/${randomUUID()}/mensagens`, comChave(chaveDoFluxoA), {
      texto: 'oi',
    });
    expect(escrita.status).toBe(403);
    expect(erroDe(escrita).codigo).toBe('chave_de_fluxo');

    // Chave de CONTA: o tenant inteiro, como hoje.
    const conta = await chamar('GET', '/v1/conversas', comChave(a.token));
    expect(conta.status).toBe(200);
    expect(conta.corpo).toHaveProperty('data');
  });

  it('o escopo continua valendo, e é conferido antes da cerca de fluxo', async () => {
    // A chave de fluxo nasce sem `filas:ler`: a recusa é de ESCOPO, não de fluxo.
    const semEscopo = await chamar('GET', '/v1/filas', comChave(chaveDoFluxoA));
    expect(semEscopo.status).toBe(403);
    expect(erroDe(semEscopo).codigo).toBe('sem_escopo');
    expect(erroDe(semEscopo).detalhe).toEqual({ escopo: 'filas:ler' });

    // Chave de conta só com `filas:ler`: entra em filas, barra em conversas — como sempre.
    const filas = await chamar('GET', '/v1/filas', comChave(a.tokenSemEscopo));
    expect(filas.status).toBe(200);
    const conversas = await chamar('GET', '/v1/conversas', comChave(a.tokenSemEscopo));
    expect(conversas.status).toBe(403);
    expect(erroDe(conversas).codigo).toBe('sem_escopo');
  });

  it('revogada na tela é 401 em qualquer rota, antes de escopo e de cerca', async () => {
    const { id, token } = await chaveDaTela(fluxoB, 'A revogar');
    const viva = await chamar('GET', '/v1/conversas', comChave(token));
    expect(viva.status).toBe(403); // válida, só cercada
    expect(erroDe(viva).codigo).toBe('chave_de_fluxo');

    const revogada = await chamar('DELETE', `/v1/gestao/fluxos/${fluxoB}/chaves/${id}`, comCookie(sessao));
    expect(revogada.status).toBe(204);

    const depois = await chamar('GET', '/v1/conversas', comChave(token));
    expect(depois.status).toBe(401);
    expect(erroDe(depois).codigo).toBe('nao_autorizado');
    expect(erroDe(depois).mensagem).toBe('Chave revogada.');

    const filas = await chamar('GET', '/v1/filas', comChave(token));
    expect(filas.status).toBe(401);
  });

  it('a linha da chave carrega o fluxo, e é dele que a cerca vem', async () => {
    const { rows } = await a.dono.execute<{ fluxo_id: string | null; escopos: string[] }>(sql`
      select fluxo_id, escopos from chave_api
       where tenant_id = ${a.tenantId} and prefixo = ${chaveDoFluxoA.split('_')[1]}
    `);
    expect(rows[0]?.fluxo_id).toBe(fluxoA);
    expect(rows[0]?.escopos).toContain('conversas:ler');
    expect(rows[0]?.escopos).not.toContain('filas:ler');
  });
});
