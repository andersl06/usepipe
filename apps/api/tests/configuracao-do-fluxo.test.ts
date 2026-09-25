import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * "Tela de Boas-vindas" e "Menu Persistente" — `GET/PATCH
 * /v1/gestao/fluxos/:id/{boas-vindas,menu-persistente}`
 * (`dominio/gestao/configuracao-do-fluxo.ts`).
 *
 * O menu persistente exige canal Messenger — e `TIPOS_CANAL`
 * (`packages/db/src/schema/comum.ts`) ainda não tem esse tipo. Por isso o
 * teste do PATCH do menu prova a RECUSA (a mesma trava que a origem mostra
 * com o Salvar desabilitado), não o sucesso: salvar de verdade só é possível
 * quando o canal Messenger existir no Pipe.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let sessionEditor: string;
let sessionWithoutPoder: string;
let sessionOfOtherTenant: string;

async function pessoaCom(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = users[0]!.id;
  if (permissions.length === 0) return userId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiresAt}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

async function newFlow(cenario: Cenario, extra: { state?: string } = {}): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado)
    values (${cenario.tenantId}, ${`fluxo ${randomUUID().slice(0, 8)}`}, 'fluxo', ${extra.state ?? 'rascunho'})
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  session: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/management/flows/${caminho}`, {
    method: metodo,
    headers: comCookie(session),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

async function auditoriaDe(objetoTipo: string, id: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = ${objetoTipo} and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`cf-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  const editorDoB = await pessoaCom(b, ['automacao.fluxo.editar']);

  api = await upApi(0);
  sessionEditor = await openSession(a, editor);
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, editorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET/PATCH /v1/management/flows/:id/welcome', () => {
  it('Start with the welcome message disabled and no message or button text', async () => {
    const id = await newFlow(a);
    const { status, corpo } = await chamar(sessionEditor, 'GET', `${id}/boas-vindas`);
    expect(status).toBe(200);
    expect(corpo).toEqual({ ativo: false, mensagem: '', textoBotao: 'Começar' });
  });

  it('Enable the welcome message with button text and audit the change', async () => {
    const id = await newFlow(a);
    const { status, corpo } = await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Olá! Seja bem-vindo.',
      textoBotao: 'Começar agora',
    });
    expect(status).toBe(200);
    expect(corpo).toEqual({ ativo: true, mensagem: 'Olá! Seja bem-vindo.', textoBotao: 'Começar agora' });

    const log = await auditoriaDe('fluxo_boas_vindas', id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'alterou', depois: { ativo: true } });
  });

  it('Require welcome message and button text and limit button text to 20 characters', async () => {
    const id = await newFlow(a);
    const withoutMessage = await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      textoBotao: 'Começar',
    });
    expect(withoutMessage.status).toBe(400);

    const semBotao = await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
    });
    expect(semBotao.status).toBe(400);

    const botaoGrande = await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'X'.repeat(21),
    });
    expect(botaoGrande.status).toBe(400);
  });

  it('Keep saved welcome text when disabled and reuse it when reenabled', async () => {
    const id = await newFlow(a);
    await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Mensagem original',
      textoBotao: 'Começar',
    });

    const desligado = await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, { ativo: false });
    expect(desligado.status).toBe(200);
    expect(desligado.corpo).toEqual({ ativo: false, mensagem: 'Mensagem original', textoBotao: 'Começar' });

    const read = await chamar(sessionEditor, 'GET', `${id}/boas-vindas`);
    expect(read.corpo).toEqual({ ativo: false, mensagem: 'Mensagem original', textoBotao: 'Começar' });
  });

  it('Return 403 without `automacao.fluxo.editar` and 404 for invalid or cross-tenant IDs', async () => {
    const id = await newFlow(a);
    const semPoder = await chamar(sessionWithoutPoder, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await chamar(sessionOfOtherTenant, 'GET', `${id}/boas-vindas`);
    expect(outroTenant.status).toBe(404);

    const malformado = await chamar(sessionEditor, 'GET', `nao-e-uuid/boas-vindas`);
    expect(malformado.status).toBe(404);
  });
});

describe('GET/PATCH /v1/management/flows/:id/menu-persistent', () => {
  it('Start with an empty persistent menu and no completed welcome message', async () => {
    const id = await newFlow(a);
    const { status, corpo } = await chamar(sessionEditor, 'GET', `${id}/menu-persistente`);
    expect(status).toBe(200);
    expect(corpo).toEqual({ itens: [], boasVindasPreenchida: false });
  });

  it('boasVindasPreenchida acompanha a Tela de Boas-vindas', async () => {
    const id = await newFlow(a);
    await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    const { corpo } = await chamar(sessionEditor, 'GET', `${id}/menu-persistente`);
    expect(corpo['boasVindasPreenchida']).toBe(true);
  });

  it('Reject persistent-menu updates without a Messenger channel even when welcome is complete through PATCH', async () => {
    const id = await newFlow(a);
    await chamar(sessionEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    const { status, corpo } = await chamar(sessionEditor, 'PATCH', `${id}/menu-persistente`, {
      itens: [{ texto: 'Falar com atendente', link: 'atendimento' }],
    });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'menu_persistente_canal' } });
  });

  it('Check `automacao.fluxo.editar` before channel and welcome validation', async () => {
    const id = await newFlow(a);
    const { status, corpo } = await chamar(sessionWithoutPoder, 'PATCH', `${id}/menu-persistente`, {
      itens: [],
    });
    expect(status).toBe(403);
    expect(corpo).toMatchObject({ erro: { codigo: 'sem_permissao' } });
  });
});
