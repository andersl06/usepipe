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
const { noTenant } = await import('../src/banco.js');
const { exigirPermissaoNoFluxo, permissoesDoPapel } =
  await import('../src/dominio/gestao/equipe-do-fluxo.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * A equipe DO FLUXO — `/v1/gestao/fluxos/:id/equipe` — e a peneira que ela
 * existe para alimentar, `exigirPermissaoNoFluxo`.
 *
 * O que vale provar é o que a origem decide e o que o Pipe decidiu por cima
 * dela: o nível de cima MARCA os rádios de baixo (`selectAllPermissions()`),
 * quem não está no contrato é recusado com a frase da própria origem, o duplo
 * portão aceita quem tem a permissão NO FLUXO **ou** na conta (e recusa quem
 * não tem nenhuma das duas), e o último administrador do fluxo não sai — essa
 * última é nossa, porque a origem tem `owner` e nós não.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem edita fluxo pela CONTA (`automacao.fluxo.editar`) — o `member` deles. */
let sessaoEditor: string;
/** Gente do tenant A sem permissão nenhuma sobre fluxo, e sem ser membro. */
let sessaoSemPoder: string;
let semPoderId: string;
/** Editor do tenant B: prova que o tenant vem da sessão, nunca da URL. */
let sessaoDoOutroTenant: string;
/** Três pessoas do tenant A sem permissão de conta, para entrarem por fluxo. */
let ana: { id: string; email: string };
let bruno: { id: string; email: string };
let carla: { id: string; email: string };
/** O fluxo sobre o qual quase tudo acontece. */
let fluxoId: string;

/** Um usuário novo no tenant, com um papel que carrega estas permissões. */
async function pessoaCom(
  cenario: Cenario,
  permissoes: string[],
): Promise<{ id: string; email: string }> {
  const marca = randomUUID().slice(0, 8);
  const email = `pessoa-${marca}@e2e.pipe.app`;
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${email})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return { id: usuarioId, email };

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
  return { id: usuarioId, email };
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

async function criarFluxoNoBanco(cenario: Cenario, nome: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, tipo, estado)
    values (${cenario.tenantId}, ${nome}, 'fluxo', 'publicado')
    returning id
  `);
  return rows[0]!.id;
}

type Resposta = { status: number; corpo: Record<string, unknown> };

async function chamar(sessao: string, caminho: string, init: RequestInit = {}): Promise<Resposta> {
  const resposta = await fetch(`${api.url}${caminho}`, { ...init, headers: comCookie(sessao) });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : {},
  };
}

const listar = (sessao: string, id = fluxoId) => chamar(sessao, `/v1/gestao/fluxos/${id}/equipe`);

const adicionar = (sessao: string, corpo: Record<string, unknown>, id = fluxoId) =>
  chamar(sessao, `/v1/gestao/fluxos/${id}/equipe`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });

const editar = (sessao: string, alvo: string, corpo: Record<string, unknown>, id = fluxoId) =>
  chamar(sessao, `/v1/gestao/fluxos/${id}/equipe/${alvo}`, {
    method: 'PATCH',
    body: JSON.stringify(corpo),
  });

const remover = (sessao: string, alvo: string, id = fluxoId) =>
  chamar(sessao, `/v1/gestao/fluxos/${id}/equipe/${alvo}`, { method: 'DELETE' });

/** Põe alguém direto no banco, sem passar pela rota — para montar cenário. */
async function semear(
  cenario: Cenario,
  fluxo: string,
  usuarioId: string,
  papel: string,
): Promise<void> {
  const permissoes = JSON.stringify(
    permissoesDoPapel(papel as 'visualizar' | 'personalizado' | 'editar' | 'admin'),
  );
  await cenario.dono.execute(sql`
    insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
    values (${cenario.tenantId}, ${fluxo}::uuid, ${usuarioId}::uuid, ${papel}, ${permissoes}::jsonb)
    on conflict (fluxo_id, usuario_id) do update
      set papel_no_fluxo = excluded.papel_no_fluxo, permissoes = excluded.permissoes
  `);
}

async function auditoriaDe(usuarioId: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'fluxo_membro' and objeto_id = ${usuarioId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`eq-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`eq-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const semPoder = await pessoaCom(a, []);
  semPoderId = semPoder.id;
  ana = await pessoaCom(a, []);
  bruno = await pessoaCom(a, []);
  carla = await pessoaCom(a, []);
  const editorDoB = await pessoaCom(b, ['automacao.fluxo.editar']);

  fluxoId = await criarFluxoNoBanco(a, `Equipe ${randomUUID().slice(0, 6)}`);

  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, editor.id);
  sessaoSemPoder = await abrirSessao(a, semPoder.id);
  sessaoDoOutroTenant = await abrirSessao(b, editorDoB.id);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('POST /v1/gestao/fluxos/:id/equipe', () => {
  it('adiciona quem já está no contrato e marca os rádios pelo nível, como a origem', async () => {
    const { status, corpo } = await adicionar(sessaoEditor, {
      email: ana.email,
      papelNoFluxo: 'editar',
    });
    expect(status).toBe(201);
    expect(corpo).toMatchObject({ usuarioId: ana.id, email: ana.email, papelNoFluxo: 'editar' });
    /* `selectAllPermissions()`: "Ver e editar" põe TODAS as linhas em `readWrite`. */
    expect(corpo['permissoes']).toMatchObject({ builder: 'escrever', analysis: 'escrever' });

    const log = await auditoriaDe(ana.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { papelNoFluxo: 'editar' } });
  });

  it('"Visualizar" põe tudo em ler e "Personalizado" respeita linha a linha', async () => {
    const visita = await adicionar(sessaoEditor, {
      email: bruno.email,
      papelNoFluxo: 'visualizar',
    });
    expect(visita.status).toBe(201);
    expect(visita.corpo['permissoes']).toMatchObject({ builder: 'ler', channels: 'ler' });

    const solta = await editar(sessaoEditor, bruno.id, {
      papelNoFluxo: 'personalizado',
      permissoes: { builder: 'escrever', channels: 'ler' },
    });
    expect(solta.status).toBe(200);
    expect(solta.corpo['permissoes']).toMatchObject({
      builder: 'escrever',
      channels: 'ler',
      /* O que não veio fica em "Sem permissão" — o rádio zero da origem. */
      analysis: 'nenhum',
    });
  });

  it('recusa quem não está no contrato com a frase da origem', async () => {
    const { status, corpo } = await adicionar(sessaoEditor, {
      email: 'ninguem@e2e.pipe.app',
      papelNoFluxo: 'visualizar',
    });
    expect(status).toBe(400);
    expect(corpo).toMatchObject({ erro: { codigo: 'pessoa_fora_do_contrato' } });
    expect(String((corpo['erro'] as { mensagem: string }).mensagem)).toContain(
      'não faz parte do contrato',
    );
  });

  it('recusa a mesma pessoa duas vezes e nível que a origem não tem', async () => {
    const repetida = await adicionar(sessaoEditor, { email: ana.email, papelNoFluxo: 'editar' });
    expect(repetida.status).toBe(409);
    expect(repetida.corpo).toMatchObject({ erro: { codigo: 'ja_e_membro' } });

    const inventado = await adicionar(sessaoEditor, {
      email: carla.email,
      papelNoFluxo: 'super-admin',
    });
    expect(inventado.status).toBe(400);
    expect(inventado.corpo).toMatchObject({ erro: { codigo: 'papel_no_fluxo_invalido' } });
  });
});

describe('a permissão de gerir a equipe', () => {
  it('recusa quem não tem nem a permissão no fluxo nem a da conta', async () => {
    const lista = await listar(sessaoSemPoder);
    expect(lista.status).toBe(403);
    expect(lista.corpo).toMatchObject({ erro: { codigo: 'sem_permissao' } });

    const posta = await adicionar(sessaoSemPoder, {
      email: carla.email,
      papelNoFluxo: 'visualizar',
    });
    expect(posta.status).toBe(403);
  });

  it('aceita o admin DO FLUXO, que não tem permissão nenhuma na conta', async () => {
    await semear(a, fluxoId, semPoderId, 'admin');
    const lista = await listar(sessaoSemPoder);
    expect(lista.status).toBe(200);
    expect(lista.corpo['podeGerir']).toBe(true);
    /* Volta ao que era: o resto dos casos conta com ele sem poder nenhum. */
    await a.dono.execute(sql`
      delete from fluxo_membro where fluxo_id = ${fluxoId}::uuid
        and usuario_id = ${semPoderId}::uuid
    `);
  });

  it('a lista traz os recursos do modal de editar, na ordem da origem', async () => {
    const { status, corpo } = await listar(sessaoEditor);
    expect(status).toBe(200);
    const chaves = (corpo['recursos'] as { chave: string }[]).map((r) => r.chave);
    expect(chaves.slice(0, 4)).toEqual(['payments', 'channels', 'desk', 'users']);
    expect(chaves).toContain('team');
  });

  it('fluxo de outro tenant é 404, e uuid malformado também', async () => {
    expect((await listar(sessaoDoOutroTenant)).status).toBe(404);
    expect((await listar(sessaoEditor, 'isto-nao-e-uuid')).status).toBe(404);
    expect((await listar(sessaoEditor, randomUUID())).status).toBe(404);
  });
});

describe('PATCH e DELETE /v1/gestao/fluxos/:id/equipe/:usuarioId', () => {
  it('altera o nível, registra no log e não grava quando nada mudou', async () => {
    const mudou = await editar(sessaoEditor, ana.id, { papelNoFluxo: 'visualizar' });
    expect(mudou.status).toBe(200);
    expect(mudou.corpo['papelNoFluxo']).toBe('visualizar');

    const antes = (await auditoriaDe(ana.id)).length;
    const igual = await editar(sessaoEditor, ana.id, { papelNoFluxo: 'visualizar' });
    expect(igual.status).toBe(200);
    expect((await auditoriaDe(ana.id)).length).toBe(antes);

    const log = await auditoriaDe(ana.id);
    expect(log.at(-1)).toMatchObject({
      acao: 'alterou',
      antes: { papelNoFluxo: 'editar' },
      depois: { papelNoFluxo: 'visualizar' },
    });
  });

  it('membro de outro fluxo, ou inexistente, é 404', async () => {
    const outro = await criarFluxoNoBanco(a, `Outro ${randomUUID().slice(0, 6)}`);
    expect((await editar(sessaoEditor, ana.id, { papelNoFluxo: 'admin' }, outro)).status).toBe(404);
    expect((await remover(sessaoEditor, randomUUID())).status).toBe(404);
  });

  it('não deixa sair o ÚLTIMO administrador do fluxo, nem rebaixá-lo', async () => {
    const so = await criarFluxoNoBanco(a, `Só um admin ${randomUUID().slice(0, 6)}`);
    await semear(a, so, ana.id, 'admin');
    await semear(a, so, bruno.id, 'visualizar');

    const rebaixa = await editar(sessaoEditor, ana.id, { papelNoFluxo: 'editar' }, so);
    expect(rebaixa.status).toBe(409);
    expect(rebaixa.corpo).toMatchObject({ erro: { codigo: 'ultimo_admin' } });
    expect((await remover(sessaoEditor, ana.id, so)).status).toBe(409);

    /* Com um segundo administrador, os dois gestos passam. */
    await semear(a, so, bruno.id, 'admin');
    expect((await remover(sessaoEditor, ana.id, so)).status).toBe(204);
  });

  it('remove e limpa o log com o que a pessoa tinha', async () => {
    expect((await remover(sessaoEditor, ana.id)).status).toBe(204);
    const log = await auditoriaDe(ana.id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
    const lista = await listar(sessaoEditor);
    const emails = (lista.corpo['membros'] as { email: string }[]).map((m) => m.email);
    expect(emails).not.toContain(ana.email);
  });
});

describe('exigirPermissaoNoFluxo — o duplo portão', () => {
  /** Roda a função crua na transação do tenant, como as rotas fazem. */
  const tentar = (usuarioId: string, fluxo: string, codigo: string) =>
    noTenant(a.tenantId, (tx) => exigirPermissaoNoFluxo(tx, usuarioId, fluxo, codigo))
      .then(() => 'passou')
      .catch((erro: Error & { codigo?: string }) => erro.codigo ?? erro.message);

  it('permissão só NO FLUXO passa', async () => {
    const fluxo = await criarFluxoNoBanco(a, `Portão A ${randomUUID().slice(0, 6)}`);
    await semear(a, fluxo, carla.id, 'editar');
    expect(await tentar(carla.id, fluxo, 'builder.escrever')).toBe('passou');
    expect(await tentar(carla.id, fluxo, 'channels.ler')).toBe('passou');
  });

  it('permissão só NA CONTA passa, mesmo sem ser membro', async () => {
    const fluxo = await criarFluxoNoBanco(a, `Portão B ${randomUUID().slice(0, 6)}`);
    const { rows } = await a.dono.execute<{ id: string }>(sql`
      select u.id from usuario u
        join usuario_papel up on up.usuario_id = u.id
        join papel_permissao pp on pp.papel_id = up.papel_id
       where u.tenant_id = ${a.tenantId} and pp.permissao_codigo = 'automacao.fluxo.editar'
       limit 1
    `);
    expect(await tentar(rows[0]!.id, fluxo, 'builder.escrever')).toBe('passou');
  });

  it('nenhuma das duas recusa, e "ler" no fluxo não vira "escrever"', async () => {
    const fluxo = await criarFluxoNoBanco(a, `Portão C ${randomUUID().slice(0, 6)}`);
    expect(await tentar(semPoderId, fluxo, 'builder.escrever')).toBe('sem_permissao');

    await semear(a, fluxo, semPoderId, 'visualizar');
    expect(await tentar(semPoderId, fluxo, 'builder.ler')).toBe('passou');
    expect(await tentar(semPoderId, fluxo, 'builder.escrever')).toBe('sem_permissao');
  });

  it('já vale nas rotas do contato: quem só é membro edita as configurações básicas', async () => {
    /* `PATCH /v1/gestao/fluxos/:id` é "Configurações básicas"
       (`basicConfigurations`): antes da 0035 exigia `automacao.fluxo.editar` na
       conta, e quem não tinha levava 403. */
    const fluxo = await criarFluxoNoBanco(a, `Básicas ${randomUUID().slice(0, 6)}`);
    const antes = await fetch(`${api.url}/v1/gestao/fluxos/${fluxo}`, {
      method: 'PATCH',
      headers: comCookie(sessaoSemPoder),
      body: JSON.stringify({ descricao: 'sem poder nenhum' }),
    });
    expect(antes.status).toBe(403);

    await semear(a, fluxo, semPoderId, 'editar');
    const depois = await fetch(`${api.url}/v1/gestao/fluxos/${fluxo}`, {
      method: 'PATCH',
      headers: comCookie(sessaoSemPoder),
      body: JSON.stringify({ descricao: 'agora sou membro' }),
    });
    expect(depois.status).toBe(200);
  });

  it('o admin do fluxo passa em tudo, sem olhar linha a linha', async () => {
    const fluxo = await criarFluxoNoBanco(a, `Portão D ${randomUUID().slice(0, 6)}`);
    await a.dono.execute(sql`
      insert into fluxo_membro (tenant_id, fluxo_id, usuario_id, papel_no_fluxo, permissoes)
      values (${a.tenantId}, ${fluxo}::uuid, ${semPoderId}::uuid, 'admin', '{}'::jsonb)
    `);
    expect(await tentar(semPoderId, fluxo, 'team.escrever')).toBe('passou');
    expect(await tentar(semPoderId, fluxo, 'payments.escrever')).toBe('passou');
  });
});
