import { randomUUID } from 'node:crypto';
import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough, Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { generatePfxOfTest } from './ajuda-pfx.js';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
// O `.pfx` e a senha do certificado mTLS entram cifrados (`segredo.ts`).
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 23).toString('base64')}`;

const { NOME_DO_COOKIE, createToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { createDatabase, closeDatabase, seed } = await import('@pipe/db');
const { entregarPendentes } = await import('../src/webhooks-saida.js');

const URL_DONO = process.env['DATABASE_URL']!;

/**
 * Contract — Members and Certificates: item 4 of the task.
 *
 * Same pattern as `cadastros-atendimento.test.ts`: two tenants, cookie session, happy path, refusals, cross-tenant, permission. Since Members uses the `Resultado` pattern (`{ ok, erro }` at 200, not `ErroPipe`), business refusals (last admin, cross-tenant) arrive as `ok: false`; invite and certificate use real `ErroPipe` (400/403/404), so those routes show an HTTP status too.
 */

interface Cenario {
  dono: Awaited<ReturnType<typeof createDatabase>>;
  tenantId: string;
  papeis: Record<'admin' | 'member' | 'guest', string>;
  encerrar: () => Promise<void>;
}

async function assembleContract(sufixo: string): Promise<Cenario> {
  const dono = createDatabase({ url: URL_DONO, maxConexoes: 3 });
  const semeado = await seed(dono, { name: `contrato ${sufixo}`, slug: `contrato-${sufixo}` });
  const { rows: papeis } = await dono.execute<{ id: string; name: 'admin' | 'member' | 'guest' }>(
    sql`select id, nome from papel where tenant_id = ${semeado.tenantId}::uuid and escopo = 'conta'`,
  );
  const byName = Object.fromEntries(papeis.map((p) => [p.name, p.id])) as Cenario['papeis'];
  return {
    dono,
    tenantId: semeado.tenantId,
    papeis: byName,
    encerrar: async () => {
      await dono.execute(sql`delete from tenant where id = ${semeado.tenantId}::uuid`);
      await closeDatabase(dono);
    },
  };
}

async function userWithRole(
  cenario: Cenario,
  roleName: 'admin' | 'member' | 'guest',
): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${cenario.tenantId}::uuid, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = rows[0]!.id;
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
    values (${cenario.tenantId}::uuid, ${usuarioId}::uuid, ${cenario.papeis[roleName]}::uuid, 'conta')
  `);
  return usuarioId;
}

/**
 * Someone with `conta.membros.escrever` who is NOT `admin` — a custom account role, only to prove the "last admin" guard in `removerMembro` holds even coming from someone who isn't the target themselves (the "can't remove myself" already blocks the more obvious case before it).
 */
async function userOperator(cenario: Cenario): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo) values (${cenario.tenantId}::uuid, ${`operador-${marca}`}, 'conta')
    returning id
  `);
  const roleId = papeis[0]!.id;
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}::uuid, ${roleId}::uuid, 'conta.membros.ler'),
           (${cenario.tenantId}::uuid, ${roleId}::uuid, 'conta.membros.escrever')
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email) values (${cenario.tenantId}::uuid, ${`Operador ${marca}`}, ${`operador-${marca}@e2e.pipe.app`})
    returning id
  `);
  const userId = rows[0]!.id;
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
    values (${cenario.tenantId}::uuid, ${userId}::uuid, ${roleId}::uuid, 'conta')
  `);
  return userId;
}

async function openSession(cenario: Cenario, userId: string): Promise<string> {
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}::uuid, ${userId}::uuid, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `pipe_session=${token}`, 'content-type': 'application/json' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
let api: ApiNoAr;

async function pedir(
  metodo: string,
  caminho: string,
  session: string | null,
  corpo?: Record<string, unknown>,
): Promise<{ status: number; body: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: session ? comCookie(session) : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : undefined };
}

let a: Cenario;
let b: Cenario;
/** Tenant `a` with TWO admins — to test swap/removal without hitting the last one. */
let sessionAdmin1: string;
let userAdmin2Id: string;
let userMemberId: string;
let sessionGuest: string;
/** A separate tenant, with a SINGLE admin — only for the two "last admin" tests. */
let umAdmin: Cenario;
let sessionUniqueAdmin: string;
let userUniqueAdminId: string;
/** Has `conta.membros.escrever` but isn't `admin` — see `usuarioOperador`. */
let sessionOperator: string;
/** A valid session from tenant B, to prove A's id isn't found there. */
let sessionOfOtherTenant: string;

beforeAll(async () => {
  a = await assembleContract(`ct-${randomUUID().slice(0, 8)}`);
  b = await assembleContract(`ct-${randomUUID().slice(0, 8)}`);
  umAdmin = await assembleContract(`ct1-${randomUUID().slice(0, 8)}`);

  const admin1Id = await userWithRole(a, 'admin');
  userAdmin2Id = await userWithRole(a, 'admin');
  userMemberId = await userWithRole(a, 'member');
  const guestId = await userWithRole(a, 'guest');
  const adminDoB = await userWithRole(b, 'admin');
  userUniqueAdminId = await userWithRole(umAdmin, 'admin');
  const operadorId = await userOperator(umAdmin);

  api = await upApi(0);
  sessionAdmin1 = await openSession(a, admin1Id);
  sessionGuest = await openSession(a, guestId);
  sessionOfOtherTenant = await openSession(b, adminDoB);
  sessionUniqueAdmin = await openSession(umAdmin, userUniqueAdminId);
  sessionOperator = await openSession(umAdmin, operadorId);
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

describe('GET /v1/management/contract/members', () => {
  it('List each member\'s role and reject users without conta.membros.ler', async () => {
    const { status, corpo } = await pedir('GET', '/v1/management/contract/members', sessionAdmin1);
    expect(status).toBe(200);
    const member = corpo.membros.find((m: Corpo) => m.id === userMemberId);
    expect(member).toMatchObject({ tipo: 'usuario', papelNome: 'member' });

    const withoutSession = await fetch(`${api.url}/v1/management/contract/members`);
    expect(withoutSession.status).toBe(401);
  });
});

describe('convidar, reenviar e revogar', () => {
  it('Invite with a role, invalidate the old link on resend, and revoke the invitation', async () => {
    const email = `convidado-${randomUUID().slice(0, 8)}@e2e.pipe.app`;
    const criado = await pedir('POST', '/v1/convites', sessionAdmin1, { email, papel: 'member' });
    expect(criado.status).toBe(201);
    expect(criado.corpo).toMatchObject({ email, papel: 'member' });
    expect(criado.corpo.url).toContain('/convite/');

    // aparece em Membros como pendente
    const lista1 = await pedir('GET', '/v1/management/contract/members', sessionAdmin1);
    const pendente1 = lista1.corpo.membros.find((m: Corpo) => m.id === criado.corpo.id);
    expect(pendente1).toMatchObject({ tipo: 'convite', email, papelNome: 'member' });

    const reenviado = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessionAdmin1,
    );
    expect(reenviado.status).toBe(201);
    expect(reenviado.corpo.email).toBe(email);
    expect(reenviado.corpo.url).not.toBe(criado.corpo.url);

    // // the original invite no longer exists (expired); the new id is the one that counts
    const naoAchaOAntigo = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessionAdmin1,
    );
    expect(naoAchaOAntigo.status).toBe(404);

    // revoga (o "Excluir" da tabela, sobre um alvo do tipo convite)
    const revogado = await pedir('POST', '/v1/management/contract/members/delete', sessionAdmin1, {
      alvos: [`convite:${reenviado.corpo.id}`],
    });
    expect(revogado.corpo).toEqual({ ok: true });

    const lista2 = await pedir('GET', '/v1/management/contract/members', sessionAdmin1);
    expect(lista2.corpo.membros.some((m: Corpo) => m.id === reenviado.corpo.id)).toBe(false);
  });

  it('Return 403 when inviting without `conta.membros.escrever`', async () => {
    const semPoder = await pedir('POST', '/v1/convites', sessionGuest, {
      email: `x-${randomUUID().slice(0, 6)}@e2e.pipe.app`,
      papel: 'guest',
    });
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo.erro.code).toBe('without_permission');
    expect(semPoder.corpo.erro.detalhe.permissao).toBe('conta.membros.escrever');
  });

  it('Return 404 when resending another tenant\'s invitation', async () => {
    const email = `cross-${randomUUID().slice(0, 8)}@e2e.pipe.app`;
    const criado = await pedir('POST', '/v1/convites', sessionAdmin1, { email, papel: 'guest' });
    const doOutroTenant = await pedir(
      'POST',
      `/v1/convites/${criado.corpo.id}/reenviar`,
      sessionOfOtherTenant,
    );
    expect(doOutroTenant.status).toBe(404);
  });
});

describe('POST /v1/management/contract/members/role', () => {
  it('Change a member\'s role', async () => {
    const resultado = await pedir('POST', '/v1/management/contract/members/role', sessionAdmin1, {
      papelId: a.papeis.guest,
      alvos: [`usuario:${userMemberId}`],
    });
    expect(resultado.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/management/contract/members', sessionAdmin1);
    const membro = lista.corpo.membros.find((m: Corpo) => m.id === userMemberId);
    expect(membro.roleName).toBe('guest');

    // // returns to the original state, so it doesn't disrupt the other tests
    await pedir('POST', '/v1/management/contract/members/role', sessionAdmin1, {
      papelId: a.papeis.member,
      alvos: [`usuario:${userMemberId}`],
    });
  });

  it('Do not find a member belonging to another tenant', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/management/contract/members/role',
      sessionOfOtherTenant,
      { papelId: a.papeis.guest, alvos: [`usuario:${userMemberId}`] },
    );
    expect(resultado.corpo).toMatchObject({ ok: false });
  });
});

describe('o último administrador', () => {
  it('recusa rebaixar o último admin', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/management/contract/members/role',
      sessionUniqueAdmin,
      { papelId: umAdmin.papeis.member, alvos: [`usuario:${userUniqueAdminId}`] },
    );
    expect(resultado.corpo.ok).toBe(false);
    expect(resultado.corpo.erro).toMatch(/último administrador/);

    // continua admin
    const lista = await pedir('GET', '/v1/management/contract/members', sessionUniqueAdmin);
    expect(
      lista.corpo.membros.find((m: Corpo) => m.id === userUniqueAdminId)?.roleName,
    ).toBe('admin');
  });

  it('Prevent removal of the last admin even by another user', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/management/contract/members/delete',
      sessionOperator,
      { alvos: [`usuario:${userUniqueAdminId}`] },
    );
    expect(resultado.corpo.ok).toBe(false);
    expect(resultado.corpo.erro).toMatch(/último administrador/);

    const lista = await pedir('GET', '/v1/management/contract/members', sessionUniqueAdmin);
    expect(lista.corpo.membros.some((m: Corpo) => m.id === userUniqueAdminId)).toBe(true);
  });

  it('com DOIS admins, rebaixar ou remover um deles funciona', async () => {
    const rebaixa = await pedir('POST', '/v1/management/contract/members/role', sessionAdmin1, {
      papelId: a.papeis.member,
      alvos: [`usuario:${userAdmin2Id}`],
    });
    expect(rebaixa.corpo).toEqual({ ok: true });

    // // returns the admin and tests removal from the other side
    await pedir('POST', '/v1/management/contract/members/role', sessionAdmin1, {
      papelId: a.papeis.admin,
      alvos: [`usuario:${userAdmin2Id}`],
    });
    const remove = await pedir('POST', '/v1/management/contract/members/delete', sessionAdmin1, {
      alvos: [`usuario:${userAdmin2Id}`],
    });
    expect(remove.corpo).toEqual({ ok: true });
  });
});

/* =========================================================================
 * Certificados
 * ========================================================================= */

/** Um `.pfx` de verdade por teste (chave RSA nova, ~0,2 s): `ajuda-pfx.ts`. */
const SENHA_DO_PFX = 'senha-do-pfx-2026';
const pfxValido = generatePfxOfTest({ senha: SENHA_DO_PFX });

const pedidoDeCertificado = (extra: Record<string, unknown> = {}) => ({
  descricao: `Certificado ${randomUUID().slice(0, 6)}`,
  hosts: ['https://api.exemplo.com.br'],
  senha: SENHA_DO_PFX,
  arquivo: pfxValido.pfx.toString('base64'),
  ...extra,
});

describe('Manage mTLS authentication certificates', () => {
  it('Read validity, fingerprint, subject, and issuer from a .pfx and calculate its status', async () => {
    // // The screen sends a data URL (FileReader); plain base64 also works.
    const criado = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
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

    const lista = await pedir('GET', '/v1/management/contract/certificates', sessionAdmin1);
    expect(lista.status).toBe(200);
    const linha = lista.corpo.find((c: Corpo) => c.id === criado.corpo.id);
    expect(linha).toMatchObject({
      impressaoDigital: pfxValido.impressaoDigital,
      expiraEm: `${pfxValido.expiraEm}T00:00:00.000Z`,
      status: 'valido',
    });
  });

  it('certificado vencido entra com status expirado', async () => {
    const vencido = generatePfxOfTest({ senha: 'outra', validoDesde: '2019-01-01', validoAte: '2021-01-01' });
    const criado = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
      ...pedidoDeCertificado({ senha: 'outra', arquivo: vencido.pfx.toString('base64') }),
    });
    expect(criado.status).toBe(201);
    expect(criado.corpo.status).toBe('expirado');
    expect(criado.corpo.expiraEm).toBe('2021-01-01T00:00:00.000Z');
  });

  it('Reject a wrong certificate password without saving anything', async () => {
    const description = `Errada ${randomUUID().slice(0, 6)}`;
    const resultado = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
      ...pedidoDeCertificado({ description, senha: 'nao-e-essa' }),
    });
    expect(resultado.status).toBe(400);
    expect(resultado.corpo.erro.code).toBe('password_incorrect');
    expect(JSON.stringify(resultado.corpo)).not.toContain('nao-e-essa');

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from certificado_mtls where descricao = ${description}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('Return 400 for a non-.pfx file or missing password', async () => {
    const lixo = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
      ...pedidoDeCertificado({ arquivo: Buffer.from('isto não é um pfx').toString('base64') }),
    });
    expect(lixo.status).toBe(400);
    expect(lixo.corpo.erro.code).toBe('pfx_invalid');

    const semSenha = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
      ...pedidoDeCertificado({ senha: '' }),
    });
    expect(semSenha.status).toBe(400);
    expect(semSenha.corpo.erro.code).toBe('password_required');
  });

  it('Encrypt stored certificate files and passwords without returning or auditing them', async () => {
    const base64 = pfxValido.pfx.toString('base64');
    const criado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionAdmin1,
      pedidoDeCertificado(),
    );
    expect(criado.status).toBe(201);
    const serializado = JSON.stringify(criado.corpo);
    expect(serializado).not.toContain(SENHA_DO_PFX);
    expect(serializado).not.toContain(base64.slice(0, 40));
    expect(criado.corpo).not.toHaveProperty('senha');
    expect(criado.corpo).not.toHaveProperty('arquivo');

    // No banco: envelopes `pipev1.` (AES-256-GCM), nunca o valor em claro.
    const { rows } = await a.dono.execute<{ fileEncrypted: string; senha_cifrada: string }>(
      sql`select arquivo_cifrado, senha_cifrada from certificado_mtls where id = ${criado.corpo.id}::uuid`,
    );
    expect(rows[0]!.arquivo_cifrado).toMatch(/^pipev1\./);
    expect(rows[0]!.senha_cifrada).toMatch(/^pipev1\./);
    expect(rows[0]!.arquivo_cifrado).not.toContain(base64.slice(0, 40));
    expect(rows[0]!.senha_cifrada).not.toContain(SENHA_DO_PFX);

    // // The listing doesn't even include the encrypted value.
    const lista = await pedir('GET', '/v1/management/contract/certificates', sessionAdmin1);
    const linha = lista.corpo.find((c: Corpo) => c.id === criado.corpo.id);
    for (const key of ['senha', 'arquivo', 'senha_cifrada', 'arquivo_cifrado', 'senhaCifrada']) {
      expect(linha).not.toHaveProperty(key);
    }
    expect(JSON.stringify(lista.corpo)).not.toContain('pipev1.');

    // // The audit log records only what's public about the certificate.
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
    const resultado = await pedir('POST', '/v1/management/contract/certificates', sessionAdmin1, {
      ...pedidoDeCertificado({ hosts: ['ftp://nao-serve.com'] }),
    });
    expect(resultado.status).toBe(400);
    expect(resultado.corpo.erro.code).toBe('host_invalid');
  });

  it('exclui o certificado', async () => {
    const criado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionAdmin1,
      pedidoDeCertificado(),
    );
    const excluido = await pedir(
      'DELETE',
      `/v1/management/contract/certificates/${criado.corpo.id}`,
      sessionAdmin1,
    );
    expect(excluido.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/management/contract/certificates', sessionAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(false);
  });

  it('excluir o último host apaga o certificado junto', async () => {
    const criado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionAdmin1,
      pedidoDeCertificado({ hosts: ['https://unico.exemplo.com.br'] }),
    );
    const hostId = criado.corpo.hosts[0].id;

    const excluiu = await pedir(
      'DELETE',
      `/v1/management/contract/certificates/${criado.corpo.id}/hosts/${hostId}`,
      sessionAdmin1,
    );
    expect(excluiu.corpo).toEqual({ ok: true });

    const lista = await pedir('GET', '/v1/management/contract/certificates', sessionAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(false);
  });

  it('certificado de outro tenant não é achado', async () => {
    const criado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionAdmin1,
      pedidoDeCertificado(),
    );
    const doOutroTenant = await pedir(
      'DELETE',
      `/v1/management/contract/certificates/${criado.corpo.id}`,
      sessionOfOtherTenant,
    );
    expect(doOutroTenant.corpo).toMatchObject({ ok: false });

    // continua existindo no tenant certo
    const lista = await pedir('GET', '/v1/management/contract/certificates', sessionAdmin1);
    expect(lista.corpo.some((c: Corpo) => c.id === criado.corpo.id)).toBe(true);
  });

  it('Return 403 when a user without `conta.membros.escrever` registers a certificate', async () => {
    const resultado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionGuest,
      pedidoDeCertificado(),
    );
    expect(resultado.status).toBe(403);
    expect(resultado.corpo.erro.detalhe.permissao).toBe('conta.membros.escrever');
  });

  it('Return 403 when listing certificates without conta.membros.ler', async () => {
    const semSessao = await fetch(`${api.url}/v1/management/contract/certificates`);
    expect(semSessao.status).toBe(401);
  });
});

/* =========================================================================
 * Outbound mTLS: Pipe presents the certificate when calling the registered host
 * ========================================================================= */

const HOST_COM_CERTIFICADO = 'https://mtls.exemplo.com.br';

/** A tenant's webhook with a pending delivery for `url`, seeded by the owner. */
async function deliveryPending(cenario: Cenario, url: string): Promise<string> {
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

type OptionsOfAgente = { pfx?: Buffer; passphrase?: string };

describe('mTLS na saída (webhooks)', () => {
  const chamadasHttps: Array<{ url: string; options: https.RequestOptions }> = [];
  const chamadasFetch: string[] = [];

  /**
   * No network: `https.request` (the path with a certificate) becomes a double that records the agent it received and answers 200; the global `fetch` (the path without a certificate) records the URL and answers 200 — except for what goes to the test `api` itself, which goes through the real fetch (the same care as `integracoes.test.ts`).
   */
  function fingirRede() {
    chamadasHttps.length = 0;
    chamadasFetch.length = 0;
    vi.spyOn(https, 'request').mockImplementation(((
      url: string | URL,
      options: https.RequestOptions,
      aoResponder?: (resposta: IncomingMessage) => void,
    ) => {
      chamadasHttps.push({ url: String(url), options });
      const resposta = new PassThrough() as PassThrough & { statusCode?: number };
      resposta.statusCode = 200;
      const pedido = new Writable({ write: (_pedaco, encoding, fim) => fim() });
      pedido.on('finish', () => {
        aoResponder?.(resposta as unknown as IncomingMessage);
        resposta.end('ok');
      });
      return pedido as unknown as ClientRequest;
    }) as unknown as typeof https.request);

    const fetchOfTruth = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchOfTruth(url, init);
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

  it('Send HTTPS deliveries to a certified host using an agent loaded with its .pfx', async () => {
    const criado = await pedir(
      'POST',
      '/v1/management/contract/certificates',
      sessionAdmin1,
      pedidoDeCertificado({ hosts: [HOST_COM_CERTIFICADO] }),
    );
    expect(criado.status).toBe(201);
    certificadoId = criado.corpo.id;

    const first = await deliveryPending(a, `${HOST_COM_CERTIFICADO}/hook`);
    const segunda = await deliveryPending(a, `${HOST_COM_CERTIFICADO}:443/outro-caminho`);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === first)).toEqual({ id: first, estado: 'entregue' });
    expect(resultados.find((r) => r.id === segunda)).toEqual({ id: segunda, estado: 'entregue' });

    expect(chamadasFetch).toHaveLength(0);
    expect(chamadasHttps).toHaveLength(2);
    const um = chamadasHttps.find((c) => c.url === `${HOST_COM_CERTIFICADO}/hook`);
    const dois = chamadasHttps.find((c) => c.url === `${HOST_COM_CERTIFICADO}:443/outro-caminho`);
    expect(um && dois).toBeTruthy();
    expect(um!.options.method).toBe('POST');
    expect((um!.options.headers as Record<string, string>)['x-pipe-signature']).toMatch(
      /^sha256=[0-9a-f]{64}$/,
    );

    // O agente carrega exatamente o .pfx e a senha cadastrados (decifrados).
    const agente = um!.options.agent;
    expect(agente).toBeInstanceOf(https.Agent);
    const options = (agente as unknown as { options: OptionsOfAgente }).options;
    expect(Buffer.isBuffer(options.pfx) && options.pfx.equals(pfxValido.pfx)).toBe(true);
    expect(options.passphrase).toBe(SENHA_DO_PFX);

    // Cache: a segunda entrega ao mesmo host reaproveita o MESMO agente.
    expect(dois!.options.agent).toBe(agente);
  });

  it('host sem certificado segue pelo fetch normal', async () => {
    const url = `https://sem-certificado.exemplo.com.br/hook-${randomUUID().slice(0, 6)}`;
    const deliveryId = await deliveryPending(a, url);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === deliveryId)).toEqual({ id: deliveryId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });

  it('Never use tenant A\'s certificate for tenant B\'s deliveries to the same host', async () => {
    const url = `${HOST_COM_CERTIFICADO}/hook-do-b`;
    const entregaId = await deliveryPending(b, url);
    fingirRede();

    const resultados = await entregarPendentes(b.tenantId);
    expect(resultados.find((r) => r.id === entregaId)).toEqual({ id: entregaId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });

  it('Invalidate the certificate cache on deletion so the next delivery uses no certificate', async () => {
    const excluido = await pedir(
      'DELETE',
      `/v1/management/contract/certificates/${certificadoId}`,
      sessionAdmin1,
    );
    expect(excluido.corpo).toEqual({ ok: true });

    const url = `${HOST_COM_CERTIFICADO}/hook-depois`;
    const entregaId = await deliveryPending(a, url);
    fingirRede();

    const resultados = await entregarPendentes(a.tenantId);
    expect(resultados.find((r) => r.id === entregaId)).toEqual({ id: entregaId, estado: 'entregue' });
    expect(chamadasFetch).toEqual([url]);
    expect(chamadasHttps).toHaveLength(0);
  });
});
