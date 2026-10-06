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

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

let a: Cenario;
let api: ApiNoAr;
let sessao: string;
const nomes: Record<string, string> = {};

async function pedir(caminho: string): Promise<{ status: number; body: Corpo }> {
  const r = await fetch(`${api.url}/v1/management/communication/templates${caminho}`, {
    headers: { cookie: `${NOME_DO_COOKIE}=${sessao}` },
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : undefined };
}

async function modelo(marca: string, ativo: boolean, blocoId: string | null): Promise<void> {
  const nome = `ft_${marca}_${randomUUID().slice(0, 6)}`;
  nomes[marca] = nome;
  await a.dono.execute(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, categoria, corpo, status_meta, ativo, fluxo_retorno_bloco_id)
    values (${a.tenantId}, ${a.channelId}, ${nome}, 'utilidade', 'Olá', 'aprovado', ${ativo}, ${blocoId})`);
}

const nomesDe = (b: Corpo): string[] => b.modelos.map((m: Corpo) => m.name as string).sort();

beforeAll(async () => {
  a = await montarCenario(`ft-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  const marca = randomUUID().slice(0, 8);
  const u = await a.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${a.tenantId}, ${`P ${marca}`}, ${`p-${marca}@e2e.pipe.app`}) returning id`);
  const papel = await a.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo) values (${a.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id`);
  await a.dono.execute(sql`insert into permissao (codigo, descricao, grupo) values ('resposta_pronta.gerenciar', 'x', 'teste') on conflict (codigo) do nothing`);
  await a.dono.execute(sql`insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${a.tenantId}, ${papel.rows[0]!.id}, 'resposta_pronta.gerenciar')`);
  await a.dono.execute(sql`insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${a.tenantId}, ${u.rows[0]!.id}, ${papel.rows[0]!.id})`);
  const novo = createToken();
  await a.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${a.tenantId}, ${u.rows[0]!.id}, ${novo.hash}, ${novo.expiraEm}, 'google')`);
  sessao = novo.token;

  const v = await a.dono.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado) values (${a.tenantId}, ${a.flowId}, 1, 'publicada') returning id`);
  await a.dono.execute(sql`update fluxo set estado = 'publicado' where id = ${a.flowId}`);
  const b1 = await a.dono.execute<{ id: string }>(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${a.tenantId}, ${v.rows[0]!.id}, 'in1', 'Início', 'mensagem') returning id`);
  const b2 = await a.dono.execute<{ id: string }>(sql`
    insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${a.tenantId}, ${v.rows[0]!.id}, 'tr1', 'Transbordo', 'transferencia') returning id`);
  await modelo('on_in', true, b1.rows[0]!.id);
  await modelo('off_in', false, b1.rows[0]!.id);
  await modelo('on_tr', true, b2.rows[0]!.id);
  await modelo('on_none', true, null);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('GET communication/templates filters', () => {
  it('enabled=true lists only active templates and counts only them', async () => {
    const r = await pedir('?q=ft_&enabled=true');
    expect(nomesDe(r.body)).toEqual([nomes['on_in'], nomes['on_none'], nomes['on_tr']].sort());
    expect(r.body.total).toBe(3);
  });

  it('enabled=false lists only inactive templates', async () => {
    const r = await pedir('?q=ft_&enabled=false');
    expect(nomesDe(r.body)).toEqual([nomes['off_in']]);
    expect(r.body.total).toBe(1);
  });

  it('rejects an unknown enabled value with 400', async () => {
    const r = await pedir('?enabled=maybe');
    expect(r.status).toBe(400);
  });

  it('returnBlock filters by the stored block code with correct total and paging', async () => {
    const r = await pedir('?q=ft_&returnBlock=in1&porPagina=5&pagina=2');
    expect(r.body.total).toBe(2);
    expect(r.body.modelos).toHaveLength(0);
    const todos = await pedir('?q=ft_&returnBlock=tr1');
    expect(nomesDe(todos.body)).toEqual([nomes['on_tr']]);
    expect(todos.body.total).toBe(1);
  });

  it('combines enabled and returnBlock', async () => {
    const r = await pedir('?q=ft_&returnBlock=in1&enabled=false');
    expect(nomesDe(r.body)).toEqual([nomes['off_in']]);
  });

  it('returnBlocks lists the distinct blocks in use, sorted by label', async () => {
    const r = await pedir('?q=ft_');
    expect(r.body.returnBlocks).toEqual([
      { code: 'in1', label: 'Início' },
      { code: 'tr1', label: 'Transbordo' },
    ]);
  });
});
