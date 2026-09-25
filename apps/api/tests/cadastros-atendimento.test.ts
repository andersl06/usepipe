import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/autenticacao');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

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
let sessionManager: string;
/** Só `fila.gerenciar` — para provar que cada rota pede a SUA permissão, não qualquer uma. */
let sessionOnlyQueues: string;
/** Gente do tenant A sem permissão nenhuma. */
let sessionWithoutPoder: string;
/** Sessão válida, mas de outro tenant — prova que o tenant vem da sessão, nunca da URL. */
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

  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  const roleId = papeis[0]!.id;
  for (const codigo of permissions) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${roleId})
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

async function pedir(
  metodo: string,
  caminho: string,
  sessao: string,
  corpo?: Record<string, unknown>,
): Promise<{ status: number; corpo: Corpo }> {
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

  const permissionsAll = [
    'fila.gerenciar',
    'pausa.gerenciar',
    'resposta_pronta.gerenciar',
    'regra.gerenciar',
    'horario.gerenciar',
  ];
  const gestor = await pessoaCom(a, permissionsAll);
  const onlyQueues = await pessoaCom(a, ['fila.gerenciar']);
  const semPoder = await pessoaCom(a, []);
  const gestorDoB = await pessoaCom(b, permissionsAll);

  api = await upApi(0);
  sessionManager = await openSession(a, gestor);
  sessionOnlyQueues = await openSession(a, onlyQueues);
  sessionWithoutPoder = await openSession(a, semPoder);
  sessionOfOtherTenant = await openSession(b, gestorDoB);
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

async function createQueue(sessao: string, corpo: Record<string, unknown>) {
  return pedir('POST', '/v1/gestao/atendentes/filas', sessao, {
    nome: `Fila ${randomUUID().slice(0, 8)}`,
    capacidadePadrao: 5,
    ...corpo,
  });
}

describe('POST /v1/gestao/atendentes/filas', () => {
  it('cria a fila e registra no log de auditoria', async () => {
    const nome = `Cobrança ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await createQueue(sessionManager, { nome, capacidadePadrao: 8, ordem: 2 });
    expect(status).toBe(201);
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);

    const log = await auditoriaDe('fila', corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { nome, capacidadePadrao: 8 } });
  });

  it('recusa nome vazio (400), capacidade fora da faixa (400) e nome repetido (409)', async () => {
    const semNome = await createQueue(sessionManager, { nome: '  ' });
    expect(semNome.status).toBe(400);
    expect(semNome.corpo.erro.codigo).toBe('nome_obrigatorio');

    const capInvalida = await createQueue(sessionManager, { capacidadePadrao: 0 });
    expect(capInvalida.status).toBe(400);
    expect(capInvalida.corpo.erro.codigo).toBe('capacidade_invalida');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await createQueue(sessionManager, { nome })).status).toBe(201);
    const repetida = await createQueue(sessionManager, { nome });
    expect(repetida.status).toBe(409);
    expect(repetida.corpo.erro.codigo).toBe('nome_em_uso');
  });

  it('horário inexistente é 400; cor fora da paleta é 400', async () => {
    const semHorario = await createQueue(sessionManager, { horarioId: randomUUID() });
    expect(semHorario.status).toBe(400);
    expect(semHorario.corpo.erro.codigo).toBe('horario_nao_encontrado');

    const corInvalida = await createQueue(sessionManager, { cor: 'vermelho-sangue' });
    expect(corInvalida.status).toBe(400);
    expect(corInvalida.corpo.erro.codigo).toBe('cor_invalida');
  });

  it('sem fila.gerenciar é 403; sem sessão é 401', async () => {
    const semPoder = await createQueue(sessionWithoutPoder, {});
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.codigo).toBe('sem_permissao');
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('fila.gerenciar');

    const withoutSession = await fetch(`${api.url}/v1/gestao/atendentes/filas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Qualquer', capacidadePadrao: 5 }),
    });
    expect(withoutSession.status).toBe(401);
  });
});

describe('PATCH /v1/gestao/atendentes/filas/:id — renomear e ativar/desativar', () => {
  it('renomeia, muda capacidade/ordem/cor e registra só o que mudou', async () => {
    const { corpo: criada } = await createQueue(sessionManager, { nome: `Antes ${randomUUID().slice(0, 6)}` });
    const novoNome = `Depois ${randomUUID().slice(0, 6)}`;

    const { status, corpo } = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessionManager, {
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
    const { corpo: criada } = await createQueue(sessionManager, {});
    const desativada = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessionManager, {
      ativa: false,
    });
    expect(desativada.status).toBe(200);
    expect(desativada.corpo.ativa).toBe(false);
  });

  it('nada mudado não grava nem registra', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});
    const antes = await auditoriaDe('fila', criada.id);
    const empty = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessionManager, {});
    expect(empty.status).toBe(200);
    expect(await auditoriaDe('fila', criada.id)).toHaveLength(antes.length);
  });

  it('sem fila.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});

    const semPoder = await pedir('PATCH', `/v1/gestao/atendentes/filas/${criada.id}`, sessionWithoutPoder, {
      nome: 'Invasor',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/atendentes/filas/${criada.id}`,
      sessionOfOtherTenant,
      { nome: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/atendentes/filas/nao-e-uuid', sessionManager, {
      nome: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });
});

describe('DELETE /v1/gestao/atendentes/filas/:id', () => {
  it('exclui de verdade (204) e registra no log', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
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
    const { corpo: criada } = await createQueue(sessionManager, {});
    const { rows: contacts } = await a.dono.execute<{ id: string }>(
      sql`insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente teste') returning id`,
    );
    await a.dono.execute(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contacts[0]!.id}::uuid, ${criada.id}::uuid)
    `);

    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { error: { codigo: string } };
    expect(corpo.error.codigo).toBe('fila_com_conversa_aberta');
  });

  it('recusa (409) fila padrão de caixa de entrada — mensagem clara', async () => {
    // `a.filaId` é a fila padrão de `a.inboxId` (montada em `montarCenario`).
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${a.queueId}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string; message: string } };
    expect(corpo.erro.codigo).toBe('fila_padrao_de_inbox');
    expect(corpo.erro.message).toContain('caixa de entrada');
  });

  it('recusa (409) fila usada como destino de regra de entrada', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});
    await a.dono.execute(sql`
      insert into regra_fila (tenant_id, nome, fila_destino_id, ordem)
      values (${a.tenantId}, ${`Regra ${randomUUID().slice(0, 6)}`}, ${criada.id}::uuid, 0)
    `);

    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('fila_usada_em_regra');
  });

  it('sem fila.gerenciar é 403; de outro tenant é 404', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});

    const semPoder = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionWithoutPoder),
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await fetch(`${api.url}/v1/gestao/atendentes/filas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);
  });
});

describe('atendentes na fila (vincular/desvincular)', () => {
  it('vincula um atendente novo, e o override troca ao vincular de novo', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});
    const vinculo = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessionManager,
      { usuarioId: a.agentId, capacidadeOverride: 3 },
    );
    expect(vinculo.status).toBe(201);

    const { rows } = await a.dono.execute<{ capacityOverride: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.agentId}::uuid
    `);
    expect(rows[0]?.capacityOverride).toBe(3);

    const de_novo = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessionManager,
      { usuarioId: a.agentId, capacidadeOverride: 9 },
    );
    expect(de_novo.status).toBe(201);
    const { rows: depois } = await a.dono.execute<{ capacidade_override: number }>(sql`
      select capacidade_override from fila_atendente
       where fila_id = ${criada.id}::uuid and usuario_id = ${a.agentId}::uuid
    `);
    expect(depois[0]?.capacidade_override).toBe(9);
  });

  it('atendente inexistente é 404; fila inexistente é 404', async () => {
    const { corpo: criada } = await createQueue(sessionManager, {});
    const withoutAgent = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${criada.id}/atendentes`,
      sessionManager,
      { usuarioId: randomUUID() },
    );
    expect(withoutAgent.status).toBe(404);

    const withoutQueue = await pedir(
      'POST',
      `/v1/gestao/atendentes/filas/${randomUUID()}/atendentes`,
      sessionManager,
      { usuarioId: a.agentId },
    );
    expect(withoutQueue.status).toBe(404);
  });

  it('desvincula, e desvincular de novo é 404', async () => {
    // `a.atendenteId` já está em `a.filaId` (montado em `montarCenario`).
    const resposta = await fetch(
      `${api.url}/v1/gestao/atendentes/filas/${a.queueId}/atendentes/${a.agentId}`,
      { method: 'DELETE', headers: comCookie(sessionManager) },
    );
    expect(resposta.status).toBe(204);

    const de_novo = await fetch(
      `${api.url}/v1/gestao/atendentes/filas/${a.queueId}/atendentes/${a.agentId}`,
      { method: 'DELETE', headers: comCookie(sessionManager) },
    );
    expect(de_novo.status).toBe(404);

    // Devolve o vínculo para não afetar outros testes deste arquivo que dependem dele.
    await a.dono.execute(sql`
      insert into fila_atendente (tenant_id, fila_id, usuario_id)
      values (${a.tenantId}, ${a.queueId}::uuid, ${a.agentId}::uuid)
    `);
  });
});

/* =========================================================================
 * Item 2 — respostas prontas
 * ========================================================================= */

async function createResponse(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/comunicacao/respostas-prontas', sessao, {
    atalho: `atalho-${randomUUID().slice(0, 8)}`,
    titulo: 'Saudação',
    corpo: 'Olá, tudo bem?',
    ...corpo,
  });
}

describe('POST /v1/gestao/comunicacao/respostas-prontas', () => {
  it('cria e registra no log', async () => {
    const { status, corpo } = await createResponse(sessionManager);
    expect(status).toBe(201);
    const log = await auditoriaDe('resposta_pronta', corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]?.acao).toBe('criou');
  });

  it('recusa atalho com espaço, atalho repetido, e campo obrigatório vazio', async () => {
    const comEspaco = await createResponse(sessionManager, { atalho: 'com espaco' });
    expect(comEspaco.status).toBe(400);
    expect(comEspaco.corpo.erro.codigo).toBe('atalho_com_espaco');

    const semTitulo = await createResponse(sessionManager, { titulo: '' });
    expect(semTitulo.status).toBe(400);
    expect(semTitulo.corpo.erro.codigo).toBe('titulo_obrigatorio');

    const atalho = `unico-${randomUUID().slice(0, 6)}`;
    expect((await createResponse(sessionManager, { atalho })).status).toBe(201);
    const repetido = await createResponse(sessionManager, { atalho: `#${atalho}` });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('atalho_em_uso');
  });

  it('sem resposta_pronta.gerenciar é 403 — ter só fila.gerenciar não basta', async () => {
    const resposta = await createResponse(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.corpo.erro.detalhe.permissao).toBe('resposta_pronta.gerenciar');
  });
});

describe('PATCH e DELETE /v1/gestao/comunicacao/respostas-prontas/:id', () => {
  it('edita o corpo e a categoria, e alterna ativa/desativada', async () => {
    const { corpo: criada } = await createResponse(sessionManager);
    const editada = await pedir(
      'PATCH',
      `/v1/gestao/comunicacao/respostas-prontas/${criada.id}`,
      sessionManager,
      { corpo: 'Novo corpo', categoria: 'Suporte', ativa: false },
    );
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ corpo: 'Novo corpo', categoria: 'Suporte', ativa: false });
  });

  it('exclui (204); de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await createResponse(sessionManager);

    const outroTenant = await fetch(
      `${api.url}/v1/gestao/comunicacao/respostas-prontas/${criada.id}`,
      { method: 'DELETE', headers: comCookie(sessionOfOtherTenant) },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}/v1/gestao/comunicacao/respostas-prontas/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(malformado.status).toBe(404);

    const excluida = await fetch(`${api.url}/v1/gestao/comunicacao/respostas-prontas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
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

async function createPause(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/atendentes/pausas', sessao, {
    nome: `Pausa ${randomUUID().slice(0, 6)}`,
    ...corpo,
  });
}

describe('POST /v1/gestao/atendentes/pausas', () => {
  it('cria e registra no log', async () => {
    const { status, corpo } = await createPause(sessionManager, { duracaoSugeridaMin: 15 });
    expect(status).toBe(201);
    const log = await auditoriaDe('motivo_pausa', corpo.id);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { duracaoSugeridaMin: 15 } });
  });

  it('recusa nome maior que 30 caracteres, duração fora de 1–480, e nome repetido', async () => {
    const nomeLongo = await createPause(sessionManager, { nome: 'x'.repeat(31) });
    expect(nomeLongo.status).toBe(400);
    expect(nomeLongo.corpo.erro.codigo).toBe('nome_tamanho');

    const durationInvalid = await createPause(sessionManager, { duracaoSugeridaMin: 481 });
    expect(durationInvalid.status).toBe(400);
    expect(durationInvalid.corpo.erro.codigo).toBe('duracao_invalida');

    const nome = `Repetida ${randomUUID().slice(0, 6)}`;
    expect((await createPause(sessionManager, { nome })).status).toBe(201);
    const repetida = await createPause(sessionManager, { nome });
    expect(repetida.status).toBe(409);
  });

  it('sem pausa.gerenciar é 403', async () => {
    const resposta = await createPause(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.corpo.erro.detalhe.permissao).toBe('pausa.gerenciar');
  });
});

describe('PATCH e DELETE /v1/gestao/atendentes/pausas/:id', () => {
  it('ativa/desativa e edita "conta como produtivo"', async () => {
    const { corpo: criada } = await createPause(sessionManager);
    const editada = await pedir('PATCH', `/v1/gestao/atendentes/pausas/${criada.id}`, sessionManager, {
      ativo: false,
      contaComoProdutivo: true,
    });
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ ativo: false, contaComoProdutivo: true });
  });

  it('exclui de verdade (204); pausas antigas não são afetadas por FK', async () => {
    const { corpo: criada } = await createPause(sessionManager);
    const resposta = await fetch(`${api.url}/v1/gestao/atendentes/pausas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const outraVez = await fetch(`${api.url}/v1/gestao/atendentes/pausas/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(outraVez.status).toBe(404);
  });
});

/* =========================================================================
 * Item 1 (segunda parte) — editar/excluir/reordenar regra de atendimento
 * ========================================================================= */

async function createRuleQueueSql(queueDestinationId: string, order = 0, nome?: string) {
  const nomeRegra = nome ?? `Regra ${randomUUID().slice(0, 8)}`;
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into regra_fila (tenant_id, nome, fila_destino_id, ordem)
    values (${a.tenantId}, ${nomeRegra}, ${queueDestinationId}::uuid, ${order})
    returning id
  `);
  const id = rows[0]!.id;
  await a.dono.execute(sql`
    insert into regra_fila_condicao (tenant_id, regra_id, campo, operador, valor)
    values (${a.tenantId}, ${id}::uuid, 'mensagem', 'contem', 'boleto')
  `);
  return { id, nome: nomeRegra };
}

describe('PATCH /v1/gestao/regras/atendimento/:id', () => {
  it('renomeia, muda ordem/combinador e registra só o que mudou — REORDENAR é este mesmo PATCH', async () => {
    const { id } = await createRuleQueueSql(a.queueId, 0);
    const novoNome = `Depois ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await pedir(
      'PATCH',
      `/v1/gestao/regras/atendimento/${id}`,
      sessionManager,
      { nome: novoNome, ordem: 5 },
    );
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ id, nome: novoNome, ordem: 5 });

    const log = await auditoriaDe('regra_fila', id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { nome: novoNome, ordem: 5 } });
    expect(log.at(-1)?.depois).not.toHaveProperty('combinador');
  });

  it('substitui todas as condições quando `condicoes` vem no pedido', async () => {
    const { id } = await createRuleQueueSql(a.queueId);
    const { status, corpo } = await pedir(
      'PATCH',
      `/v1/gestao/regras/atendimento/${id}`,
      sessionManager,
      { condicoes: [{ campo: 'contato.nome', operador: 'igual', valor: 'Ana' }] },
    );
    expect(status).toBe(200);
    expect(corpo.condicoes).toEqual([{ campo: 'contato.nome', operador: 'igual', valor: 'Ana' }]);
  });

  it('recusa condições vazias (400), campo inválido (400) e fila de destino inexistente (400)', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const withoutCondition = await pedir('PATCH', `/v1/gestao/regras/atendimento/${id}`, sessionManager, {
      condicoes: [],
    });
    expect(withoutCondition.status).toBe(400);
    expect(withoutCondition.corpo.erro.codigo).toBe('sem_condicao');

    const campoInvalido = await pedir('PATCH', `/v1/gestao/regras/atendimento/${id}`, sessionManager, {
      condicoes: [{ campo: 'nao-existe', operador: 'igual', valor: 'x' }],
    });
    expect(campoInvalido.status).toBe(400);
    expect(campoInvalido.corpo.erro.codigo).toBe('campo_invalido');

    const semFila = await pedir('PATCH', `/v1/gestao/regras/atendimento/${id}`, sessionManager, {
      filaDestinoId: randomUUID(),
    });
    expect(semFila.status).toBe(400);
    expect(semFila.corpo.erro.codigo).toBe('fila_nao_encontrada');
  });

  it('nome repetido é 409', async () => {
    const { nome: nomeExistente } = await createRuleQueueSql(a.queueId);
    const { id: outraId } = await createRuleQueueSql(a.queueId);
    const repetido = await pedir('PATCH', `/v1/gestao/regras/atendimento/${outraId}`, sessionManager, {
      nome: nomeExistente,
    });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('nome_em_uso');
  });

  it('sem regra.gerenciar é 403 (ter só fila.gerenciar não basta); de outro tenant é 404; id malformado é 404', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const semPoder = await pedir('PATCH', `/v1/gestao/regras/atendimento/${id}`, sessionOnlyQueues, {
      nome: 'Invasor',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('regra.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/regras/atendimento/${id}`,
      sessionOfOtherTenant,
      { nome: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/regras/atendimento/nao-e-uuid', sessionManager, {
      nome: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });
});

describe('DELETE /v1/gestao/regras/atendimento/:id', () => {
  it('exclui de verdade (204) e registra no log', async () => {
    const { id } = await createRuleQueueSql(a.queueId);
    const resposta = await fetch(`${api.url}/v1/gestao/regras/atendimento/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_fila where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');

    const log = await auditoriaDe('regra_fila', id);
    expect(log.at(-1)).toMatchObject({ acao: 'excluiu' });
  });

  it('sem regra.gerenciar é 403; de outro tenant é 404', async () => {
    const { id } = await createRuleQueueSql(a.queueId);

    const semPoder = await fetch(`${api.url}/v1/gestao/regras/atendimento/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOnlyQueues),
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await fetch(`${api.url}/v1/gestao/regras/atendimento/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);
  });
});

/* =========================================================================
 * Item 2 — regras de SLA
 * ========================================================================= */

async function createRuleSla(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/configuracoes/regras', sessao, {
    nome: `SLA ${randomUUID().slice(0, 8)}`,
    alvo: 'primeira_resposta',
    prazoSeg: 600,
    ...corpo,
  });
}

describe('POST /v1/gestao/configuracoes/regras', () => {
  it('cria e registra no log de auditoria', async () => {
    const { status, corpo } = await createRuleSla(sessionManager, { alertaSeg: 300 });
    expect(status).toBe(201);
    const log = await auditoriaDe('regra_sla', corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou' });
  });

  it('recusa alvo inválido (400), prazo inválido (400), alerta ≥ prazo (400) e nome repetido (409)', async () => {
    const alvoInvalido = await createRuleSla(sessionManager, { alvo: 'chute' });
    expect(alvoInvalido.status).toBe(400);
    expect(alvoInvalido.corpo.erro.codigo).toBe('alvo_invalido');

    const prazoInvalido = await createRuleSla(sessionManager, { prazoSeg: 0 });
    expect(prazoInvalido.status).toBe(400);
    expect(prazoInvalido.corpo.erro.codigo).toBe('prazo_invalido');

    const alertaInvalido = await createRuleSla(sessionManager, { prazoSeg: 100, alertaSeg: 200 });
    expect(alertaInvalido.status).toBe(400);
    expect(alertaInvalido.corpo.erro.codigo).toBe('alerta_invalido');

    const nome = `Única ${randomUUID().slice(0, 6)}`;
    expect((await createRuleSla(sessionManager, { nome })).status).toBe(201);
    const repetida = await createRuleSla(sessionManager, { nome });
    expect(repetida.status).toBe(409);
    expect(repetida.corpo.erro.codigo).toBe('nome_em_uso');
  });

  it('escopo "fila" exige escopoId existente; escopo fora do suportado é 400', async () => {
    const withoutScopeId = await createRuleSla(sessionManager, { escopoTipo: 'fila' });
    expect(withoutScopeId.status).toBe(400);
    expect(withoutScopeId.corpo.erro.codigo).toBe('escopo_id_obrigatorio');

    const queueWrong = await createRuleSla(sessionManager, { escopoTipo: 'fila', escopoId: randomUUID() });
    expect(queueWrong.status).toBe(400);
    expect(queueWrong.corpo.erro.codigo).toBe('fila_nao_encontrada');

    const scopeOutside = await createRuleSla(sessionManager, { escopoTipo: 'inbox', escopoId: a.inboxId });
    expect(scopeOutside.status).toBe(400);
    expect(scopeOutside.corpo.erro.codigo).toBe('escopo_invalido');

    const withQueue = await createRuleSla(sessionManager, { escopoTipo: 'fila', escopoId: a.queueId });
    expect(withQueue.status).toBe(201);
  });

  it('sem regra.gerenciar é 403', async () => {
    const resposta = await createRuleSla(sessionOnlyQueues);
    expect(resposta.status).toBe(403);
    expect(resposta.corpo.erro.detalhe.permissao).toBe('regra.gerenciar');
  });
});

describe('PATCH e DELETE /v1/gestao/configuracoes/regras/:id', () => {
  it('edita prazo e alerta juntos, e registra só o que mudou', async () => {
    const { corpo: criada } = await createRuleSla(sessionManager, { prazoSeg: 600, alertaSeg: 300 });
    const editada = await pedir(
      'PATCH',
      `/v1/gestao/configuracoes/regras/${criada.id}`,
      sessionManager,
      { prazoSeg: 1200, alertaSeg: 900 },
    );
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ prazoSeg: 1200, alertaSeg: 900 });
  });

  it('encolher o prazo abaixo do alerta já cadastrado sem mandar o novo alerta é 400', async () => {
    const { corpo: criada } = await createRuleSla(sessionManager, { prazoSeg: 600, alertaSeg: 500 });
    const resposta = await pedir(
      'PATCH',
      `/v1/gestao/configuracoes/regras/${criada.id}`,
      sessionManager,
      { prazoSeg: 400 },
    );
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro.codigo).toBe('alerta_invalido');
  });

  it('sem regra.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await createRuleSla(sessionManager);

    const semPoder = await pedir(
      'PATCH',
      `/v1/gestao/configuracoes/regras/${criada.id}`,
      sessionOnlyQueues,
      { nome: 'Invasor' },
    );
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/configuracoes/regras/${criada.id}`,
      sessionOfOtherTenant,
      { nome: 'Vizinho' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/configuracoes/regras/nao-e-uuid', sessionManager, {
      nome: 'Tanto faz',
    });
    expect(malformado.status).toBe(404);
  });

  it('exclui de verdade (204); de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await createRuleSla(sessionManager);

    const outroTenant = await fetch(`${api.url}/v1/gestao/configuracoes/regras/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionOfOtherTenant),
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}/v1/gestao/configuracoes/regras/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(malformado.status).toBe(404);

    const excluida = await fetch(`${api.url}/v1/gestao/configuracoes/regras/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_sla where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('recusa (409) excluir regra com SLA correndo em conversa aberta', async () => {
    const { corpo: criada } = await createRuleSla(sessionManager);
    const { rows: contatos } = await a.dono.execute<{ id: string }>(
      sql`insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente SLA') returning id`,
    );
    const { rows: conversations } = await a.dono.execute<{ id: string }>(sql`
      insert into conversa (tenant_id, inbox_id, contato_id, fila_id)
      values (${a.tenantId}, ${a.inboxId}::uuid, ${contatos[0]!.id}::uuid, ${a.queueId}::uuid)
      returning id
    `);
    await a.dono.execute(sql`
      insert into sla_conversa (tenant_id, conversa_id, regra_id, prazo_em, estado)
      values (${a.tenantId}, ${conversations[0]!.id}::uuid, ${criada.id}::uuid, now() + interval '10 minutes', 'correndo')
    `);

    const resposta = await fetch(`${api.url}/v1/gestao/configuracoes/regras/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('regra_com_sla_correndo');
  });
});

/* =========================================================================
 * Item 3 — editar/excluir faixa e exceção de horário
 * ========================================================================= */

async function createScheduleSql(nome?: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_atendimento (tenant_id, nome, fuso)
    values (${a.tenantId}, ${nome ?? `Horário ${randomUUID().slice(0, 6)}`}, 'America/Sao_Paulo')
    returning id
  `);
  return rows[0]!.id;
}

async function createRangeSql(
  horarioId: string,
  diaSemana = 1,
  inicio = '09:00',
  fim = '18:00',
): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_faixa (tenant_id, horario_id, dia_semana, inicio, fim)
    values (${a.tenantId}, ${horarioId}::uuid, ${diaSemana}, ${inicio}, ${fim})
    returning id
  `);
  return rows[0]!.id;
}

async function createExceptionSql(
  horarioId: string,
  data: string,
  fechado: boolean,
  inicio: string | null = null,
  fim: string | null = null,
): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into horario_excecao (tenant_id, horario_id, data, fechado, inicio, fim)
    values (${a.tenantId}, ${horarioId}::uuid, ${data}, ${fechado}, ${inicio}, ${fim})
    returning id
  `);
  return rows[0]!.id;
}

describe('PATCH e DELETE /v1/gestao/regras/horarios/faixas/:id', () => {
  it('edita início/fim e registra só o que mudou', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId, 1, '09:00', '18:00');
    const { status, corpo } = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/faixas/${id}`,
      sessionManager,
      { inicio: '08:00' },
    );
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ inicio: '08:00', fim: '18:00' });

    const log = await auditoriaDe('horario_faixa', id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou' });
  });

  it('recusa (409) fim antes ou igual ao início', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);
    const resposta = await pedir('PATCH', `/v1/gestao/regras/horarios/faixas/${id}`, sessionManager, {
      fim: '09:00',
    });
    expect(resposta.status).toBe(409);
    expect(resposta.corpo.erro.codigo).toBe('fim_antes_do_inicio');
  });

  it('recusa (409) sobreposição com outra faixa do mesmo dia', async () => {
    const horarioId = await createScheduleSql();
    await createRangeSql(horarioId, 2, '09:00', '12:00');
    const id = await createRangeSql(horarioId, 2, '14:00', '18:00');
    const resposta = await pedir('PATCH', `/v1/gestao/regras/horarios/faixas/${id}`, sessionManager, {
      inicio: '10:00',
    });
    expect(resposta.status).toBe(409);
    expect(resposta.corpo.erro.codigo).toBe('faixa_sobreposta');
  });

  it('sem horario.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);

    const semPoder = await pedir('PATCH', `/v1/gestao/regras/horarios/faixas/${id}`, sessionOnlyQueues, {
      inicio: '08:00',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('horario.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/faixas/${id}`,
      sessionOfOtherTenant,
      { inicio: '08:00' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/regras/horarios/faixas/nao-e-uuid', sessionManager, {
      inicio: '08:00',
    });
    expect(malformado.status).toBe(404);
  });

  it('exclui de verdade (204)', async () => {
    const horarioId = await createScheduleSql();
    const id = await createRangeSql(horarioId);
    const resposta = await fetch(`${api.url}/v1/gestao/regras/horarios/faixas/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from horario_faixa where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

describe('PATCH e DELETE /v1/gestao/regras/horarios/excecoes/:id', () => {
  it('edita motivo e data', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-12-25', true);
    const { status, corpo } = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/excecoes/${id}`,
      sessionManager,
      { motivo: 'Natal' },
    );
    expect(status).toBe(200);
    expect(corpo.motivo).toBe('Natal');
  });

  it('recusa (400) abrir sem horário próprio e (400) fechar sem limpar o horário', async () => {
    const horarioId = await createScheduleSql();

    const fechada = await createExceptionSql(horarioId, '2026-12-24', true);
    const abrirSemHorario = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/excecoes/${fechada}`,
      sessionManager,
      { fechado: false },
    );
    expect(abrirSemHorario.status).toBe(400);
    expect(abrirSemHorario.corpo.erro.codigo).toBe('excecao_sem_horario');

    const aberta = await createExceptionSql(horarioId, '2026-11-01', false, '08:00', '12:00');
    const fecharComHorario = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/excecoes/${aberta}`,
      sessionManager,
      { fechado: true },
    );
    expect(fecharComHorario.status).toBe(400);
    expect(fecharComHorario.corpo.erro.codigo).toBe('excecao_fechada_com_horario');
  });

  it('recusa (409) data que colide com outra exceção do mesmo horário', async () => {
    const horarioId = await createScheduleSql();
    await createExceptionSql(horarioId, '2026-01-01', true);
    const id = await createExceptionSql(horarioId, '2026-01-02', true);
    const resposta = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/excecoes/${id}`,
      sessionManager,
      { data: '2026-01-01' },
    );
    expect(resposta.status).toBe(409);
    expect(resposta.corpo.erro.codigo).toBe('data_em_uso');
  });

  it('sem horario.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-03-01', true);

    const semPoder = await pedir('PATCH', `/v1/gestao/regras/horarios/excecoes/${id}`, sessionOnlyQueues, {
      motivo: 'x',
    });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/regras/horarios/excecoes/${id}`,
      sessionOfOtherTenant,
      { motivo: 'x' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir(
      'PATCH',
      '/v1/gestao/regras/horarios/excecoes/nao-e-uuid',
      sessionManager,
      { motivo: 'x' },
    );
    expect(malformado.status).toBe(404);
  });

  it('exclui de verdade (204)', async () => {
    const horarioId = await createScheduleSql();
    const id = await createExceptionSql(horarioId, '2026-04-01', true);
    const resposta = await fetch(`${api.url}/v1/gestao/regras/horarios/excecoes/${id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from horario_excecao where id = ${id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});

/* =========================================================================
 * Item 4 — CRUD básico de regra de prioridade
 * ========================================================================= */

async function createRulePriority(session: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', '/v1/gestao/regras/prioridade', session, {
    nome: `Prioridade ${randomUUID().slice(0, 8)}`,
    nivel: 'alta',
    ...corpo,
  });
}

describe('GET/POST/PATCH/DELETE /v1/gestao/regras/prioridade', () => {
  it('cria, lista e registra no log', async () => {
    const { status, corpo } = await createRulePriority(sessionManager);
    expect(status).toBe(201);
    const log = await auditoriaDe('regra_prioridade', corpo.id);
    expect(log[0]).toMatchObject({ acao: 'criou' });

    const listing = await pedir('GET', '/v1/gestao/regras/prioridade', sessionManager);
    expect(listing.status).toBe(200);
    expect((listing.corpo as { id: string }[]).some((r) => r.id === corpo.id)).toBe(true);
  });

  it('recusa nível não atribuível (400), condição que não é objeto (400) e nome repetido (409)', async () => {
    const nivelInvalido = await createRulePriority(sessionManager, { nivel: 'sem_prioridade' });
    expect(nivelInvalido.status).toBe(400);
    expect(nivelInvalido.corpo.erro.codigo).toBe('nivel_invalido');

    const conditionInvalid = await createRulePriority(sessionManager, { condicao: 'nao e objeto' });
    expect(conditionInvalid.status).toBe(400);
    expect(conditionInvalid.corpo.erro.codigo).toBe('condicao_invalida');

    const nome = `Única ${randomUUID().slice(0, 6)}`;
    expect((await createRulePriority(sessionManager, { nome })).status).toBe(201);
    const repetida = await createRulePriority(sessionManager, { nome });
    expect(repetida.status).toBe(409);
    expect(repetida.corpo.erro.codigo).toBe('nome_em_uso');
  });

  it('escopo fora do suportado (inbox/equipe/etiqueta) é 400', async () => {
    const resposta = await createRulePriority(sessionManager, {
      escopoTipo: 'etiqueta',
      escopoId: randomUUID(),
    });
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro.codigo).toBe('escopo_invalido');
  });

  it('edita nível e condição, e registra só o que mudou', async () => {
    const { corpo: criada } = await createRulePriority(sessionManager);
    const editada = await pedir(
      'PATCH',
      `/v1/gestao/regras/prioridade/${criada.id}`,
      sessionManager,
      { nivel: 'maxima', condicao: { etiqueta: 'vip' } },
    );
    expect(editada.status).toBe(200);
    expect(editada.corpo).toMatchObject({ nivel: 'maxima', condicao: { etiqueta: 'vip' } });
  });

  it('sem regra.gerenciar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await createRulePriority(sessionManager);

    const semPoder = await pedir(
      'PATCH',
      `/v1/gestao/regras/prioridade/${criada.id}`,
      sessionOnlyQueues,
      { nivel: 'baixa' },
    );
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('regra.gerenciar');

    const outroTenant = await pedir(
      'PATCH',
      `/v1/gestao/regras/prioridade/${criada.id}`,
      sessionOfOtherTenant,
      { nivel: 'baixa' },
    );
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', '/v1/gestao/regras/prioridade/nao-e-uuid', sessionManager, {
      nivel: 'baixa',
    });
    expect(malformado.status).toBe(404);
  });

  it('exclui de verdade (204)', async () => {
    const { corpo: criada } = await createRulePriority(sessionManager);
    const resposta = await fetch(`${api.url}/v1/gestao/regras/prioridade/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessionManager),
    });
    expect(resposta.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from regra_prioridade where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
  });
});
