import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

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
let sessaoEditor: string;
let sessaoSemPoder: string;
let sessaoDoOutroTenant: string;

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return usuarioId;
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papeis[0]!.id})
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

async function novoFluxo(cenario: Cenario, extra: { estado?: string } = {}): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado)
    values (${cenario.tenantId}, ${`fluxo ${randomUUID().slice(0, 8)}`}, 'fluxo', ${extra.estado ?? 'rascunho'})
    returning id
  `);
  return rows[0]!.id;
}

async function chamar(
  sessao: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/gestao/fluxos/${caminho}`, {
    method: metodo,
    headers: comCookie(sessao),
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

  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, editor);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, editorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET/PATCH /v1/gestao/fluxos/:id/boas-vindas', () => {
  it('desligada por padrão, sem mensagem nem texto de botão', async () => {
    const id = await novoFluxo(a);
    const { status, corpo } = await chamar(sessaoEditor, 'GET', `${id}/boas-vindas`);
    expect(status).toBe(200);
    expect(corpo).toEqual({ ativo: false, mensagem: '', textoBotao: 'Começar' });
  });

  it('liga com mensagem e texto do botão, e audita', async () => {
    const id = await novoFluxo(a);
    const { status, corpo } = await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
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

  it('recusa ativar sem mensagem ou sem texto do botão, e o teto de 20 no texto do botão', async () => {
    const id = await novoFluxo(a);
    const semMensagem = await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      textoBotao: 'Começar',
    });
    expect(semMensagem.status).toBe(400);

    const semBotao = await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
    });
    expect(semBotao.status).toBe(400);

    const botaoGrande = await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'X'.repeat(21),
    });
    expect(botaoGrande.status).toBe(400);
  });

  it('desligar não apaga a mensagem — religar sem mandar de novo mantém o que já estava', async () => {
    const id = await novoFluxo(a);
    await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Mensagem original',
      textoBotao: 'Começar',
    });

    const desligado = await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, { ativo: false });
    expect(desligado.status).toBe(200);
    expect(desligado.corpo).toEqual({ ativo: false, mensagem: 'Mensagem original', textoBotao: 'Começar' });

    const leitura = await chamar(sessaoEditor, 'GET', `${id}/boas-vindas`);
    expect(leitura.corpo).toEqual({ ativo: false, mensagem: 'Mensagem original', textoBotao: 'Começar' });
  });

  it('sem automacao.fluxo.editar é 403; fluxo de outro tenant e uuid malformado são 404', async () => {
    const id = await novoFluxo(a);
    const semPoder = await chamar(sessaoSemPoder, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await chamar(sessaoDoOutroTenant, 'GET', `${id}/boas-vindas`);
    expect(outroTenant.status).toBe(404);

    const malformado = await chamar(sessaoEditor, 'GET', `nao-e-uuid/boas-vindas`);
    expect(malformado.status).toBe(404);
  });
});

describe('GET/PATCH /v1/gestao/fluxos/:id/menu-persistente', () => {
  it('sem itens e boasVindasPreenchida falsa por padrão', async () => {
    const id = await novoFluxo(a);
    const { status, corpo } = await chamar(sessaoEditor, 'GET', `${id}/menu-persistente`);
    expect(status).toBe(200);
    expect(corpo).toEqual({ itens: [], boasVindasPreenchida: false });
  });

  it('boasVindasPreenchida acompanha a Tela de Boas-vindas', async () => {
    const id = await novoFluxo(a);
    await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    const { corpo } = await chamar(sessaoEditor, 'GET', `${id}/menu-persistente`);
    expect(corpo['boasVindasPreenchida']).toBe(true);
  });

  it('sem canal Messenger, o PATCH recusa mesmo com boas-vindas preenchida', async () => {
    const id = await novoFluxo(a);
    await chamar(sessaoEditor, 'PATCH', `${id}/boas-vindas`, {
      ativo: true,
      mensagem: 'Oi',
      textoBotao: 'Começar',
    });
    const { status, corpo } = await chamar(sessaoEditor, 'PATCH', `${id}/menu-persistente`, {
      itens: [{ texto: 'Falar com atendente', link: 'atendimento' }],
    });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'menu_persistente_canal' } });
  });

  it('sem automacao.fluxo.editar é 403 antes de checar canal ou boas-vindas', async () => {
    const id = await novoFluxo(a);
    const { status, corpo } = await chamar(sessaoSemPoder, 'PATCH', `${id}/menu-persistente`, {
      itens: [],
    });
    expect(status).toBe(403);
    expect(corpo).toMatchObject({ erro: { codigo: 'sem_permissao' } });
  });
});
