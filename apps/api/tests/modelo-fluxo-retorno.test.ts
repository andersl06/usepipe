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
const { listarTemplatesAprovados } = await import('../src/domain/desk/consultas.js');

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
let blocoA: string;
let blocoOutroFluxo: string;
let blocoDoB: string;

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
  const novo = createToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')`);
  return novo.token;
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

async function versaoComBloco(c: Cenario, fluxoId: string, estado: string, versao: number, codigo: string, nome: string) {
  const v = await c.dono.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado) values (${c.tenantId}, ${fluxoId}, ${versao}, ${estado}) returning id`);
  const bl = await c.dono.execute<{ id: string }>(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${c.tenantId}, ${v.rows[0]!.id}, ${codigo}, ${nome}, 'mensagem') returning id`);
  return { versaoId: v.rows[0]!.id, id: bl.rows[0]!.id };
}

async function novoModelo(c: Cenario): Promise<string> {
  const r = await c.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, categoria, corpo, status_meta)
    values (${c.tenantId}, ${c.channelId}, ${`m_${randomUUID().slice(0, 8)}`}, 'utilidade', 'Olá {{1}}', 'aprovado') returning id`);
  return r.rows[0]!.id;
}

const caminho = (id: string, fim = '') => `/v1/management/communication/templates/${id}${fim}`;

beforeAll(async () => {
  a = await montarCenario(`mr-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`mr-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  gestor = await pessoaCom(a, ['resposta_pronta.gerenciar']);
  semPoder = await pessoaCom(a, []);
  gestorDoB = await pessoaCom(b, ['resposta_pronta.gerenciar']);

  const publicada = await versaoComBloco(a, a.flowId, 'publicada', 1, 'in100', 'Início');
  blocoA = publicada.id;
  await a.dono.execute(sql`update fluxo set estado = 'publicado' where id = ${a.flowId}`);
  await a.dono.execute(sql`insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${a.tenantId}, ${publicada.versaoId}, 't100', 'Transbordo', 'transferencia')`);

  const f2 = await a.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, short_name) values (${a.tenantId}, 'Outro', ${`o${randomUUID().slice(0, 6)}`}) returning id`);
  blocoOutroFluxo = (await versaoComBloco(a, f2.rows[0]!.id, 'publicada', 1, 'x1', 'X')).id;
  blocoDoB = (await versaoComBloco(b, b.flowId, 'publicada', 1, 'in100', 'Início')).id;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('seletor de blocos do modelo', () => {
  it('lista só id, código, rótulo e tipo dos blocos da versão publicada do fluxo do canal', async () => {
    const m = await novoModelo(a);
    const r = await pedir('GET', caminho(m, '/blocks'), gestor);
    expect(r.status).toBe(200);
    expect(r.body.blocks.map((x: Corpo) => x.code)).toEqual(['in100', 't100']);
    expect(Object.keys(r.body.blocks[0]).sort()).toEqual(['code', 'id', 'label', 'type']);
  });

  it('sem versão publicada usa o rascunho', async () => {
    await a.dono.execute(sql`update fluxo_versao set estado = 'arquivada' where fluxo_id = ${a.flowId}`);
    const rasc = await versaoComBloco(a, a.flowId, 'rascunho', 2, 'rasc1', 'Rascunho');
    const m = await novoModelo(a);
    const r = await pedir('GET', caminho(m, '/blocks'), gestor);
    expect(r.body.blocks.map((x: Corpo) => x.code)).toEqual(['rasc1']);
    await a.dono.execute(sql`delete from fluxo_versao where id = ${rasc.versaoId}`);
    await a.dono.execute(sql`update fluxo_versao set estado = 'publicada' where fluxo_id = ${a.flowId} and versao = 1`);
  });

  it('modelo de outro tenant é 404 e id malformado é 404', async () => {
    const m = await novoModelo(a);
    expect((await pedir('GET', caminho(m, '/blocks'), gestorDoB)).status).toBe(404);
    expect((await pedir('GET', caminho('nao-e-uuid', '/blocks'), gestor)).status).toBe(404);
  });
});

describe('PATCH communication/templates/:id', () => {
  it('grava o bloco de retorno, devolve o estado resolvido, lista e audita', async () => {
    const m = await novoModelo(a);
    const r = await pedir('PATCH', caminho(m), gestor, { fluxoRetornoBlocoId: blocoA });
    expect(r.status).toBe(200);
    expect(r.body.fluxoRetorno).toMatchObject({ state: 'ok', code: 'in100', label: 'Início', blockId: blocoA });
    const lista = await pedir('GET', '/v1/management/communication/templates?q=m_', gestor);
    const linha = lista.body.modelos.find((x: Corpo) => x.id === m);
    expect(linha.fluxoRetorno.state).toBe('ok');
    expect(linha.ativo).toBe(true);
    const log = await a.dono.execute<{ depois: Corpo }>(sql`select depois from log_auditoria where objeto_tipo = 'template_mensagem' and objeto_id = ${m}::uuid`);
    expect(log.rows[0]!.depois).toMatchObject({ fluxoRetornoBlocoId: blocoA });
  });

  it('recusa bloco de outro fluxo, de outro tenant, inexistente e malformado', async () => {
    const m = await novoModelo(a);
    for (const ruim of [blocoOutroFluxo, blocoDoB, randomUUID()]) {
      const r = await pedir('PATCH', caminho(m), gestor, { fluxoRetornoBlocoId: ruim });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('block_outside_flow');
    }
    expect((await pedir('PATCH', caminho(m), gestor, { fluxoRetornoBlocoId: 'x' })).body.error.code).toBe('block_invalid');
    const intacto = await a.dono.execute<{ b: string | null }>(sql`select fluxo_retorno_bloco_id as b from template_mensagem where id = ${m}::uuid`);
    expect(intacto.rows[0]!.b).toBeNull();
  });

  it('rejeita campo desconhecido, corpo vazio e ativo não booleano', async () => {
    const m = await novoModelo(a);
    expect((await pedir('PATCH', caminho(m), gestor, { nome: 'x' })).body.error.code).toBe('field_unknown');
    expect((await pedir('PATCH', caminho(m), gestor, {})).status).toBe(400);
    expect((await pedir('PATCH', caminho(m), gestor, { ativo: 'sim' })).status).toBe(400);
  });

  it('exige a permissão e não alcança modelo de outro tenant', async () => {
    const m = await novoModelo(a);
    expect((await pedir('PATCH', caminho(m), semPoder, { ativo: false })).status).toBe(403);
    expect((await pedir('PATCH', caminho(m), gestorDoB, { ativo: false })).status).toBe(404);
  });

  it('limpa o vínculo com null', async () => {
    const m = await novoModelo(a);
    await pedir('PATCH', caminho(m), gestor, { fluxoRetornoBlocoId: blocoA });
    const r = await pedir('PATCH', caminho(m), gestor, { fluxoRetornoBlocoId: null });
    expect(r.body.fluxoRetorno.state).toBe('nenhum');
  });

  it('vínculo cujo código saiu do fluxo aparece como removido', async () => {
    const m = await novoModelo(a);
    const velha = await versaoComBloco(a, a.flowId, 'arquivada', 9, 'saiu', 'Saiu');
    await a.dono.execute(sql`update template_mensagem set fluxo_retorno_bloco_id = ${velha.id}::uuid where id = ${m}::uuid`);
    const lista = await pedir('GET', '/v1/management/communication/templates?q=m_', gestor);
    expect(lista.body.modelos.find((x: Corpo) => x.id === m).fluxoRetorno).toMatchObject({ state: 'removido', code: 'saiu' });
  });
});

describe('interruptor ativo', () => {
  it('modelo inativo some do Desk e o envio é recusado com 409 template_inativo', async () => {
    const m = await novoModelo(a);
    const lista = () => noTenant(a.tenantId, (tx) => listarTemplatesAprovados(tx, a.channelId));
    expect((await lista()).some((t) => t.id === m)).toBe(true);
    expect((await pedir('PATCH', caminho(m), gestor, { ativo: false })).body.ativo).toBe(false);
    expect((await lista()).some((t) => t.id === m)).toBe(false);

    const r = await pedir('POST', '/v1/messages-active', gestor, {
      channelId: a.channelId,
      template_id: m,
      contacts: [{ phone: '+5511988887777' }],
      parametros: ['x'],
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('template_inativo');
  });
});
