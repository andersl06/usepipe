import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 5).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { encontrarPalavrasProibidas, normalizarTermo } = await import(
  '../src/dominio/gestao/palavras-proibidas.js'
);
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Palavras proibidas — o cadastro (`/v1/gestao/configuracoes/palavras-proibidas`)
 * e a recusa no envio (`POST /v1/conversas/:id/mensagens`).
 *
 * Mesmo padrão de `cadastros-atendimento.test.ts`: dois tenants, sessão por
 * cookie, caminho feliz, recusas, cross-tenant, permissão. A parte do envio segue
 * `envio-sessao.test.ts`: o atendente do cenário responde numa conversa que é dele,
 * e o que se prova é que a mensagem com termo da lista NÃO chega ao outbox.
 *
 * A régua de comparação é a de `blip-desk-regras-tecnicas.md` §3.4: frase é
 * substring do texto, palavra solta é substring do token, tudo sem acento e sem
 * caixa (a intenção da origem, não o bug dela).
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Tem `tenant.configurar` — a permissão de Configurações gerais, reaproveitada. */
let sessaoGestor: string;
/** Gente do tenant A sem permissão nenhuma. */
let sessaoSemPoder: string;
/** Sessão válida, mas de outro tenant — prova que o tenant vem da sessão, nunca da URL. */
let sessaoDoOutroTenant: string;
/** O atendente do cenário A, que é quem responde. */
let sessaoAtendenteA: string;
let sessaoAtendenteB: string;
let contatoA: string;
let contatoB: string;

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

async function criarContato(cenario: Cenario): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente do Teste', '+5511955554444')
    returning id
  `);
  return rows[0]!.id;
}

/** Uma conversa aberta, com janela de 24h em aberto, atribuída ao atendente do cenário. */
async function novaConversa(cenario: Cenario, contatoId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.filaId},
      ${cenario.atendenteId}, 'atribuida', now() + interval '20 hours', now(), 'contato'
    )
    returning id
  `);
  return rows[0]!.id;
}

async function contarMensagens(cenario: Cenario, conversaId: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n from mensagem where conversa_id = ${conversaId}::uuid
  `);
  return rows[0]?.n ?? 0;
}

const CAMINHO = '/v1/gestao/configuracoes/palavras-proibidas';

async function criarPalavra(sessao: string, corpo: Record<string, unknown> = {}) {
  return pedir('POST', CAMINHO, sessao, { termo: `termo-${randomUUID().slice(0, 8)}`, ...corpo });
}

beforeAll(async () => {
  a = await montarCenario(`pp-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`pp-${randomUUID().slice(0, 8)}`);

  const gestor = await pessoaCom(a, ['tenant.configurar']);
  const semPoder = await pessoaCom(a, []);
  const gestorDoB = await pessoaCom(b, ['tenant.configurar']);

  api = await subirApi(0);
  sessaoGestor = await abrirSessao(a, gestor);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, gestorDoB);
  sessaoAtendenteA = await abrirSessao(a, a.atendenteId);
  sessaoAtendenteB = await abrirSessao(b, b.atendenteId);
  contatoA = await criarContato(a);
  contatoB = await criarContato(b);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

async function auditoriaDe(id: string) {
  const { rows } = await a.dono.execute<{
    acao: string;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
  }>(sql`
    select acao, antes, depois from log_auditoria
     where objeto_tipo = 'palavra_proibida' and objeto_id = ${id}::uuid
     order by em asc, id asc
  `);
  return rows;
}

/* =========================================================================
 * A régua de comparação, sem banco
 * ========================================================================= */

describe('encontrarPalavrasProibidas — a régua de §3.4', () => {
  it('normaliza sem acento e sem caixa, colapsando espaços', () => {
    expect(normalizarTermo('  Açúcar   Mascavo ')).toBe('acucar mascavo');
  });

  it('palavra solta é substring do token; frase é substring do texto', () => {
    expect(encontrarPalavrasProibidas('Você é um IDIÓTA mesmo', ['idiota'])).toEqual(['idiota']);
    // `exactMatch = false` (default da origem): o termo barra o token que o contém.
    expect(encontrarPalavrasProibidas('seus idiotas!', ['idiota'])).toEqual(['idiota']);
    // A frase bate mesmo com caixa e espaços diferentes.
    expect(encontrarPalavrasProibidas('Mandei um  Boleto  FALSO ontem', ['boleto falso'])).toEqual([
      'boleto falso',
    ]);
    expect(encontrarPalavrasProibidas('Olá, tudo bem?', ['idiota', 'boleto falso'])).toEqual([]);
  });

  it('se uma frase bate, devolve só as frases — a 2ª passada nem roda', () => {
    expect(
      encontrarPalavrasProibidas('boleto falso, seu idiota', ['idiota', 'boleto falso']),
    ).toEqual(['boleto falso']);
  });

  it('separa pelos mesmos caracteres da origem: pontuação corta, hífen não', () => {
    expect(encontrarPalavrasProibidas('idiota!', ['idiota'])).toEqual(['idiota']);
    expect(encontrarPalavrasProibidas('bem-vindo', ['vindo'])).toEqual(['vindo']);
    expect(encontrarPalavrasProibidas('ok', ['idiota'])).toEqual([]);
  });
});

/* =========================================================================
 * CRUD
 * ========================================================================= */

describe(`POST ${CAMINHO}`, () => {
  it('cria (201), registra no log e aparece na lista', async () => {
    const termo = `Golpe ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await criarPalavra(sessaoGestor, { termo });
    expect(status).toBe(201);
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);

    const log = await auditoriaDe(corpo.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ acao: 'criou', depois: { termo, ativo: true } });

    const lista = await pedir('GET', CAMINHO, sessaoGestor);
    expect(lista.status).toBe(200);
    expect((lista.corpo as { id: string; termo: string }[]).some((p) => p.id === corpo.id)).toBe(true);
  });

  it('recusa termo vazio (400) e termo repetido sem acento e sem caixa (409)', async () => {
    const vazio = await criarPalavra(sessaoGestor, { termo: '   ' });
    expect(vazio.status).toBe(400);
    expect(vazio.corpo.erro.codigo).toBe('termo_obrigatorio');

    const marca = randomUUID().slice(0, 6);
    expect((await criarPalavra(sessaoGestor, { termo: `Açúcar ${marca}` })).status).toBe(201);
    const repetido = await criarPalavra(sessaoGestor, { termo: `ACUCAR ${marca}` });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('termo_em_uso');
  });

  it('sem tenant.configurar é 403; sem sessão é 401', async () => {
    const semPoder = await criarPalavra(sessaoSemPoder);
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.codigo).toBe('sem_permissao');
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('tenant.configurar');

    const semSessao = await fetch(`${api.url}${CAMINHO}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ termo: 'qualquer' }),
    });
    expect(semSessao.status).toBe(401);
  });

  it('a lista de um tenant não aparece para o outro', async () => {
    const { corpo: criada } = await criarPalavra(sessaoGestor);
    const doOutro = await pedir('GET', CAMINHO, sessaoDoOutroTenant);
    expect(doOutro.status).toBe(200);
    expect((doOutro.corpo as { id: string }[]).some((p) => p.id === criada.id)).toBe(false);
  });
});

describe(`PATCH ${CAMINHO}/:id`, () => {
  it('edita o termo e desativa, registrando só o que mudou', async () => {
    const { corpo: criada } = await criarPalavra(sessaoGestor);
    const novoTermo = `Fraude ${randomUUID().slice(0, 6)}`;
    const { status, corpo } = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessaoGestor, {
      termo: novoTermo,
      ativo: false,
    });
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ id: criada.id, termo: novoTermo, ativo: false });

    const log = await auditoriaDe(criada.id);
    expect(log.at(-1)).toMatchObject({ acao: 'alterou', depois: { termo: novoTermo, ativo: false } });
  });

  it('nada mudado não grava nem registra', async () => {
    const { corpo: criada } = await criarPalavra(sessaoGestor);
    const antes = await auditoriaDe(criada.id);
    const vazio = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessaoGestor, {});
    expect(vazio.status).toBe(200);
    expect(await auditoriaDe(criada.id)).toHaveLength(antes.length);
  });

  it('renomear para um termo que já existe é 409', async () => {
    const { corpo: primeira } = await criarPalavra(sessaoGestor);
    const { corpo: segunda } = await criarPalavra(sessaoGestor);
    const lista = await pedir('GET', CAMINHO, sessaoGestor);
    const termoDaPrimeira = (lista.corpo as { id: string; termo: string }[]).find(
      (p) => p.id === primeira.id,
    )!.termo;
    const repetido = await pedir('PATCH', `${CAMINHO}/${segunda.id}`, sessaoGestor, {
      termo: termoDaPrimeira.toUpperCase(),
    });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('termo_em_uso');
  });

  it('sem tenant.configurar é 403; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await criarPalavra(sessaoGestor);

    const semPoder = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessaoSemPoder, { ativo: false });
    expect(semPoder.status).toBe(403);

    const outroTenant = await pedir('PATCH', `${CAMINHO}/${criada.id}`, sessaoDoOutroTenant, {
      ativo: false,
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await pedir('PATCH', `${CAMINHO}/nao-e-uuid`, sessaoGestor, { ativo: false });
    expect(malformado.status).toBe(404);
  });
});

describe(`DELETE ${CAMINHO}/:id`, () => {
  it('exclui de verdade (204) e registra no log; de outro tenant é 404; id malformado é 404', async () => {
    const { corpo: criada } = await criarPalavra(sessaoGestor);

    const outroTenant = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoDoOutroTenant),
    });
    expect(outroTenant.status).toBe(404);

    const malformado = await fetch(`${api.url}${CAMINHO}/nao-e-uuid`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(malformado.status).toBe(404);

    const semPoder = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoSemPoder),
    });
    expect(semPoder.status).toBe(403);

    const excluida = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(excluida.status).toBe(204);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from palavra_proibida where id = ${criada.id}::uuid`,
    );
    expect(rows[0]?.n).toBe('0');
    expect((await auditoriaDe(criada.id)).at(-1)).toMatchObject({ acao: 'excluiu' });

    const outraVez = await fetch(`${api.url}${CAMINHO}/${criada.id}`, {
      method: 'DELETE',
      headers: comCookie(sessaoGestor),
    });
    expect(outraVez.status).toBe(404);
  });
});

/* =========================================================================
 * A recusa no envio
 * ========================================================================= */

describe('POST /v1/conversas/:id/mensagens — a lista barra o envio do atendente', () => {
  it('recusa (400) com a palavra encontrada, e nada é gravado; sem acento e sem caixa; palavra desativada não barra; outro tenant não é afetado', async () => {
    const marca = randomUUID().slice(0, 6);
    const palavra = `idiota${marca}`;
    const frase = `boleto falso ${marca}`;
    const { corpo: criadaPalavra } = await criarPalavra(sessaoGestor, { termo: palavra });
    expect((await criarPalavra(sessaoGestor, { termo: frase })).status).toBe(201);

    // Palavra solta, com acento e caixa diferentes, e num token que a CONTÉM.
    const conversaA = await novaConversa(a, contatoA);
    const recusada = await pedir('POST', `/v1/conversas/${conversaA}/mensagens`, sessaoAtendenteA, {
      texto: `Vocês são uns IDIÓTA${marca}s!`,
    });
    expect(recusada.status).toBe(400);
    expect(recusada.corpo.erro.codigo).toBe('palavra_proibida');
    expect(recusada.corpo.erro.mensagem).toContain(`"${palavra}"`);
    expect(recusada.corpo.erro.detalhe.palavras).toEqual([palavra]);
    // Não gravou mensagem nem outbox: a recusa é ANTES de gravar.
    expect(await contarMensagens(a, conversaA)).toBe(0);

    // Frase: substring do texto inteiro, com espaços a mais e caixa diferente.
    const recusadaFrase = await pedir('POST', `/v1/conversas/${conversaA}/mensagens`, sessaoAtendenteA, {
      texto: `Mandei o Boleto   FALSO ${marca} ontem`,
    });
    expect(recusadaFrase.status).toBe(400);
    expect(recusadaFrase.corpo.erro.detalhe.palavras).toEqual([frase]);

    // Texto limpo passa.
    const limpa = await pedir('POST', `/v1/conversas/${conversaA}/mensagens`, sessaoAtendenteA, {
      texto: 'Olá, tudo bem? Segue o boleto.',
    });
    expect(limpa.status).toBe(201);
    expect(await contarMensagens(a, conversaA)).toBe(1);

    // Desativada, a palavra deixa de barrar — e o cache foi invalidado pelo PATCH.
    const desativada = await pedir('PATCH', `${CAMINHO}/${criadaPalavra.id}`, sessaoGestor, {
      ativo: false,
    });
    expect(desativada.status).toBe(200);
    const liberada = await pedir('POST', `/v1/conversas/${conversaA}/mensagens`, sessaoAtendenteA, {
      texto: `Vocês são uns ${palavra}s!`,
    });
    expect(liberada.status).toBe(201);

    // Reativada, volta a barrar.
    await pedir('PATCH', `${CAMINHO}/${criadaPalavra.id}`, sessaoGestor, { ativo: true });
    const deNovo = await pedir('POST', `/v1/conversas/${conversaA}/mensagens`, sessaoAtendenteA, {
      texto: `${palavra}`,
    });
    expect(deNovo.status).toBe(400);

    // A lista é do tenant A: o atendente do B manda a mesma palavra sem ser barrado.
    const conversaB = await novaConversa(b, contatoB);
    const doB = await pedir('POST', `/v1/conversas/${conversaB}/mensagens`, sessaoAtendenteB, {
      texto: `${palavra} e ${frase}`,
    });
    expect(doB.status).toBe(201);
    expect(await contarMensagens(b, conversaB)).toBe(1);
  });

  it('a legenda do anexo passa pelo mesmo filtro; mensagem do sistema (chave de API, sem atendente) não', async () => {
    const marca = randomUUID().slice(0, 6);
    const palavra = `golpe${marca}`;
    expect((await criarPalavra(sessaoGestor, { termo: palavra })).status).toBe(201);

    const conversaA = await novaConversa(a, contatoA);
    // Chave de API sem `atendente_id`: é mensagem do sistema — o filtro da origem
    // é do Desk, e o bot/integração não passa por ele.
    const doSistema = await fetch(`${api.url}/v1/conversas/${conversaA}/mensagens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ texto: `isso é ${palavra}` }),
    });
    expect(doSistema.status).toBe(201);

    // A mesma chave assinando por um atendente cai no filtro.
    const porAtendente = await fetch(`${api.url}/v1/conversas/${conversaA}/mensagens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ texto: `isso é ${palavra}`, atendente_id: a.atendenteId }),
    });
    expect(porAtendente.status).toBe(400);
    expect(((await porAtendente.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'palavra_proibida',
    );
  });
});
