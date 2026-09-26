import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';

const { InboundRefused, loginWithGoogle, loginWithSso } = await import('@pipe/authentication');
const { estaCifrado } = await import('@pipe/db');
const {
  connectionForFlow,
  defineState,
  discoverInbound,
  lerConexao,
  marcarTestada,
  salvarConexao,
  tenantBySlug,
} = await import('../src/domain/sso.js');
const { montarCenario } = await import('./ajuda.js');
const { fecharBancos } = await import('../src/database.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * The per-tenant SSO connection, and the pitfalls from `referencias-blip/pesquisa/sso-multi-tenant.md` that only show up with a real database: the state machine, the secret encrypted at rest, domain-based discovery, and the policy checked on the server. What is deliberately NOT here: the conversation with the IdP. That has its own test in `packages/autenticacao/tests/oidc.test.ts`, and repeating it here would require faking the JWKS just to re-prove what is already proven.
 */

const SUFIXO = randomUUID().slice(0, 8);
const DOMAIN = `sso-${SUFIXO}.teste`;
const EMISSOR = 'https://acme.okta.example';

let cenario: Cenario;
let admin: string;
let ana: string;

/** A fake IdP: only `.well-known`, which is all `conexaoParaFluxo` reads. */
const buscarDescoberta = (async () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      issuer: EMISSOR,
      authorization_endpoint: `${EMISSOR}/authorize`,
      token_endpoint: `${EMISSOR}/token`,
      jwks_uri: `${EMISSOR}/keys`,
    }),
  }) as Response) as unknown as typeof fetch;

function pessoa(email: string, verificado = true, sujeito = randomUUID()) {
  return {
    issuer: EMISSOR,
    sujeito,
    email,
    emailVerificado: verificado,
    nome: 'Ana Ribeiro',
    avatarUrl: undefined,
  };
}

beforeAll(async () => {
  cenario = await montarCenario(`sso-${SUFIXO}`);

  // The tenant's verified domain: it is what links an email address to a company.
  await cenario.dono.execute(sql`
    insert into dominio_tenant (tenant_id, dominio, token_verificacao, verificado_em)
    values (${cenario.tenantId}, ${DOMAIN}, 'tok', now())
  `);

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Ana Ribeiro', ${`ana@${DOMAIN}`})
    returning id
  `);
  ana = rows[0]!.id;
  admin = cenario.agentId;
});

afterAll(async () => {
  await cenario?.encerrar();
  await fecharBancos();
});

async function configurar(): Promise<void> {
  await salvarConexao(cenario.tenantId, admin, {
    provider: 'okta',
    issuer: EMISSOR,
    clientId: 'cliente-do-pipe',
    customerSecret: 'segredo-do-cliente',
  });
}

describe('Save SSO connection configuration', () => {
  it('Save SSO configuration in draft with an encrypted secret', async () => {
    await configurar();

    const { rows } = await cenario.dono.execute<{ config: Record<string, unknown> }>(
      sql`select config from conexao_sso where tenant_id = ${cenario.tenantId}::uuid`,
    );
    const guardado = rows[0]!.config['clientSecret'];
    // The risk this closes is not one customer reading another's data — RLS already handles that.
    // It is `pg_dump`, which would hand over every customer's credential at once.
    expect(typeof guardado).toBe('string');
    expect(guardado).not.toBe('segredo-do-cliente');
    expect(estaCifrado(guardado as string)).toBe(true);

    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.state).toBe('rascunho');
    expect(visivel?.policy).toBe('desligado');
    // What the screen shows has no secret at all, nor a field for one.
    expect(JSON.stringify(visivel)).not.toContain('segredo-do-cliente');
  });

  it('Return the callback URL for configuration in the tenant identity provider', async () => {
    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.callbackUrl).toBe('https://api.teste/v1/auth/sso/callback');
  });

  it('recusa emissor que não é https', async () => {
    await expect(
      salvarConexao(cenario.tenantId, admin, {
        issuer: 'http://acme.example',
        clientId: 'x',
        customerSecret: 'y',
      }),
    ).rejects.toMatchObject({ codigo: 'issuer_invalid' });
  });

  it('recusa emissor `common` do Entra: com ele qualquer diretório entraria', async () => {
    await salvarConexao(cenario.tenantId, admin, {
      provider: 'entra',
      issuer: 'https://login.microsoftonline.com/common/v2.0',
      clientId: 'cliente',
      customerSecret: 'segredo',
    });
    await expect(
      connectionForFlow(cenario.tenantId, { requireActive: false }, buscarDescoberta),
    ).rejects.toMatchObject({ codigo: 'issuer_multi_tenant' });
    await configurar();
  });
});

describe('Control SSO connection state separately from login policy', () => {
  it('Prevent SSO activation until a successful test', async () => {
    await configurar();
    await expect(defineState(cenario.tenantId, admin, { state: 'ativa' })).rejects.toMatchObject({
      codigo: 'without_test_valid',
    });
  });

  it('não exige SSO com a conexão desligada — é o incidente clássico', async () => {
    await expect(
      defineState(cenario.tenantId, admin, { policy: 'obrigatorio' }),
    ).rejects.toMatchObject({ codigo: 'connection_inactive' });
  });

  it('Require a successful test before activation and activation before policy enforcement', async () => {
    await marcarTestada(cenario.tenantId);
    expect((await lerConexao(cenario.tenantId))?.state).toBe('testada');

    const active = await defineState(cenario.tenantId, admin, { state: 'ativa' });
    expect(active.state).toBe('ativa');
    expect(active.ativadaEm).toBeInstanceOf(Date);
    // Activating does NOT require SSO: password and Google login both remain valid.
    expect(active.policy).toBe('desligado');

    const exigindo = await defineState(cenario.tenantId, admin, { policy: 'obrigatorio' });
    expect(exigindo.policy).toBe('obrigatorio');
  });

  it('Move an edited SSO connection back to draft', async () => {
    // Changing an active connection's issuer without downgrading its state would point every
    // customer at a directory nobody has tested.
    await defineState(cenario.tenantId, admin, { policy: 'desligado' });
    await configurar();
    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.state).toBe('rascunho');
    expect(visivel?.testadaEm).toBeNull();
  });

  it('Audit every SSO configuration change without logging the secret (`log_auditoria`)', async () => {
    const { rows } = await cenario.dono.execute<{ acao: string; depois: unknown }>(sql`
      select acao, depois from log_auditoria
       where tenant_id = ${cenario.tenantId}::uuid and objeto_tipo = 'conexao_sso'
       order by em
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('segredo-do-cliente');
    expect(rows.map((r) => r.acao)).toContain('ativou');
  });
});

describe('descoberta do tenant no login', () => {
  beforeAll(async () => {
    await configurar();
    await marcarTestada(cenario.tenantId);
    await defineState(cenario.tenantId, admin, { state: 'ativa', policy: 'opcional' });
  });

  it('Route verified domains with active SSO to the tenant identity provider', async () => {
    const achado = await discoverInbound(`ana@${DOMAIN}`);
    expect(achado.metodo).toBe('sso');
    expect(achado.irPara).toBe(`/v1/auth/sso/e2e-sso-${SUFIXO}`);
  });

  it('Make unknown domains indistinguishable from known domains without SSO', async () => {
    // Without this symmetry, the endpoint becomes a catalog of "which companies use Pipe".
    expect(await discoverInbound('alguem@empresa-que-nao-existe.teste')).toEqual({
      metodo: 'google',
    });
  });

  it('Never route public email domains through SSO', async () => {
    // Whoever mapped `gmail.com` would capture the login of half of Brazil. The guard is
    // in the code, not only in registration — that is why the test forces the row into the database.
    await cenario.dono.execute(sql`
      insert into dominio_tenant (tenant_id, dominio, token_verificacao, verificado_em)
      values (${cenario.tenantId}, ${'gmail.com'}, 'tok', now())
      on conflict (dominio) do nothing
    `);
    try {
      expect(await discoverInbound('alguem@gmail.com')).toEqual({ metodo: 'google' });
    } finally {
      await cenario.dono.execute(sql`delete from dominio_tenant where dominio = 'gmail.com'`);
    }
  });

  it('o link direto /e/<slug> resolve o tenant pela URL', async () => {
    expect(await tenantBySlug(`e2e-sso-${SUFIXO}`)).toBe(cenario.tenantId);
    await expect(tenantBySlug('empresa-que-nao-existe')).rejects.toMatchObject({ status: 404 });
  });
});

describe('Authenticate through the tenant identity provider', () => {
  it('Link an account by issuer and subject and mark its session as SSO', async () => {
    const inbound = await loginWithSso(
      cenario.dono,
      cenario.dono,
      pessoa(`ana@${DOMAIN}`),
      cenario.tenantId,
    );
    expect(inbound.userId).toBe(ana);

    const { rows } = await cenario.dono.execute<{ origin: string }>(
      sql`select origem from sessao where usuario_id = ${ana}::uuid order by criado_em desc limit 1`,
    );
    expect(rows[0]?.origem).toBe('sso');
  });

  it('recusa quem o IdP não confirmou o e-mail — é o caminho de escalada', async () => {
    // Anyone who gets an IdP to issue the victim's email would sign in as her, with the
    // her roles. In Entra, it is the absence of `xms_edov` that triggers this.
    await expect(
      loginWithSso(
        cenario.dono,
        cenario.dono,
        pessoa(`chefe@${DOMAIN}`, false),
        cenario.tenantId,
      ),
    ).rejects.toMatchObject({ codigo: 'email_nao_verificado' });
  });

  it('Reject login from an email domain outside the initiating tenant', async () => {
    // One customer's IdP does not authenticate someone from another just by sending the email
    // correctly: the domain still has to be verified, and verified here specifically.
    await expect(
      loginWithSso(
        cenario.dono,
        cenario.dono,
        pessoa('ana@outra-empresa.teste'),
        cenario.tenantId,
      ),
    ).rejects.toMatchObject({ codigo: 'domain_unknown' });
  });

  it('Reject SSO login for users who were never invited', async () => {
    await expect(
      loginWithSso(cenario.dono, cenario.dono, pessoa(`novato@${DOMAIN}`), cenario.tenantId),
    ).rejects.toMatchObject({ codigo: 'without_invitation' });
  });
});

describe('convivência: SSO obrigatório não tem porta dos fundos', () => {
  it('com politica=obrigatorio o login pelo Google é recusado no SERVIDOR', async () => {
    // It is not the screen hiding the button. The identity is already linked, the user
    // is active, and login through the other path is still rejected.
    await defineState(cenario.tenantId, admin, { policy: 'obrigatorio' });
    try {
      await expect(
        loginWithGoogle(cenario.dono, cenario.dono, {
          issuer: 'https://accounts.google.com',
          sujeito: 'google-da-ana',
          email: `ana@${DOMAIN}`,
          emailVerificado: true,
          nome: 'Ana',
          avatarUrl: undefined,
        }),
      ).rejects.toBeInstanceOf(InboundRefused);

      // ...and SSO still succeeds, which is the whole point of the policy.
      const entrada = await loginWithSso(
        cenario.dono,
        cenario.dono,
        pessoa(`ana@${DOMAIN}`),
        cenario.tenantId,
      );
      expect(entrada.userId).toBe(ana);
    } finally {
      await defineState(cenario.tenantId, admin, { policy: 'opcional' });
    }
  });

  it('Allow both Google and SSO login under the optional policy', async () => {
    const entrada = await loginWithGoogle(cenario.dono, cenario.dono, {
      issuer: 'https://accounts.google.com',
      sujeito: `google-${randomUUID()}`,
      email: `ana@${DOMAIN}`,
      emailVerificado: true,
      nome: 'Ana',
      avatarUrl: undefined,
    });
    expect(entrada.userId).toBe(ana);
  });
});
