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
 * Etiquetar conversa ABERTA e etiquetar CONTATO — `controladores/etiquetas.ts`,
 * `dominio/etiquetas.ts` (auditoria do Desk, itens 16 e 17).
 *
 * Até aqui a única forma de marcar tag numa conversa era encerrando
 * (`POST /encerrar`), e `contato_etiqueta` não tinha rota nenhuma. As três
 * rotas novas: o catálogo (`GET /v1/etiquetas?escopo=`), a conversa
 * (`POST`/`DELETE /v1/conversas/:id/etiquetas`, permissão `conversa.etiquetar`
 * e tem de ser o dono) e o contato (`GET`/`POST`/`DELETE
 * /v1/contatos/:id/etiquetas`, permissão `contato.editar`). O escopo da
 * etiqueta é conferido no servidor e cada gesto grava auditoria.
 */

let a: Cenario;
let api: ApiNoAr;
let atendenteId: string;
let sessaoAtendente: string;
let sessaoSemPoder: string;
let colegaId: string;
let sessaoColega: string;
let etiquetaConversa: string;
let etiquetaContato: string;
let etiquetaAmbos: string;

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

function comChave(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function chamar(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  cabecalhos: Record<string, string>,
  corpo?: unknown,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function criarEtiqueta(escopo: 'conversa' | 'contato' | 'ambos'): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into etiqueta (tenant_id, nome, escopo)
    values (${a.tenantId}, ${`${escopo}-${randomUUID().slice(0, 6)}`}, ${escopo}) returning id
  `);
  return rows[0]!.id;
}

async function criarContato(): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente de teste') returning id
  `);
  return rows[0]!.id;
}

async function criarConversa(
  dono: string | null,
  estado: 'atribuida' | 'em_atendimento' | 'encerrada' = 'atribuida',
): Promise<{ conversaId: string; contatoId: string }> {
  const contatoId = await criarContato();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contatoId}::uuid, ${a.filaId}::uuid, ${dono},
            ${estado}, now())
    returning id
  `);
  return { conversaId: rows[0]!.id, contatoId };
}

async function etiquetasDaConversa(conversaId: string): Promise<string[]> {
  const { rows } = await a.dono.execute<{ etiqueta_id: string }>(
    sql`select etiqueta_id from conversa_etiqueta where conversa_id = ${conversaId}::uuid`,
  );
  return rows.map((r) => r.etiqueta_id);
}

async function auditoriaDe(objetoTipo: string, objetoId: string) {
  const { rows } = await a.dono.execute<{ acao: string; antes: unknown; depois: unknown }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = ${objetoTipo} and objeto_id = ${objetoId}::uuid
     order by em asc, id asc
  `);
  return rows;
}

beforeAll(async () => {
  a = await montarCenario(`etiquetas-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  atendenteId = await pessoaCom(a, ['conversa.etiquetar', 'contato.editar']);
  sessaoAtendente = await abrirSessao(a, atendenteId);
  sessaoSemPoder = await abrirSessao(a, await pessoaCom(a, []));
  colegaId = await pessoaCom(a, ['conversa.etiquetar']);
  sessaoColega = await abrirSessao(a, colegaId);
  etiquetaConversa = await criarEtiqueta('conversa');
  etiquetaContato = await criarEtiqueta('contato');
  etiquetaAmbos = await criarEtiqueta('ambos');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('GET /v1/etiquetas — o catálogo do tenant', () => {
  it('lista todas sem filtro, e só as que cabem no alvo com `?escopo=`', async () => {
    const todas = await chamar('GET', '/v1/etiquetas', comCookie(sessaoAtendente));
    expect(todas.status).toBe(200);
    const ids = (todas.corpo['etiquetas'] as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([etiquetaConversa, etiquetaContato, etiquetaAmbos]));

    const deContato = await chamar('GET', '/v1/etiquetas?escopo=contato', comCookie(sessaoAtendente));
    const idsContato = (deContato.corpo['etiquetas'] as { id: string }[]).map((e) => e.id);
    expect(idsContato).toContain(etiquetaContato);
    expect(idsContato).toContain(etiquetaAmbos);
    expect(idsContato).not.toContain(etiquetaConversa);
  });

  it('escopo desconhecido é 400; sem sessão é 401', async () => {
    const invalido = await chamar('GET', '/v1/etiquetas?escopo=fila', comCookie(sessaoAtendente));
    expect(invalido.status).toBe(400);
    const semSessao = await chamar('GET', '/v1/etiquetas', { 'content-type': 'application/json' });
    expect(semSessao.status).toBe(401);
  });
});

describe('POST/DELETE /v1/conversas/:id/etiquetas — a conversa aberta', () => {
  it('aplica, é idempotente, remove, e cada gesto grava auditoria', async () => {
    const { conversaId } = await criarConversa(atendenteId);

    const aplicada = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaConversa },
    );
    expect(aplicada.status).toBe(201);
    expect(aplicada.corpo).toMatchObject({ etiqueta_id: etiquetaConversa, aplicada: true });
    expect(await etiquetasDaConversa(conversaId)).toEqual([etiquetaConversa]);

    // A conversa continua ABERTA: etiquetar não é encerrar.
    const { rows } = await a.dono.execute<{ estado: string }>(
      sql`select estado from conversa where id = ${conversaId}::uuid`,
    );
    expect(rows[0]?.estado).toBe('atribuida');

    const deNovo = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaConversa },
    );
    expect(deNovo.status).toBe(201);
    expect(deNovo.corpo['aplicada']).toBe(false);

    const removida = await chamar(
      'DELETE',
      `/v1/conversas/${conversaId}/etiquetas/${etiquetaConversa}`,
      comCookie(sessaoAtendente),
    );
    expect(removida.status).toBe(200);
    expect(removida.corpo).toEqual({ removida: true });
    expect(await etiquetasDaConversa(conversaId)).toEqual([]);

    const semNada = await chamar(
      'DELETE',
      `/v1/conversas/${conversaId}/etiquetas/${etiquetaConversa}`,
      comCookie(sessaoAtendente),
    );
    expect(semNada.corpo).toEqual({ removida: false });

    // Um `criou` e um `excluiu` — o no-op não grava linha.
    const log = await auditoriaDe('conversa_etiqueta', conversaId);
    expect(log.map((l) => l.acao)).toEqual(['criou', 'excluiu']);
    expect(log[0]?.depois).toMatchObject({ etiqueta_id: etiquetaConversa });
    expect(log[1]?.antes).toMatchObject({ etiqueta_id: etiquetaConversa });
  });

  it('a etiqueta aplicada aparece em GET /v1/desk/conversas/:id e pré-marca o encerramento', async () => {
    const { conversaId } = await criarConversa(atendenteId);
    await chamar('POST', `/v1/conversas/${conversaId}/etiquetas`, comCookie(sessaoAtendente), {
      etiqueta_id: etiquetaAmbos,
    });
    const tela = await chamar('GET', `/v1/desk/conversas/${conversaId}`, comCookie(sessaoAtendente));
    const aberta = tela.corpo['aberta'] as { etiquetasDaConversa: { id: string }[] };
    expect(aberta.etiquetasDaConversa.map((e) => e.id)).toEqual([etiquetaAmbos]);
  });

  it('exige `etiqueta_id`, e recusa etiqueta de escopo contato numa conversa', async () => {
    const { conversaId } = await criarConversa(atendenteId);
    const semId = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoAtendente),
      {},
    );
    expect(semId.status).toBe(400);

    const escopoErrado = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaContato },
    );
    expect(escopoErrado.status).toBe(400);
    expect((escopoErrado.corpo['erro'] as { codigo: string }).codigo).toBe('etiqueta_de_outro_escopo');

    const inexistente = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: randomUUID() },
    );
    expect(inexistente.status).toBe(404);
  });

  it('sem `conversa.etiquetar` é 403; conversa de outro atendente é 403; encerrada é 409', async () => {
    const { conversaId } = await criarConversa(atendenteId);
    const semPoder = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoSemPoder),
      { etiqueta_id: etiquetaConversa },
    );
    expect(semPoder.status).toBe(403);
    expect((semPoder.corpo['erro'] as { codigo: string }).codigo).toBe('sem_permissao');

    const deOutro = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comCookie(sessaoColega),
      { etiqueta_id: etiquetaConversa },
    );
    expect(deOutro.status).toBe(403);
    expect((deOutro.corpo['erro'] as { codigo: string }).codigo).toBe('conversa_de_outro_atendente');

    const { conversaId: encerrada } = await criarConversa(atendenteId, 'encerrada');
    const fechada = await chamar(
      'POST',
      `/v1/conversas/${encerrada}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaConversa },
    );
    expect(fechada.status).toBe(409);
    expect(await etiquetasDaConversa(conversaId)).toEqual([]);
  });

  it('por chave de API com `conversas:escrever`, sem exigir dono; sem o escopo, 403', async () => {
    const { conversaId } = await criarConversa(colegaId);
    const porChave = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comChave(a.token),
      { etiqueta_id: etiquetaConversa },
    );
    expect(porChave.status).toBe(201);
    expect(await etiquetasDaConversa(conversaId)).toEqual([etiquetaConversa]);

    const semEscopo = await chamar(
      'POST',
      `/v1/conversas/${conversaId}/etiquetas`,
      comChave(a.tokenSemEscopo),
      { etiqueta_id: etiquetaConversa },
    );
    expect(semEscopo.status).toBe(403);
  });
});

describe('GET/POST/DELETE /v1/contatos/:id/etiquetas — o contato', () => {
  it('aplica com `contato.editar`, lista, remove e audita', async () => {
    const contatoId = await criarContato();

    const aplicada = await chamar(
      'POST',
      `/v1/contatos/${contatoId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaContato },
    );
    expect(aplicada.status).toBe(201);
    expect(aplicada.corpo).toMatchObject({ etiqueta_id: etiquetaContato, aplicada: true });

    const lista = await chamar('GET', `/v1/contatos/${contatoId}/etiquetas`, comCookie(sessaoAtendente));
    expect(lista.status).toBe(200);
    expect((lista.corpo['etiquetas'] as { id: string }[]).map((e) => e.id)).toEqual([etiquetaContato]);

    const removida = await chamar(
      'DELETE',
      `/v1/contatos/${contatoId}/etiquetas/${etiquetaContato}`,
      comCookie(sessaoAtendente),
    );
    expect(removida.corpo).toEqual({ removida: true });

    const log = await auditoriaDe('contato_etiqueta', contatoId);
    expect(log.map((l) => l.acao)).toEqual(['criou', 'excluiu']);
  });

  it('a etiqueta do contato viaja no painel da conversa (`etiquetasDoContato`)', async () => {
    const { conversaId, contatoId } = await criarConversa(atendenteId);
    await chamar('POST', `/v1/contatos/${contatoId}/etiquetas`, comCookie(sessaoAtendente), {
      etiqueta_id: etiquetaAmbos,
    });
    const tela = await chamar('GET', `/v1/desk/conversas/${conversaId}`, comCookie(sessaoAtendente));
    const aberta = tela.corpo['aberta'] as {
      etiquetasDaConversa: { id: string }[];
      etiquetasDoContato: { id: string }[];
    };
    expect(aberta.etiquetasDoContato.map((e) => e.id)).toEqual([etiquetaAmbos]);
    // Não vaza para a conversa: são escopos diferentes.
    expect(aberta.etiquetasDaConversa).toEqual([]);
  });

  it('sem `contato.editar` é 403 (o colega só tem `conversa.etiquetar`); escopo errado é 400', async () => {
    const contatoId = await criarContato();
    const semPoder = await chamar(
      'POST',
      `/v1/contatos/${contatoId}/etiquetas`,
      comCookie(sessaoColega),
      { etiqueta_id: etiquetaContato },
    );
    expect(semPoder.status).toBe(403);

    const escopoErrado = await chamar(
      'POST',
      `/v1/contatos/${contatoId}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaConversa },
    );
    expect(escopoErrado.status).toBe(400);
    expect((escopoErrado.corpo['erro'] as { codigo: string }).codigo).toBe('etiqueta_de_outro_escopo');

    const inexistente = await chamar(
      'POST',
      `/v1/contatos/${randomUUID()}/etiquetas`,
      comCookie(sessaoAtendente),
      { etiqueta_id: etiquetaContato },
    );
    expect(inexistente.status).toBe(404);
  });

  it('por chave: `contatos:escrever` aplica, `contatos:ler` lista, chave sem escopo não', async () => {
    const contatoId = await criarContato();
    const aplicada = await chamar('POST', `/v1/contatos/${contatoId}/etiquetas`, comChave(a.token), {
      etiqueta_id: etiquetaAmbos,
    });
    expect(aplicada.status).toBe(201);
    const lista = await chamar('GET', `/v1/contatos/${contatoId}/etiquetas`, comChave(a.token));
    expect((lista.corpo['etiquetas'] as { id: string }[]).map((e) => e.id)).toEqual([etiquetaAmbos]);

    const semEscopo = await chamar('GET', `/v1/contatos/${contatoId}/etiquetas`, comChave(a.tokenSemEscopo));
    expect(semEscopo.status).toBe(403);
  });
});
