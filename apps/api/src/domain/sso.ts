import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { DOMINIOS_PUBLICOS, descobrir, domainOfEmail } from '@pipe/authentication';
import type { ConfigOidc, DescobertaOidc, ProvedorSso } from '@pipe/authentication';
import type { RespostaDaDescoberta } from '@pipe/contracts';
import { databaseOwner, keyring, noTenant } from '../database.js';
import { PipeError } from '../errors.js';

/**
 * Tenant SSO connection and activation follow `referencias-blip/pesquisa/sso-multi-tenant.md`. Saving creates `rascunho`; a real test moves it to `testada`, and only then can it become `ativa`, preventing an untested IdP from breaking login. `estado` controls whether the connection works, while `politica` controls whether passwords remain allowed; enabling SSO must be separate from requiring it to avoid tenant-wide lockout. Never store or return `clientSecret` in plaintext: `cifrarConfig` (`packages/db/src/segredo.ts`) encrypts it, and only the IdP call path decrypts it.
 */

/** A successful test is valid for 30 days; a test from last year proves nothing now. */
export const DAYS_OF_TEST_VALID = 30;

export const ESTADOS = ['rascunho', 'testada', 'ativa'] as const;
export const POLITICAS = ['desligado', 'opcional', 'obrigatorio'] as const;
export const PROVEDORES = ['generico', 'entra', 'google_workspace', 'okta'] as const;

export type StateConnection = (typeof ESTADOS)[number];
export type PoliticaSso = (typeof POLITICAS)[number];

/** Screen-facing type excludes secrets; that is why it is separate. */
export interface ConexaoSsoVisivel {
  id: string;
  provider: ProvedorSso;
  issuer: string;
  clientId: string;
  state: StateConnection;
  policy: PoliticaSso;
  testadaEm: Date | null;
  ativadaEm: Date | null;
  /** O que o cliente cola no IdP dele. */
  callbackUrl: string;
}

interface LinhaConexao {
  /** Drizzle `execute` requires an indexable shape; the columns above remain typed. */
  [column: string]: unknown;
  id: string;
  tenant_id: string;
  provider: string;
  issuer: string;
  cliente_id: string;
  config: Record<string, unknown> | null;
  state: string;
  policy: string;
  testada_em: string | null;
  ativada_em: string | null;
}

/** Use one callback URL for every tenant; `state`, not the URL, identifies the tenant. */
export function ssoCallbackUrl(): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/v1/auth/sso/callback`;
}

function visivel(linha: LinhaConexao): ConexaoSsoVisivel {
  return {
    id: linha.id,
    provider: linha.provider as ProvedorSso,
    issuer: linha.issuer,
    clientId: linha.cliente_id,
    state: linha.state as StateConnection,
    policy: linha.policy as PoliticaSso,
    testadaEm: linha.testada_em ? new Date(linha.testada_em) : null,
    ativadaEm: linha.ativada_em ? new Date(linha.ativada_em) : null,
    callbackUrl: ssoCallbackUrl(),
  };
}

export interface CorpoDeConexao {
  provider?: string;
  issuer?: string;
  clientId?: string;
  customerSecret?: string;
}

/**
 * Save the connection and always return it to `rascunho`. Changing an active connection's issuer without resetting and retesting could silently move all logins to another directory. An `ativa` connection must be retested after this change.
 */
export async function salvarConexao(
  tenantId: string,
  userId: string,
  corpo: CorpoDeConexao,
): Promise<ConexaoSsoVisivel> {
  const provedor = (corpo.provider ?? 'generico').trim();
  if (!PROVEDORES.includes(provedor as ProvedorSso)) {
    throw PipeError.request('provider_invalid', `"${provedor}" não é um provedor conhecido.`);
  }

  const emissor = (corpo.issuer ?? '').trim().replace(/\/$/, '');
  if (!emissor.startsWith('https://')) {
    throw PipeError.request(
      'issuer_invalid',
      'O emissor precisa ser a URL https do provedor — a mesma de onde sai o `.well-known`.',
    );
  }
  const clienteId = (corpo.clientId ?? '').trim();
  const customerSecret = (corpo.customerSecret ?? '').trim();
  if (!clienteId || !customerSecret) {
    throw PipeError.request('config_incomplete', 'Faltam `clienteId` ou `clienteSegredo`.');
  }

  const config = cifrarConfig({ clientSecret: customerSecret }, keyring());

  return noTenant(tenantId, async (tx) => {
    const { rows: antes } = await tx.execute<LinhaConexao>(
      sql`select * from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
    );

    // Do not change policy here: reconfiguring the IdP must neither reopen passwords for an SSO-required tenant nor disable them without an explicit action.
    const { rows } = await tx.execute<LinhaConexao>(sql`
      insert into conexao_sso (tenant_id, tipo, provedor, emissor, cliente_id, config)
      values (${tenantId}::uuid, 'oidc', ${provedor}, ${emissor}, ${clienteId},
              ${JSON.stringify(config)}::jsonb)
      on conflict (tenant_id) do update
         set provedor = excluded.provedor,
             emissor = excluded.emissor,
             cliente_id = excluded.cliente_id,
             config = excluded.config,
             estado = 'rascunho',
             testada_em = null,
             atualizado_em = now()
      returning *
    `);

    const linha = rows[0]!;
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: antes[0] ? 'alterou' : 'criou',
      objetoTipo: 'conexao_sso',
      objetoId: linha.id,
      // `registrarAuditoria` itself excludes `config` from logs, so passing the full row is safe.
      ...(antes[0] ? { antes: antes[0] } : {}),
      depois: linha,
    });
    return visivel(linha);
  });
}

export async function lerConexao(tenantId: string): Promise<ConexaoSsoVisivel | null> {
  const linha = await linhaDoTenant(tenantId);
  return linha ? visivel(linha) : null;
}

async function linhaDoTenant(tenantId: string): Promise<LinhaConexao | null> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConexao>(
      sql`select * from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
    );
    return rows[0] ?? null;
  });
}

export interface MudancaOfState {
  state?: string;
  policy?: string;
}

/**
 * Change SSO connection state and/or policy with two safeguards. `ativa` requires a successful test within 30 days; otherwise enabling could send every user to an IdP that never answered. `obrigatorio` requires an active connection; requiring a disabled SSO connection locks out the whole tenant.
 */
export async function defineState(
  tenantId: string,
  usuarioId: string,
  mudanca: MudancaOfState,
): Promise<ConexaoSsoVisivel> {
  const atual = await linhaDoTenant(tenantId);
  if (!atual) throw PipeError.naoEncontrado('Conexão de SSO');

  const state = (mudanca.state ?? atual.estado) as StateConnection;
  const politica = (mudanca.policy ?? atual.politica) as PoliticaSso;
  if (!ESTADOS.includes(state)) {
    throw PipeError.request('state_invalid', `"${state}" não é um estado de conexão.`);
  }
  if (!POLITICAS.includes(politica)) {
    throw PipeError.request('policy_invalid', `"${politica}" não é uma política de SSO.`);
  }

  if (state === 'ativa' && !testValid(atual.testada_em)) {
    throw PipeError.request(
      'without_test_valid',
      `Teste a conexão antes de ativá-la — o teste vale ${DAYS_OF_TEST_VALID} dias.`,
    );
  }
  if (politica !== 'desligado' && state !== 'ativa') {
    throw PipeError.request(
      'connection_inactive',
      'Exigir SSO com a conexão desligada tranca todo mundo do lado de fora. Ative primeiro.',
    );
  }

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConexao>(sql`
      update conexao_sso
         set estado = ${state},
             politica = ${politica},
             ativada_em = case when ${state} = 'ativa' and ativada_em is null
                               then now() else ativada_em end,
             atualizado_em = now()
       where tenant_id = ${tenantId}::uuid
      returning *
    `);
    const linha = rows[0]!;
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: usuarioId },
      acao: state === 'ativa' ? 'ativou' : 'alterou',
      objetoTipo: 'conexao_sso',
      objetoId: linha.id,
      antes: { estado: atual.estado, politica: atual.politica },
      depois: { state, politica },
    });
    return visivel(linha);
  });
}

export function testValid(testadaEm: string | Date | null, agora = new Date()): boolean {
  if (!testadaEm) return false;
  const quando = testadaEm instanceof Date ? testadaEm : new Date(testadaEm);
  return agora.getTime() - quando.getTime() <= DAYS_OF_TEST_VALID * 24 * 60 * 60 * 1000;
}

/** Record a successful test; only the test-flow callback calls this. */
export async function marcarTestada(tenantId: string): Promise<void> {
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update conexao_sso
         set testada_em = now(),
             estado = case when estado = 'rascunho' then 'testada' else estado end,
             atualizado_em = now()
       where tenant_id = ${tenantId}::uuid
    `);
  });
}

export interface ConnectionForFlow {
  tenantId: string;
  config: ConfigOidc;
  descoberta: DescobertaOidc;
}

/**
 * Ready IdP connection with decrypted secret and discovery metadata. `buscar` is injectable so tests avoid the network. `exigirAtiva` separates real login, which requires an active connection, from testing a draft connection.
 */
export async function connectionForFlow(
  tenantId: string,
  options: { exigirActive: boolean },
  buscar: typeof fetch = fetch,
): Promise<ConnectionForFlow> {
  const linha = await linhaDoTenant(tenantId);
  if (!linha) throw PipeError.naoEncontrado('Conexão de SSO');
  if (options.exigirActive && linha.state !== 'ativa') {
    throw PipeError.request('sso_inactive', 'O SSO desta conta ainda não foi ativado.');
  }

  const config = decifrarConfig(linha.config ?? {}, keyring());
  const clienteSegredo = typeof config['clientSecret'] === 'string' ? config['clientSecret'] : '';
  if (!clienteSegredo) {
    throw PipeError.request('config_incomplete', 'A conexão está sem o segredo do cliente.');
  }

  return {
    tenantId,
    config: {
      provedor: linha.provider as ProvedorSso,
      emissor: linha.issuer,
      clienteId: linha.cliente_id,
      customerSecret: clienteSegredo,
      urlOfCallback: ssoCallbackUrl(),
      ...(linha.provider === 'entra' ? { tenantsEntra: tenantsDoEntra(linha.issuer) } : {}),
    },
    descoberta: await descobrir(linha.issuer, buscar),
  };
}

/**
 * Derive the accepted `tid` from the registered issuer. `https://login.microsoftonline.com/<tid>/v2.0` pins the directory. `common` or `organizations` yields no `tid`, so a token's `iss` could belong to any Microsoft directory; reject that unpinned issuer (spec §8).
 */
function tenantsDoEntra(emissor: string): readonly string[] {
  const casado = /login\.microsoftonline\.com\/([^/]+)/.exec(emissor);
  const tid = casado?.[1];
  if (!tid || tid === 'common' || tid === 'organizations' || tid === 'consumers') {
    throw PipeError.request(
      'issuer_multi_tenant',
      'Use o emissor do diretório da empresa (com o id do tenant), não `common`: com `common` qualquer diretório da Microsoft entraria.',
    );
  }
  return [tid];
}

// The type lives in @pipe/contracts so all three login screens share the same response format; duplicate definitions would diverge when a field changes.
export type { RespostaDaDescoberta };

/**
 * Login discovery accepts an email and returns the same response for known and unknown addresses, except a verified domain with active SSO, which the tenant chose to make public. Otherwise the endpoint would reveal which companies use Pipe. Query public domains through the same path and discard after lookup to avoid a timing difference.
 */
export async function discoverInbound(emailCru: string | undefined): Promise<RespostaDaDescoberta> {
  const email = (emailCru ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    throw PipeError.request('email_invalid', 'Informe um e-mail.');
  }
  const domain = domainOfEmail(email);

  const { rows } = await databaseOwner().execute<{ slug: string }>(sql`
    select t.slug
      from dominio_tenant d
      join tenant t on t.id = d.tenant_id
      join conexao_sso c on c.tenant_id = d.tenant_id
     where d.dominio = ${domain}
       and d.verificado_em is not null
       and c.estado = 'ativa'
       and c.politica <> 'desligado'
       and t.ativo
     limit 1
  `);

  // Discard after lookup so `gmail.com` takes roughly the same time as a company domain. Public domains never route to SSO.
  // mapeasse `gmail.com` capturaria o login de meio Brasil.
  const slug = DOMINIOS_PUBLICOS.has(domain) ? undefined : rows[0]?.slug;
  // Return `google`, not `senha`: Pipe stores no passwords, and promising a nonexistent password field would mislead the screen.
  if (!slug) return { metodo: 'google' };
  return { metodo: 'sso', irPara: `/v1/auth/sso/${encodeURIComponent(slug)}` };
}

/**
 * `/e/<slug>` performs the same discovery by URL for personal-email users whom domain discovery cannot find, such as agency owners, contractors, and consultants on `@gmail.com`.
 */
export async function tenantBySlug(slug: string): Promise<string> {
  const { rows } = await databaseOwner().execute<{ id: string }>(
    sql`select id from tenant where slug = ${slug} and ativo limit 1`,
  );
  const id = rows[0]?.id;
  if (!id) throw PipeError.naoEncontrado('Empresa');
  return id;
}
