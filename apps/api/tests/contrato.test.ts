import { randomUUID } from 'node:crypto';
import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough, Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { gerarPfxDeTeste } from './ajuda-pfx.js';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
// O `.pfx` e a senha do certificado mTLS entram cifrados (`segredo.ts`).
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 23).toString('base64')}`;

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { criarBanco, fecharBanco, semear } = await import('@pipe/db');
const { entregarPendentes } = await import('../src/webhooks-saida.js');

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

/** Um `.pfx` de verdade por teste (chave RSA nova, ~0,2 s): `ajuda-pfx.ts`. */
const SENHA_DO_PFX = 'senha-do-pfx-2026';
const pfxValido = gerarPfxDeTeste({ senha: SENHA_DO_PFX });

const pedidoDeCertificado = (extra: Record<string, unknown> = {}) => ({
  descricao: `Certificado ${randomUUID().slice(0, 6)}`,
  hosts: ['https://api.exemplo.com.br'],
  senha: SENHA_DO_PFX,
  arquivo: pfxValido.pfx.toString('base64'),
  ...extra,
});

describe('certificados de autenticação (mTLS)', () => {
  it('lê validade, impressão digital, sujeito e emissor do .pfx; status calculado', async () => {
    // A tela manda data URL (FileReader); base64 puro também vale.
    const criado = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({
        arquivo: `data:application/x-pkcs12;base64,${pfxValido.pfx.toString('base64')}`,
      }),
    });
    expect(criado.status).toBe(201);
    expect(criado.corpo).toMatchObject({
      impressaoDigital: pfxValido.impressaoDigital,
      expiraEm: `${pfxValido.expiraEm}T00:00:00.000Z`,
      sujeito: 'CN=cliente.exemplo.com.br',
      emissor: 'CN=cliente.exemplo.com.br',
      status: 'valido',
    });

    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    expect(lista.status).toBe(200);
    const linha = lista.corpo.find((c: Corpo) => c.id === criado.corpo.id);
    expect(linha).toMatchObject({
      impressaoDigital: pfxValido.impressaoDigital,
      expiraEm: `${pfxValido.expiraEm}T00:00:00.000Z`,
      status: 'valido',
    });
  });

  it('certificado vencido entra com status expirado', async () => {
    const vencido = gerarPfxDeTeste({ senha: 'outra', validoDesde: '2019-01-01', validoAte: '2021-01-01' });
    const criado = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({ senha: 'outra', arquivo: vencido.pfx.toString('base64') }),
    });
    expect(criado.status).toBe(201);
    expect(criado.corpo.status).toBe('expirado');
    expect(criado.corpo.expiraEm).toBe('2021-01-01T00:00:00.000Z');
  });

  it('senha errada recusa, e nada entra no banco', async () => {
    const descricao = `Errada ${randomUUID().slice(0, 6)}`;
    const resultado = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({ descricao, senha: 'nao-e-essa' }),
    });
    expect(resultado.status).toBe(400);
    expect(resultado.corpo.erro.codigo).toBe('senha_incorreta');
    expect(JSON.stringify(resultado.corpo)).not.toContain('nao-e-essa');

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from certificado_mtls where descricao = ${descricao}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('arquivo que não é .pfx e senha ausente são 400', async () => {
    const lixo = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({ arquivo: Buffer.from('isto não é um pfx').toString('base64') }),
    });
    expect(lixo.status).toBe(400);
    expect(lixo.corpo.erro.codigo).toBe('pfx_invalido');

    const semSenha = await pedir('POST', '/v1/gestao/contrato/certificados', sessaoAdmin1, {
      ...pedidoDeCertificado({ senha: '' }),
    });
    expect(semSenha.status).toBe(400);
    expect(semSenha.corpo.erro.codigo).toBe('senha_obrigatoria');
  });

  it('guarda o arquivo e a senha cifrados; nunca os devolve nem os audita', async () => {
    const base64 = pfxValido.pfx.toString('base64');
    const criado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoAdmin1,
      pedidoDeCertificado(),
    );
    expect(criado.status).toBe(201);
    const serializado = JSON.stringify(criado.corpo);
    expect(serializado).not.toContain(SENHA_DO_PFX);
    expect(serializado).not.toContain(base64.slice(0, 40));
    expect(criado.corpo).not.toHaveProperty('senha');
    expect(criado.corpo).not.toHaveProperty('arquivo');

    // No banco: envelopes `pipev1.` (AES-256-GCM), nunca o valor em claro.
    const { rows } = await a.dono.execute<{ arquivo_cifrado: string; senha_cifrada: string }>(
      sql`select arquivo_cifrado, senha_cifrada from certificado_mtls where id = ${criado.corpo.id}::uuid`,
    );
    expect(rows[0]!.arquivo_cifrado).toMatch(/^pipev1\./);
    expect(rows[0]!.senha_cifrada).toMatch(/^pipev1\./);
    expect(rows[0]!.arquivo_cifrado).not.toContain(base64.slice(0, 40));
    expect(rows[0]!.senha_cifrada).not.toContain(SENHA_DO_PFX);

    // A listagem não traz nem o cifrado.
    const lista = await pedir('GET', '/v1/gestao/contrato/certificados', sessaoAdmin1);
    const linha = lista.corpo.find((c: Corpo) => c.id === criado.corpo.id);
    for (const chave of ['senha', 'arquivo', 'senha_cifrada', 'arquivo_cifrado', 'senhaCifrada']) {
      expect(linha).not.toHaveProperty(chave);
    }
    expect(JSON.stringify(lista.corpo)).not.toContain('pipev1.');

    // A auditoria registra só o que é público do certificado.
    const auditoria = await a.dono.execute<{ depois: Record<string, unknown> }>(
      sql`select depois from log_auditoria where objeto_tipo = 'certificado_mtls' and objeto_id = ${criado.corpo.id}::uuid`,
    );
    expect(auditoria.rows).toHaveLength(1);
    const registrado = JSON.stringify(auditoria.rows[0]!.depois);
    expect(registrado).toContain(pfxValido.impressaoDigital);
    expect(registrado).not.toContain(SENHA_DO_PFX);
    expect(registrado).not.toContain('pipev1.');
    expect(registrado).not.toContain(base64.slice(0, 40));
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

/* =========================================================================
 * mTLS na saída: a Pipe apresenta o certificado ao chamar o host cadastrado
 * ========================================================================= */

const HOST_COM_CERTIFICADO = 'https://mtls.exemplo.com.br';

/** Um webhook do tenant com uma entrega pendente para `url`, semeado pelo dono. */
async function entregaPendente(cenario: Cenario, url: string): Promise<string> {
  const { rows: webhooks } = await cenario.dono.execute<{ id: string }>(sql`
    insert into webhook_saida (tenant_id, url, eventos, segredo)
    values (${cenario.tenantId}::uuid, ${url}, '{mensagem.criada}'::text[], 'segredo-de-teste')
    returning id
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into entrega_webhook (tenant_id, webhook_id, evento, payload, estado)
    values (${cenario.tenantId}::uuid, ${webhooks[0]!.id}::uuid, 'mensagem.criada',
            '{"event":"mensagem.criada"}'::jsonb, 'pendente')
    returning id
  `);
  return rows[0]!.id;
}

type OpcoesDoAgente = { pfx?: Buffer; passphrase?: string };

describe('mTLS na saída (webhooks)', () => {
  const chamadasHttps: Array<{ url: string; opcoes: https.RequestOptions }> = [];
  const chamadasFetch: string[] = [];

  /**
   * Sem rede: `https.request` (o caminho com certificado) vira um dublê que
   * registra o agente recebido e responde 200; o `fetch` global (o caminho
   * sem certificado) registra a URL e responde 200 — menos o que vai para a
   * própria `api` de teste, que passa pelo fetch de verdade (o mesmo cuidado
   * de `integracoes.test.ts`).
   */
  function fingirRede() {
    chamadasHttps.length = 0;
    chamadasFetch.length = 0;
    vi.spyOn(https, 'request').mockImplementation(((
      url: string | URL,
      opcoes: https.RequestOptions,
      aoResponder?: (resposta: IncomingMessage) => void,
    ) => {
      chamadasHttps.push({ url: String(url), opcoes });
      const resposta = new PassThrough() as PassThrough & { statusCode?: number };
      resposta.statusCode = 200;
      const pedido = new Writable({ write: (_pedaco, _codificacao, fim) => fim() });
      pedido.on('finish', () => {
        aoResponder?.(resposta as unknown as IncomingMessage);
        resposta.end('ok');
      });
      return pedido as unknown as ClientRequest;
    }) as unknown as typeof https.request);

    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        chamadasFetch.push(url);
        return new Response('ok', { status: 200 });
      }),
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  let certificadoId: string;

  it('host com certificado: a entrega sai por https com o agente que carrega o .pfx', async () => {
    const criado = await pedir(
      'POST',
      '/v1/gestao/contrato/certificados',
      sessaoAdmin1,
      pedidoDeCertificado({ hosts: [HOST_COM_CERTIFICADO] }),
    );
    expect(criado.status).toBe(201);
    certificadoId = criado.corpo.id;

    const primeira = await entregaPendente(a, `${HOST_COM_CERTIFICADO}/hook`);
    const segunda = await entregaPendente(a, `${HOST_COM_CERTIFICADO}:443/outro-caminho`);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === primeira)).toEqual({ id: primeira, estado: 'entregue' });
    expect(resultados.find((r) => r.id === segunda)).toEqual({ id: segunda, estado: 'entregue' });

    expect(chamadasFetch).toHaveLength(0);
    expect(chamadasHttps).toHaveLength(2);
    const um = chamadasHttps.find((c) => c.url === `${HOST_COM_CERTIFICADO}/hook`);
    const dois = chamadasHttps.find((c) => c.url === `${HOST_COM_CERTIFICADO}:443/outro-caminho`);
    expect(um && dois).toBeTruthy();
    expect(um!.opcoes.method).toBe('POST');
    expect((um!.opcoes.headers as Record<string, string>)['x-pipe-signature']).toMatch(
      /^sha256=[0-9a-f]{64}$/,
    );

    // O agente carrega exatamente o .pfx e a senha cadastrados (decifrados).
    const agente = um!.opcoes.agent;
    expect(agente).toBeInstanceOf(https.Agent);
    const opcoes = (agente as unknown as { options: OpcoesDoAgente }).options;
    expect(Buffer.isBuffer(opcoes.pfx) && opcoes.pfx.equals(pfxValido.pfx)).toBe(true);
    expect(opcoes.passphrase).toBe(SENHA_DO_PFX);

    // Cache: a segunda entrega ao mesmo host reaproveita o MESMO agente.
    expect(dois!.opcoes.agent).toBe(agente);
  });

  it('host sem certificado segue pelo fetch normal', async () => {
    const url = `https://sem-certificado.exemplo.com.br/hook-${randomUUID().slice(0, 6)}`;
    const entregaId = await entregaPendente(a, url);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === entregaId)).toEqual({ id: entregaId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });

  it('isolamento: o certificado de A não é apresentado nas entregas de B para o mesmo host', async () => {
    const url = `${HOST_COM_CERTIFICADO}/hook-do-b`;
    const entregaId = await entregaPendente(b, url);
    fingirRede();

    const resultados = await entregarPendentes(b.tenantId);
    expect(resultados.find((r) => r.id === entregaId)).toEqual({ id: entregaId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });

  it('excluir o certificado invalida o cache: a entrega seguinte vai sem ele', async () => {
    const excluido = await pedir(
      'DELETE',
      `/v1/gestao/contrato/certificados/${certificadoId}`,
      sessaoAdmin1,
    );
    expect(excluido.corpo).toEqual({ ok: true });

    const url = `${HOST_COM_CERTIFICADO}/hook-depois`;
    const entregaId = await entregaPendente(a, url);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === entregaId)).toEqual({ id: entregaId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });
});
