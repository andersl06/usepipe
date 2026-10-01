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
const { autoCloseChecked } = await import('../src/domain/management/queue-auto-close.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

/** Tags da fila e configuração do encerramento automático: validação, permissão, isolamento e auditoria. */
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

async function pedir(metodo: string, caminho: string, token: string | null, corpo?: unknown, flowId = a.flowId) {
  const sep = caminho.includes('?') ? '&' : '?';
  const resposta = await fetch(`${api.url}${caminho}${sep}flowId=${flowId}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, body: (texto ? JSON.parse(texto) : undefined) as Corpo };
}

beforeAll(async () => {
  a = await montarCenario(`ac-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ac-${randomUUID().slice(0, 8)}`);
  gestor = await pessoa(a, ['fila.gerenciar']);
  semPoder = await pessoa(a, []);
  gestorDoB = await pessoa(b, ['fila.gerenciar']);
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

const valida = () => ({
  ativo: true,
  tempo: 30,
  unidade: 'minutos',
  soSePrimeiroAtendimento: true,
  naoSeAguardandoAtendente: false,
  removerDaTela: true,
  alerta: { ativo: true, mensagem: 'Ainda está aí?', antecedencia: 5, unidade: 'minutos' },
  tags: { ativo: true, tags: ['Inativo'] },
});

describe('validação pura da configuração', () => {
  it('aceita a configuração válida e descarta campos desconhecidos', () => {
    const r = autoCloseChecked({ ...valida(), intruso: 1 });
    expect(r).toEqual(valida());
  });

  it('recusa tempo inválido, unidade fora da lista, alerta maior que a inatividade e HTML', () => {
    expect(() => autoCloseChecked({ ...valida(), tempo: 0 })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), tempo: 1.5 })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), tempo: 43_201 })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), tempo: 721, unidade: 'horas' })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), unidade: 'dias' })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), alerta: { ...valida().alerta, antecedencia: 30 } })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), alerta: { ...valida().alerta, mensagem: '' } })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), alerta: { ...valida().alerta, mensagem: '<b>oi</b>' } })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), tags: { ativo: true, tags: [] } })).toThrow();
    expect(() => autoCloseChecked({ ...valida(), ativo: 'sim' })).toThrow();
  });
});

describe('PUT agents/queues/:id/tags', () => {
  it('grava, normaliza, devolve em GET agents/queues e audita', async () => {
    const r = await pedir('PUT', `/v1/management/agents/queues/${a.queueId}/tags`, gestor, {
      tags: ['  VIP ', 'vip', 'Cobrança   atrasada'],
    });
    expect(r.status).toBe(200);
    expect(r.body.tags).toEqual(['VIP', 'Cobrança atrasada']);

    const lista = await pedir('GET', '/v1/management/agents/queues', gestor);
    const fila = lista.body.queues.find((q: Corpo) => q.id === a.queueId);
    expect(fila.tags).toEqual(['VIP', 'Cobrança atrasada']);
    expect(fila.autoClose).toBeNull();

    const { rows } = await a.dono.execute<{ depois: Corpo }>(sql`
      select depois from log_auditoria where objeto_tipo = 'fila' and objeto_id = ${a.queueId}::uuid order by em desc limit 1
    `);
    expect(rows[0]!.depois).toMatchObject({ etiquetas: ['VIP', 'Cobrança atrasada'] });
  });

  it('recusa HTML, tag longa, excesso de tags e corpo que não é lista', async () => {
    const caminho = `/v1/management/agents/queues/${a.queueId}/tags`;
    expect((await pedir('PUT', caminho, gestor, { tags: ['<script>'] })).status).toBe(400);
    expect((await pedir('PUT', caminho, gestor, { tags: ['x'.repeat(41)] })).status).toBe(400);
    expect((await pedir('PUT', caminho, gestor, { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) })).status).toBe(400);
    expect((await pedir('PUT', caminho, gestor, { tags: 'a,b' })).status).toBe(400);
    expect((await pedir('PUT', caminho, gestor, { tags: [''] })).status).toBe(400);
  });

  it('401 sem sessão, 403 sem permissão, 404 para fila de outro tenant e id malformado', async () => {
    const caminho = `/v1/management/agents/queues/${a.queueId}/tags`;
    expect((await pedir('PUT', caminho, null, { tags: [] })).status).toBe(401);
    const negado = await pedir('PUT', caminho, semPoder, { tags: ['x'] });
    expect(negado.status).toBe(403);
    expect(negado.body.error.detalhe.permission).toBe('fila.gerenciar');
    expect((await pedir('PUT', caminho, gestorDoB, { tags: ['x'] })).status).toBe(404);
    expect((await pedir('PUT', caminho, gestorDoB, { tags: ['x'] }, b.flowId)).status).toBe(404);
    expect((await pedir('PUT', '/v1/management/agents/queues/nao-e-uuid/tags', gestor, { tags: [] })).status).toBe(404);
    const { rows } = await a.dono.execute<{ etiquetas: string[] }>(sql`select etiquetas from fila where id = ${a.queueId}::uuid`);
    expect(rows[0]!.etiquetas).not.toContain('x');
  });
});

describe('PUT agents/queues/:id/auto-close', () => {
  const caminho = () => `/v1/management/agents/queues/${a.queueId}/auto-close`;

  it('grava a configuração, aparece em GET agents/queues e audita', async () => {
    const r = await pedir('PUT', caminho(), gestor, valida());
    expect(r.status).toBe(200);
    expect(r.body).toEqual(valida());
    const lista = await pedir('GET', '/v1/management/agents/queues', gestor);
    expect(lista.body.queues.find((q: Corpo) => q.id === a.queueId).autoClose).toEqual(valida());
    const { rows } = await a.dono.execute<{ depois: Corpo }>(sql`
      select depois from log_auditoria where objeto_tipo = 'fila' and objeto_id = ${a.queueId}::uuid order by em desc limit 1
    `);
    expect(rows[0]!.depois).toHaveProperty('encerramentoAutomatico');
  });

  it('o interruptor desliga mantendo o restante da configuração', async () => {
    const r = await pedir('PUT', caminho(), gestor, { ...valida(), ativo: false });
    expect(r.status).toBe(200);
    expect(r.body.ativo).toBe(false);
    expect(r.body.tempo).toBe(30);
  });

  it('recusa configuração inválida sem alterar o que estava gravado', async () => {
    const antes = await a.dono.execute(sql`select encerramento_automatico from fila where id = ${a.queueId}::uuid`);
    for (const ruim of [
      { ...valida(), tempo: 0 },
      { ...valida(), tempo: 999_999 },
      { ...valida(), unidade: 'segundos' },
      { ...valida(), alerta: { ...valida().alerta, antecedencia: 60 } },
      { ...valida(), alerta: { ...valida().alerta, mensagem: '<img src=x>' } },
    ]) {
      const r = await pedir('PUT', caminho(), gestor, ruim);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('auto_close_invalid');
    }
    const depois = await a.dono.execute(sql`select encerramento_automatico from fila where id = ${a.queueId}::uuid`);
    expect(depois.rows).toEqual(antes.rows);
  });

  it('401 sem sessão, 403 sem permissão e 404 entre tenants', async () => {
    expect((await pedir('PUT', caminho(), null, valida())).status).toBe(401);
    expect((await pedir('PUT', caminho(), semPoder, valida())).status).toBe(403);
    expect((await pedir('PUT', caminho(), gestorDoB, valida())).status).toBe(404);
    expect((await pedir('PUT', caminho(), gestorDoB, valida(), b.flowId)).status).toBe(404);
  });
});
