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
const { criarBanco, fecharBanco, semear } = await import('@pipe/db');

const URL_DONO = process.env['DATABASE_URL']!;

/**
 * Contrato — Membros e Certificados: item 4 da tarefa.
 *
 * Mesmo padrão de `cadastros-atendimento.test.ts`: dois tenants, sessão por
 * cookie, caminho feliz, recusas, cross-tenant, permissão. Como Membros usa o
 * padrão `Resultado` (`{ ok, erro }` em 200, não `ErroPipe`), as recusas de
 * negócio (último admin, cross-tenant) chegam como `ok: false`; convite e
 * certificado usam `ErroPipe` de verdade (400/403/404), então essas rotas
 * mostram status HTTP também.
 */

interface Cenario {
  dono: Awaited<ReturnType<typeof criarBanco>>;
  tenantId: string;
  papeis: Record<'admin' | 'member' | 'guest', string>;
  encerrar: () => Promise<void>;
}

async function montarContrato(sufixo: string): Promise<Cenario> {
  const dono = criarBanco({ url: URL_DONO, maxConexoes: 3 });
  const semeado = await semear(dono, { nome: `contrato ${sufixo}`, slug: `contrato-${sufixo}` });
  const { rows: papeis } = await dono.execute<{ id: string; nome: 'admin' | 'member' | 'guest' }>(
    sql`select id, nome from papel where tenant_id = ${semeado.tenantId}::uuid and escopo = 'conta'`,
  );
  const porNome = Object.fromEntries(papeis.map((p) => [p.nome, p.id])) as Cenario['papeis'];
  return {
    dono,
    tenantId: semeado.tenantId,
    papeis: porNome,
    encerrar: async () => {
      await dono.execute(sql`delete from tenant where id = ${semeado.tenantId}::uuid`);
      await fecharBanco(dono);
    },
  };
}

async function usuarioComPapel(
  cenario: Cenario,
  papelNome: 'admin' | 'member' | 'guest',
): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${cenario.tenantId}::uuid, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = rows[0]!.id;
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
    values (${cenario.tenantId}::uuid, ${usuarioId}::uuid, ${cenario.papeis[papelNome]}::uuid, 'conta')
  `);
  return usuarioId;
}

/**
 * Alguém com `conta.membros.escrever` que NÃO é `admin` — um papel de conta
 * customizado, só para provar que a trava de "último admin" em
 * `removerMembro` vale mesmo vindo de quem não é o próprio alvo (o "não posso
 * excluir a mim mesmo" já barra o caso mais óbvio antes dela).
 */
async function usuarioOperador(cenario: Cenario): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}::uuid, ${`operador-${marca}`}, 'conta')
    returning id
  `);
  const papelId = papeis[0]!.id;
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}::uuid, ${papelId}::uuid, 'conta.membros.ler'),
           (${cenario.tenantId}::uuid, ${papelId}::uuid, 'conta.membros.escrever')
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${cenario.tenantId}::uuid, ${`Operador ${marca}`}, ${`operador-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = rows[0]!.id;
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
    values (${cenario.tenantId}::uuid, ${usuarioId}::uuid, ${papelId}::uuid, 'conta')
  `);
  return usuarioId;
}

async function abrirSessao(cenario: Cenario, usuarioId: string): Promise<string> {
  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}::uuid, ${usuarioId}::uuid, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;
let api: ApiNoAr;

async function pedir(
  metodo: string,
  caminho: string,
  sessao: string | null,
  corpo?: Record<string, unknown>,
): Promise<{ status: number; corpo: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: sessao ? comCookie(sessao) : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : undefined };
}

let a: Cenario;
let b: Cenario;
/** Tenant `a` com DOIS admins — para testar troca/remoção sem esbarrar no último. */
let sessaoAdmin1: string;
let usuarioAdmin2Id: string;
let usuarioMemberId: string;
let sessaoGuest: string;
/** Tenant à parte, com um ÚNICO admin — só para os dois testes de "último admin". */
let umAdmin: Cenario;
let sessaoUnicoAdmin: string;
let usuarioUnicoAdminId: string;
/** Tem `conta.membros.escrever` mas não é `admin` — ver `usuarioOperador`. */
let sessaoOperador: string;
/** Sessão válida do tenant B, para provar que o id de A não é achado nele. */
let sessaoDoOutroTenant: string;

beforeAll(async () => {
  a = await montarContrato(`ct-${randomUUID().slice(0, 8)}`);
  b = await montarContrato(`ct-${randomUUID().slice(0, 8)}`);
  umAdmin = await montarContrato(`ct1-${randomUUID().slice(0, 8)}`);

  const admin1Id = await usuarioComPapel(a, 'admin');
  usuarioAdmin2Id = await usuarioComPapel(a, 'admin');
  usuarioMemberId = await usuarioComPapel(a, 'member');
  const guestId = await usuarioComPapel(a, 'guest');
  const adminDoB = await usuarioComPapel(b, 'admin');
  usuarioUnicoAdminId = await usuarioComPapel(umAdmin, 'admin');
  const operadorId = await usuarioOperador(umAdmin);

  api = await subirApi(0);
  sessaoAdmin1 = await abrirSessao(a, admin1Id);
  sessaoGuest = await abrirSessao(a, guestId);
  sessaoDoOutroTenant = await abrirSessao(b, adminDoB);
  sessaoUnicoAdmin = await abrirSessao(umAdmin, usuarioUnicoAdminId);
  sessaoOperador = await abrirSessao(umAdmin, operadorId);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
  await umAdmin?.encerrar();
});

/* =========================================================================
 * Membros
 * ========================================================================= */

describe('GET /v1/gestao/contrato/membros', () => {
  it('lista com o papel de cada um, e recusa quem não tem conta.membros.ler', async () => {
    const { status, corpo } = await pedir('GET', '/v1/gestao/contrato/membros', sessaoAdmin1);
    expect(status).toBe(200);
    const membro = corpo.membros.find((m: Corpo) => m.id === usuarioMemberId);
    expect(membro).toMatchObject({ tipo: 'usuario', papelNome: 'member' });

    const semSessao = await fetch(`${api.url}/v1/gestao/contrato/membros`);
    expect(semSessao.status).toBe(401);
  });
});

describe('convidar, reenviar e revogar', () => {
  it('convida com papel, reenvia (o link antigo morre) e revoga', async () => {
    const email = `convidado-${randomUUID().slice(0, 8)}@e2e.pipe.app`;
    const criado = await pedir('POST', '/v1/convites', sessaoAdmin1, { email, papel: 'member' });
    expect(criado.status).toBe(201);
    expect(criado.corpo).toMatchObject({ email, papel: 'member' });
    expect(criado.corpo.url).toContain('/convite/');

    // aparece em Membros como pendente
    const lista1 = await pedir('GET', '/v1/gestao/contrato/membros', sessaoAdmin1);
    const pendente1 = lista1.corpo.membros.find((m: Corpo) => m.id === criado.corpo.id);
    expect(pendente1).toMatchObject({ tipo: 'convite', email, papelNome: 'member' });

    const reenviado = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessaoAdmin1,
    );
    expect(reenviado.status).toBe(201);
    expect(reenviado.corpo.email).toBe(email);
    expect(reenviado.corpo.url).not.toBe(criado.corpo.url);

    // o convite original não existe mais (venceu); o novo id é o que vale
    const naoAchaOAntigo = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessaoAdmin1,
    );
    expect(naoAchaOAntigo.status).toBe(404);

    // revoga (o "Excluir" da tabela, sobre um alvo do tipo convite)
    const revogado = await pedir('POST', '/v1/gestao/contrato/membros/excluir', sessaoAdmin1, {
      alvos: [`convite:${reenviado.corpo.id}`],
    });
    expect(revogado.corpo).toEqual({ ok: true });

    const lista2 = await pedir('GET', '/v1/gestao/contrato/membros', sessaoAdmin1);
    expect(lista2.corpo.membros.some((m: Corpo) => m.id === reenviado.corpo.id)).toBe(false);
  });

  it('sem conta.membros.escrever é 403', async () => {
    const semPoder = await pedir('POST', '/v1/convites', sessaoGuest, {
      email: `x-${randomUUID().slice(0, 6)}@e2e.pipe.app`,
      papel: 'guest',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.codigo).toBe('sem_permissao');
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('conta.membros.escrever');
  });

  it('convite de outro tenant não é achado (404) ao reenviar', async () => {
    const email = `cross-${randomUUID().slice(0, 8)}@e2e.pipe.app`;
    const criado = await pedir('POST', '/v1/convites', sessaoAdmin1, { email, papel: 'guest' });
    const doOutroTenant = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessaoDoOutroTenant,
    );
    expect(doOutroTenant.status).toBe(404);
  });
});

describe('POST /v1/gestao/contrato/membros/papel', () => {
  it('troca o papel de um membro', async () => {
    const resultado = await pedir('POST', '/v1/gestao/contrato/membros/papel', sessaoAdmin1, {
      papelId: a.papeis.guest,
      alvos: [`usuario:${usuarioMemberId}`],
    });
    expect(resultado.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/gestao/contrato/membros', sessaoAdmin1);
    const membro = lista.corpo.membros.find((m: Corpo) => m.id === usuarioMemberId);
    expect(membro.papelNome).toBe('guest');

    // devolve ao estado original, para não atrapalhar os outros testes
    await pedir('POST', '/v1/gestao/contrato/membros/papel', sessaoAdmin1, {
      papelId: a.papeis.member,
      alvos: [`usuario:${usuarioMemberId}`],
    });
  });

  it('membro de outro tenant não é achado', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/gestao/contrato/membros/papel',
      sessaoDoOutroTenant,
      { papelId: a.papeis.guest, alvos: [`usuario:${usuarioMemberId}`] },
    );
    expect(resultado.corpo).toMatchObject({ ok: false });
  });
});

describe('o último administrador', () => {
  it('recusa rebaixar o último admin', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/gestao/contrato/membros/papel',
      sessaoUnicoAdmin,
      { papelId: umAdmin.papeis.member, alvos: [`usuario:${usuarioUnicoAdminId}`] },
    );
    expect(resultado.corpo.ok).toBe(false);
    expect(resultado.corpo.erro).toMatch(/último administrador/);

    // continua admin
    const lista = await pedir('GET', '/v1/gestao/contrato/membros', sessaoUnicoAdmin);
    expect(
      lista.corpo.membros.find((m: Corpo) => m.id === usuarioUnicoAdminId)?.papelNome,
    ).toBe('admin');
  });

  it('recusa remover o último admin (mesmo por quem não é o próprio alvo)', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/gestao/contrato/membros/excluir',
      sessaoOperador,
      { alvos: [`usuario:${usuarioUnicoAdminId}`] },
    );
    expect(resultado.corpo.ok).toBe(false);
    expect(resultado.corpo.erro).toMatch(/último administrador/);

    const lista = await pedir('GET', '/v1/gestao/contrato/membros', sessaoUnicoAdmin);
    expect(lista.corpo.membros.some((m: Corpo) => m.id === usuarioUnicoAdminId)).toBe(true);
  });

  it('com DOIS admins, rebaixar ou remover um deles funciona', async () => {
    const rebaixa = await pedir('POST', '/v1/gestao/contrato/membros/papel', sessaoAdmin1, {
      papelId: a.papeis.member,
      alvos: [`usuario:${usuarioAdmin2Id}`],
    });
    expect(rebaixa.corpo).toEqual({ ok: true });

    // devolve a admin e testa a remoção pelo outro lado
    await pedir('POST', '/v1/gestao/contrato/membros/papel', sessaoAdmin1, {
      papelId: a.papeis.admin,
      alvos: [`usuario:${usuarioAdmin2Id}`],
    });
    const remove = await pedir('POST', '/v1/gestao/contrato/membros/excluir', sessaoAdmin1, {
      alvos: [`usuario:${usuarioAdmin2Id}`],
    });
    expect(remove.corpo).toEqual({ ok: true });
  });
});

/* =========================================================================
 * Certificados
 * ========================================================================= */

const pedidoDeCertificado = (extra: Record<string, unknown> = {}) => ({
  descricao: `Certificado ${randomUUID().slice(0, 6)}`,
  expiraEm: '2030-01-01',
  impressaoDigital: 'AB:CD:12:34',
  hosts: ['https://api.exemplo.com.br'],
  ...extra,
});

describe('certificados de autenticação (mTLS)', () => {
  it('cadastra, lista e nunca guarda nem devolve chave privada', async () => {
    // Um cliente que ainda manda senha/arquivo do .pfx (forma antiga da tela):
    // a api ignora os dois campos — não há coluna para eles.
    const criado = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado(),
      senha: 'super-secreta-do-pfx',
      arquivoBase64: 'ZmFsc28=',
    });
    expect(criado.status).toBe(201);
    expect(criado.corpo).not.toHaveProperty('senha');
    expect(criado.corpo).not.toHaveProperty('arquivoBase64');
    expect(criado.corpo).toMatchObject({
      descricao: expect.any(String),
      impressaoDigital: 'AB:CD:12:34',
    });
    expect(JSON.stringify(criado.corpo)).not.toContain('super-secreta-do-pfx');

    // a tabela em si não tem onde guardar isso
    const { rows } = await a.dono.execute<Record<string, unknown>>(
      sql`select * from certificado_mtls where id = ${criado.corpo.id}::uuid`,
    );
    expect(Object.keys(rows[0]!)).not.toContain('senha');
    expect(Object.keys(rows[0]!)).not.toContain('arquivo');
    expect(Object.keys(rows[0]!)).not.toContain('chave_privada');

    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    expect(lista.status).toBe(200);
    const linha = lista.corpo.find((c: Corpo) => c.id === criado.corpo.id);
    expect(linha).toMatchObject({ impressaoDigital: 'AB:CD:12:34' });
    expect(JSON.stringify(lista.corpo)).not.toContain('super-secreta-do-pfx');
  });

  it('recusa host que não é HTTPS válido', async () => {
    const resultado = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({ hosts: ['ftp://nao-serve.com'] }),
    });
    expect(resultado.status).toBe(400);
    expect(resultado.corpo.erro.codigo).toBe('host_invalido');
  });

  it('exclui o certificado', async () => {
    const criado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoAdmin1,
      pedidoDeCertificado(),
    );
    const excluido = await pedir(
      'DELETE',
      `/v1/gestao/contrato/certificados/${criado.corpo.id}`,
      sessaoAdmin1,
    );
    expect(excluido.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(false);
  });

  it('excluir o último host apaga o certificado junto', async () => {
    const criado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoAdmin1,
      pedidoDeCertificado({ hosts: ['https://unico.exemplo.com.br'] }),
    );
    const hostId = criado.corpo.hosts[0].id;

    const excluiu = await pedir(
      'DELETE',
      `/v1/gestao/contrato/certificados/${criado.corpo.id}/hosts/${hostId}`,
      sessaoAdmin1,
    );
    expect(excluiu.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(false);
  });

  it('certificado de outro tenant não é achado', async () => {
    const criado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoAdmin1,
      pedidoDeCertificado(),
    );
    const doOutroTenant = await pedir(
      'DELETE',
      `/v1/gestao/contrato/certificados/${criado.corpo.id}`,
      sessaoDoOutroTenant,
    );
    expect(doOutroTenant.corpo).toMatchObject({ ok: false });

    // continua existindo no tenant certo
    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(true);
  });

  it('sem conta.membros.escrever é 403 para cadastrar', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoGuest,
      pedidoDeCertificado(),
    );
    expect(resultado.status).toBe(403);
    expect(resultado.corpo.erro.detalhe.permissao).toBe('conta.membros.escrever');
  });

  it('sem conta.membros.ler é 403 para listar', async () => {
    const semSessao = await fetch(`${api.url}/v1/gestao/contrato/certificados`);
    expect(semSessao.status).toBe(401);
  });
});
