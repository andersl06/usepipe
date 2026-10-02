import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

/** Tags globais de encerramento em Configurações gerais: validação, permissão, uso e isolamento entre tenants. */
let a: Cenario;
let b: Cenario;
let api: Awaited<ReturnType<typeof upApi>>;
let gestor: string;
let semPoder: string;
let gestorDoB: string;

async function pessoa(c: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${c.tenantId}, ${`Pessoa ${marca}`}, ${`p-${marca}@e2e.pipe.app`}) returning id
  `);
  const userId = rows[0]!.id;
  if (permissoes.length) {
    for (const codigo of permissoes) {
      await c.dono.execute(sql`
        insert into permissao (codigo, descricao, grupo) values (${codigo}, ${codigo}, 'teste')
        on conflict (codigo) do nothing
      `);
    }
    const { rows: papeis } = await c.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${c.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
    `);
    for (const codigo of permissoes) {
      await c.dono.execute(sql`
        insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${c.tenantId}, ${papeis[0]!.id}, ${codigo})
      `);
    }
    await c.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${c.tenantId}, ${userId}, ${papeis[0]!.id})
    `);
  }
  const novo = createToken();
  await c.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${c.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

async function pedir(metodo: string, caminho: string, token: string, corpo?: unknown) {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: (texto ? JSON.parse(texto) : undefined) as Corpo };
}

const salvar = (token: string, tags: string[]) =>
  pedir('POST', '/v1/management/actions/salvarTagsGlobais', token, { campos: { tag: tags } });

const nomes = async (token: string): Promise<string[]> =>
  ((await pedir('GET', '/v1/management/settings/general', token)).body.etiquetas as Corpo[]).map((e) => e.name);

beforeAll(async () => {
  a = await montarCenario(`tg-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`tg-${randomUUID().slice(0, 8)}`);
  gestor = await pessoa(a, ['tenant.configurar']);
  semPoder = await pessoa(a, []);
  gestorDoB = await pessoa(b, ['tenant.configurar']);
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('catálogo global de tags', () => {
  it('cria, normaliza, remove as sem uso e fica isolado por tenant', async () => {
    expect((await salvar(gestor, ['  Aguardando ', 'aguardando', 'Cobrança   atrasada'])).body).toEqual({ ok: true });
    expect(await nomes(gestor)).toEqual(['Aguardando', 'Cobrança atrasada']);
    expect((await salvar(gestor, ['Aguardando'])).body).toEqual({ ok: true });
    expect(await nomes(gestor)).toEqual(['Aguardando']);
    expect(await nomes(gestorDoB)).toEqual([]);
  });

  it('não remove tag que já etiquetou conversa', async () => {
    await salvar(gestor, ['Em uso', 'Livre']);
    const { rows: ct } = await a.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome) values (${a.tenantId}::uuid, 'Cliente') returning id
    `);
    const { rows: cv } = await a.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado)
      values (${a.tenantId}::uuid, ${a.inboxId}::uuid, ${ct[0]!.id}::uuid, ${a.queueId}::uuid, 'em_atendimento') returning id
    `);
    await a.dono.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id)
      select ${a.tenantId}::uuid, ${cv[0]!.id}::uuid, id from etiqueta where tenant_id = ${a.tenantId}::uuid and nome = 'Em uso'
    `);
    const r = await salvar(gestor, ['Livre']);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toContain('"Em uso"');
    expect(await nomes(gestor)).toEqual(['Em uso', 'Livre']);
  });

  it('recusa HTML, tag longa e lista grande demais sem gravar nada', async () => {
    const antes = await nomes(gestor);
    expect((await salvar(gestor, ['<b>x</b>'])).body.ok).toBe(false);
    expect((await salvar(gestor, ['x'.repeat(41)])).body.ok).toBe(false);
    expect((await salvar(gestor, Array.from({ length: 201 }, (_, i) => `t${i}`))).body.ok).toBe(false);
    expect(await nomes(gestor)).toEqual(antes);
  });

  it('exige a permissão de configuração do tenant', async () => {
    const r = await salvar(semPoder, ['Intruso']);
    expect(r.body.ok).toBe(false);
    expect(await nomes(gestor)).not.toContain('Intruso');
  });
});
