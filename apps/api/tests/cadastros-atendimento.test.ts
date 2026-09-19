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
 * As rotas de GRAVAÇÃO do módulo Atendimento (cadastros) — itens 1 a 3 da
 * tarefa: filas (criar/editar/excluir/vincular/desvincular atendente),
 * respostas prontas (criar/editar/excluir) e pausas personalizadas
 * (criar/editar/excluir).
 *
 * Mesmo padrão de `ciclo-de-vida-do-fluxo.test.ts`: dois tenants, sessão por
 * cookie, caminho feliz, recusas, cross-tenant, permissão. `ErroPipe` sobe com
 * status de verdade (400/403/404/409) — diferente das `acoes/*` antigas
 * (`Resultado` em 200), porque são gestos com efeito de segurança.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Tem as três permissões novas/reaproveitadas — o "gestor" do teste. */
let sessaoGestor: string;
/** Só `fila.gerenciar` — para provar que cada rota pede a SUA permissão, não qualquer uma. */
let sessaoSoFilas: string;
/** Gente do tenant A sem permissão nenhuma. */
let sessaoSemPoder: string;
/** Sessão válida, mas de outro tenant — prova que o tenant vem da sessão, nunca da URL. */
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

async function pedir(
  metodo: string,
  caminho: string,
  sessao: string,
  corpo?: Record<string, unknown>,
): Promise<{ status: number; corpo: any }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(sessao),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : undefined };
}

beforeAll(async () => {
  a = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ct-${randomUUID().slice(0, 8)}`);

  const permissoesTodas = ['fila.gerenciar', 'pausa.gerenciar', 'resposta_pronta.gerenciar'];
  const gestor = await pessoaCom(a, permissoesTodas);
  const soFilas = await pessoaCom(a, ['fila.gerenciar']);
  const semPoder = await pessoaCom(a, []);
  const gestorDoB = await pessoaCom(b, permissoesTodas);

  api = await subirApi(0);
  sessaoGestor = await abrirSessao(a, gestor);
  sessaoSoFilas = await abrirSessao(a, soFilas);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, gestorDoB);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

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

/* =========================================================================
 * Item 1 — filas
 * ========================================================================= */

async function criarFila(sessao: string, corpo: Record<string, unknown>) {
  return pedir('POST', '/v1/gestao/atendentes/filas', sessao, {
    nome: `Fila ${randomUUID().slice(0, 8)}`,
    capacidadePadrao: 5,
    ...corpo,
  });
}

describe('POST /v1/gestao/atendentes/filas', () => {
  it('cria a fila e registra no log de auditoria', async () => {
    const nome = `Cobrança ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await criarFila(sessaoGestor, { nome, capacidadePadrao: 8, ordem: 2 });
    expect(status).toBe(201);
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);

    const log = await auditoriaDe('fila', corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { nome, capacidadePadrao: 8 } });
  });

  it('recusa nome vazio (400), capacidade fora da faixa (400) e nome repetido (409)', async () => {
    const semNome = await criarFila(sessaoGestor, { nome: '  ' });
    expect(semNome.status).toBe(400);
    expect(semNome.corpo.erro.codigo).toBe('nome_obrigatorio');

    const capInvalida = await criarFila(sessaoGestor, { capacidadePadrao: 0 });
    expect(capInvalida.status).toBe(400);
    expect(capInvalida.corpo.erro.codigo).toBe('capacidade_invalida');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await criarFila(sessaoGestor, { nome })).status).toBe(201);
    const repetida = await criarFila(sessaoGestor, { nome });
    expect(repetida.status).toBe(409);
    expect(repetida.corpo.erro.codigo).toBe('nome_em_uso');
  });

  it('horário inexistente é 400; cor fora da paleta é 400', async () => {
    const semHorario = await criarFila(sessaoGestor, { horarioId: randomUUID() });
    expect(semHorario.status).toBe(400);
    expect(semHorario.corpo.erro.codigo).toBe('horario_nao_encontrado');

    const corInvalida = await criarFila(sessaoGestor, { cor: 'vermelho-sangue' });
    expect(corInvalida.status).toBe(400);
    expect(corInvalida.corpo.erro.codigo).toBe('cor_invalida');
  });

  it('sem fila.gerenciar é 403; sem sessão é 401', async () => {
    const semPoder = await criarFila(sessaoSemPoder, {});
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.codigo).toBe('sem_permissao');
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('fila.gerenciar');

    const semSessao = await fetch(`${api.url}/v1/gestao/atendentes/filas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Qualquer', capacidadePadrao: 5 }),
    });
    expect(semSessao.status).toBe(401);
  });
});

describe('PATCH /v1/gestao/atendentes/filas/:id — renomear e ativar/desativar', () => {
  it('renomeia, muda capacidade/ordem/cor e registra só o que mudou', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, { nome: `Antes ${randomUUID().slice(0, 6)}` });
    const novoNome = `Depois ${randomUUID().slice(0, 6)}`;

    const { status, corpo } = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessaoGestor, {
      nome: novoNome,
      capacidadePadrao: 12,
    });
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ id: criada.id, nome: novoNome, capacidadePadrao: 12 });

    const log = await auditoriaDe('fila', criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { nome: novoNome, capacidadePadrao: 12 } });
    // Campo que não mudou não entra no registro.
    expect(log.at(-1)?.depois).not.toHaveProperty('ordem');
  });

  it('ativar/desativar é o mesmo PATCH, com `ativa`', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const desativada = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessaoGestor, {
      ativa: false,
    });
    expect(desativada.status).toBe(200);
    expect(desativada.corpo.ativa).toBe(false);
  });

  it('nada mudado não grava nem registra', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const antes = await auditoriaDe('fila', criada.id);
    const vazio = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessaoGestor, {});
    expect(vazio.status).toBe(200);
    expect(await auditoriaDe('fila', criada.id)).toHaveLength(antes.length);
  });

  it('sem fila.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});

    const semPoder = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessaoSemPoder, {
      nome: 'Invasor',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/atendentes/filas/${criada.id}`,
      sessaoDoOutroTenant,
      { nome: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/atendentes/filas/nao-e-uuid', sessaoGestor, {
      nome: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });
});

describe('DELETE /v1/gestao/atendentes/filas/:id', () => {
  it('exclui de verdade (204) e registra no log', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from fila where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');

    const log = await auditoriaDe('fila', criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
  });

  it('recusa (409) fila com conversa em aberto', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const { rows: contatos } = await a.dono.execute<{ id: string }>(
      sql`insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente teste') returning id`,
    );
    await a.dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contatos[0]!.id}::uuid, ${criada.id}::uuid)
    `);

    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('fila_com_conversa_aberta');
  });

  it('recusa (409) fila padrão de caixa de entrada — mensagem clara', async () => {
    // `a.filaId` é a fila padrão de `a.inboxId` (montada em `montarCenario`).
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${a.filaId}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string; mensagem: string } };
    expect(corpo.erro.codigo).toBe('fila_padrao_de_inbox');
    expect(corpo.erro.mensagem).toContain('caixa de entrada');
  });

  it('recusa (409) fila usada como destino de regra de entrada', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    await a.dono.execute(sql`
      insert into regra_fila (tenant_id, nome, fila_destino_id, ordem)
      values (${a.tenantId}, ${`Regra ${randomUUID().slice(0, 6)}`}, ${criada.id}::uuid, 0)
    `);

    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('fila_usada_em_regra');
  });

  it('sem fila.gerenciar é 403; de outro tenant é 404', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});

    const semPoder = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoSemPoder),
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoDoOutroTenant),
    });
    expect(outroTenant.status).toBe(404);
  });
});

describe('atendentes na fila (vincular/desvincular)', () => {
  it('vincula um atendente novo, e o override troca ao vincular de novo', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const vinculo = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessaoGestor,
      { usuarioId: a.atendenteId, capacidadeOverride: 3 },
    );
    expect(vinculo.status).toBe(201);

    const { rows } = await a.dono.execute<{ capacidade_override: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.atendenteId}::uuid
    `);
    expect(rows[0]?.capacidade_override).toBe(3);

    const de_novo = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessaoGestor,
      { usuarioId: a.atendenteId, capacidadeOverride: 9 },
    );
    expect(de_novo.status).toBe(201);
    const { rows: depois } = await a.dono.execute<{ capacidade_override: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.atendenteId}::uuid
    `);
    expect(depois[0]?.capacidade_override).toBe(9);
  });

  it('atendente inexistente é 404; fila inexistente é 404', async () => {
    const { corpo: criada } = await criarFila(sessaoGestor, {});
    const semAtendente = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessaoGestor,
      { usuarioId: randomUUID() },
    );
    expect(semAtendente.status).toBe(404);

    const semFila = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${randomUUID()}/atendentes`,
      sessaoGestor,
      { usuarioId: a.atendenteId },
    );
    expect(semFila.status).toBe(404);
  });

  it('desvincula, e desvincular de novo é 404', async () => {
    // `a.atendenteId` já está em `a.filaId` (montado em `montarCenario`).
    const resposta = await fetch(
      `${api.url}/v1/gestao/atendentes/filas/${a.filaId}/atendentes/${a.atendenteId}`,
      { method: 'DELETE', headers: comCookie(sessaoGestor) },
    );
    expect(resposta.status).toBe(204);

    const de_novo = await fetch(
      `${api.url}/v1/gestao/atendentes/filas/${a.filaId}/atendentes/${a.atendenteId}`,
      { method: 'DELETE', headers: comCookie(sessaoGestor) },
    );
    expect(de_novo.status).toBe(404);

    // Devolve o vínculo para não afetar outros testes deste arquivo que dependem dele.
    await a.dono.execute(sql`
      insert into fila_atendente (tenant_id, fila_id, usuario_id)
      values (${a.tenantId}, ${a.filaId}::uuid, ${a.atendenteId}::uuid)
    `);
  });
});

/* =========================================================================
 * Item 2 — respostas prontas
 * ========================================================================= */

async function criarResposta(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/comunicacao/respostas-prontas', sessao, {
    atalho: `atalho-${randomUUID().slice(0, 8)}`,
    titulo: 'Saudação',
    corpo: 'Olá, tudo bem?',
    ...corpo,
  });
}

describe('POST /v1/gestao/comunicacao/respostas-prontas', () => {
  it('cria e registra no log', async () => {
    const { status, corpo } = await criarResposta(sessaoGestor);
    expect(status).toBe(201);
    const log = await auditoriaDe('resposta_pronta', corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]?.acao).toBe('criou');
  });

  it('recusa atalho com espaço, atalho repetido, e campo obrigatório vazio', async () => {
    const comEspaco = await criarResposta(sessaoGestor, { atalho: 'com espaco' });
    expect(comEspaco.status).toBe(400);
    expect(comEspaco.corpo.erro.codigo).toBe('atalho_com_espaco');

    const semTitulo = await criarResposta(sessaoGestor, { titulo: '' });
    expect(semTitulo.status).toBe(400);
    expect(semTitulo.corpo.erro.codigo).toBe('titulo_obrigatorio');

    const atalho = `unico-${randomUUID().slice(0, 6)}`;
    expect((await criarResposta(sessaoGestor, { atalho })).status).toBe(201);
    const repetido = await criarResposta(sessaoGestor, { atalho: `#${atalho}` });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('atalho_em_uso');
  });

  it('sem resposta_pronta.gerenciar é 403 — ter só fila.gerenciar não basta', async () => {
    const resposta = await criarResposta(sessaoSoFilas);
    expect(resposta.status).toBe(403);
    expect(resposta.corpo.erro.detalhe.permissao).toBe('resposta_pronta.gerenciar');
  });
});

describe('PATCH e DELETE /v1/gestao/comunicacao/respostas-prontas/:id', () => {
  it('edita o corpo e a categoria, e alterna ativa/desativada', async () => {
    const { corpo: criada } = await criarResposta(sessaoGestor);
    const editada = await pedir(
      'PATCH',
      `/v1/gestao/comunicacao/respostas-prontas/${criada.id}`,
      sessaoGestor,
      { corpo: 'Novo corpo', categoria: 'Suporte', ativa: false },
    );
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ corpo: 'Novo corpo', categoria: 'Suporte', ativa: false });
  });

  it('exclui (204); de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await criarResposta(sessaoGestor);

    const outroTenant = await fetch(
      `${api.url}/v1/gestao/comunicacao/respostas-prontas/${criada.id}`,
      { method: 'DELETE', headers: comCookie(sessaoDoOutroTenant) },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}/v1/gestao/comunicacao/respostas-prontas/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(malformado.status).toBe(404);

    const excluida = await fetch(`${api.url}/v1/gestao/comunicacao/respostas-prontas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from resposta_pronta where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

/* =========================================================================
 * Item 3 — pausas personalizadas
 * ========================================================================= */

async function criarPausa(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/atendentes/pausas', sessao, {
    nome: `Pausa ${randomUUID().slice(0, 6)}`,
    ...corpo,
  });
}

describe('POST /v1/gestao/atendentes/pausas', () => {
  it('cria e registra no log', async () => {
    const { status, corpo } = await criarPausa(sessaoGestor, { duracaoSugeridaMin: 15 });
    expect(status).toBe(201);
    const log = await auditoriaDe('motivo_pausa', corpo.id);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { duracaoSugeridaMin: 15 } });
  });

  it('recusa nome maior que 30 caracteres, duração fora de 1–480, e nome repetido', async () => {
    const nomeLongo = await criarPausa(sessaoGestor, { nome: 'x'.repeat(31) });
    expect(nomeLongo.status).toBe(400);
    expect(nomeLongo.corpo.erro.codigo).toBe('nome_tamanho');

    const duracaoInvalida = await criarPausa(sessaoGestor, { duracaoSugeridaMin: 481 });
    expect(duracaoInvalida.status).toBe(400);
    expect(duracaoInvalida.corpo.erro.codigo).toBe('duracao_invalida');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await criarPausa(sessaoGestor, { nome })).status).toBe(201);
    const repetida = await criarPausa(sessaoGestor, { nome });
    expect(repetida.status).toBe(409);
  });

  it('sem pausa.gerenciar é 403', async () => {
    const resposta = await criarPausa(sessaoSoFilas);
    expect(resposta.status).toBe(403);
    expect(resposta.corpo.erro.detalhe.permissao).toBe('pausa.gerenciar');
  });
});

describe('PATCH e DELETE /v1/gestao/atendentes/pausas/:id', () => {
  it('ativa/desativa e edita "conta como produtivo"', async () => {
    const { corpo: criada } = await criarPausa(sessaoGestor);
    const editada = await pedir('PATCH', `/v1/gestao/atendentes/pausas/${criada.id}`, sessaoGestor, {
      ativo: false,
      contaComoProdutivo: true,
    });
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ ativo: false, contaComoProdutivo: true });
  });

  it('exclui de verdade (204); pausas antigas não são afetadas por FK', async () => {
    const { corpo: criada } = await criarPausa(sessaoGestor);
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/pausas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(resposta.status).toBe(204);

    const outraVez = await fetch(`${api.url}/v1/gestao/atendentes/pausas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(outraVez.status).toBe(404);
  });
});
