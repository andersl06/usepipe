import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { PROVEDORES_SSO } from '@pipe/db/schema';
import { LoginError } from './google.js';
import type { DesafioDeLogin, PessoaExterna } from './google.js';

/**
 * Generic OIDC uses the `google.ts` flow with a provider from the database. Google has a fixed issuer, so it needs no discovery. A tenant issuer may be Microsoft Entra ID, Google Workspace, or Okta. Only three things vary: endpoints discovered through `.well-known`, subject extraction, and verified-email interpretation.
 *
 * The invariants are JWKS signature validation with exact `iss` and `aud`, per-attempt `state`, `nonce`, and PKCE from `createChallenge`, and `(emissor, sujeito)` as the account key rather than email.
 *
 * The traps in `referencias-blip/pesquisa/sso-multi-tenant.md` section 8 are called out below. When implemented incorrectly, they silently grant login rather than raise errors.
 */

/**
 * The IdP kind matters: Entra obtains subject and verified-email status differently; treating it like every other provider creates the section 8 vulnerability.
 *
 * The provider list comes from the schema, which repeats it in a database `check`. Separate lists could let code accept a provider that the database rejects.
 */
export type ProvedorSso = (typeof PROVEDORES_SSO)[number];

export interface ConfigOidc {
  provedor: ProvedorSso;

  emissor: string;
  clienteId: string;
  customerSecret: string;
  /** Precisa bater EXATAMENTE com o cadastrado no IdP. */
  urlOfCallback: string;
  /**
   * Allowed `tid` values for a multitenant Entra app.
   *
   * Without this list, **any Microsoft directory can enter**: a multitenant app's `iss` belongs to the signing-in directory, so issuer-shape validation alone admits them all. This is the unfixed-issuer trap from section 8.
   */
  tenantsEntra?: readonly string[] | undefined;
}

export interface DescobertaOidc {
  emissor: string;
  authorization: string;
  token: string;
  jwks: string;
}

interface DocumentOfDiscovery {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  jwks_uri?: unknown;
}

/**
 * Read the issuer's `.well-known/openid-configuration`. Two security checks matter:
 *
 * 1. Require HTTPS. Plaintext discovery lets an intermediary choose the entire document, including `jwks_uri`.
 * 2. Require the document's `issuer` to equal the requested issuer. This prevents one issuer from impersonating another and taking over `iss` validation (RFC 8414 section 3.3 and the IdP mix-up attack family).
 */
export async function descobrir(
  emissor: string,
  buscar: typeof fetch = fetch,
): Promise<DescobertaOidc> {
  const base = emissor.replace(/\/$/, '');
  if (!base.startsWith('https://')) {
    throw new LoginError('emissor_inseguro', 'O emissor precisa ser https.');
  }

  let document: DocumentOfDiscovery;
  try {
    const resposta = await buscar(`${base}/.well-known/openid-configuration`);
    if (!resposta.ok) {
      throw new LoginError('descoberta_falhou', `A descoberta falhou (${resposta.status}).`);
    }
    document = (await resposta.json()) as DocumentOfDiscovery;
  } catch (error) {
    if (error instanceof LoginError) throw error;
    throw new LoginError('descoberta_falhou', `Não consegui ler a configuração de ${base}.`);
  }

  const { issuer, authorization_endpoint, token_endpoint, jwks_uri } = document;
  if (
    typeof issuer !== 'string' ||
    typeof authorization_endpoint !== 'string' ||
    typeof token_endpoint !== 'string' ||
    typeof jwks_uri !== 'string'
  ) {
    throw new LoginError('descoberta_incompleta', 'A configuração veio sem os endpoints do OIDC.');
  }

  if (issuer.replace(/\/$/, '') !== base) {
    throw new LoginError(
      'emissor_divergente',
      `A configuração de ${base} se declara emissora de "${issuer}".`,
    );
  }

  return { emissor: issuer, authorization: authorization_endpoint, token: token_endpoint, jwks: jwks_uri };
}

/**
 * The trip to the IdP uses the same challenge as Google. `criarDesafio` serves both deliberately: `state`, `nonce`, and the PKCE verifier are provider-independent.
 */
export function urlOfAuthorizationOidc(
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  desafio: DesafioDeLogin,
): string {
  const desafioPkce = createHash('sha256').update(desafio.verificadorPkce).digest('base64url');
  const parametros = new URLSearchParams({
    client_id: config.clienteId,
    redirect_uri: config.urlOfCallback,
    response_type: 'code',
    scope: 'openid email profile',
    state: desafio.state,
    nonce: desafio.nonce,
    code_challenge: desafioPkce,
    code_challenge_method: 'S256',
  });
  return `${descoberta.authorization}?${parametros.toString()}`;
}

/**
 * Cache JWKS by issuer. `createRemoteJWKSet` already caches keys and handles rotation internally. Creating one per login would refetch on every entry and turn a tenant certificate rotation into a burst of requests to its IdP.
 */
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function chavesDe(descoberta: DescobertaOidc): ReturnType<typeof createRemoteJWKSet> {
  let chaves = jwksByIssuer.get(descoberta.jwks);
  if (!chaves) {
    chaves = createRemoteJWKSet(new URL(descoberta.jwks));
    jwksByIssuer.set(descoberta.jwks, chaves);
  }
  return chaves;
}


export async function exchangeCodeOidc(
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  desafio: DesafioDeLogin,
  parametros: { code?: string; state?: string; error?: string },
  buscar: typeof fetch = fetch,
  chaves?: Parameters<typeof jwtVerify>[1],
): Promise<PessoaExterna> {
  if (parametros.error) {
    throw new LoginError('provedor_recusou', `O provedor recusou: ${parametros.error}`);
  }
  if (!parametros.code) throw new LoginError('sem_codigo', 'A volta do provedor veio sem código.');
  if (!parametros.state || parametros.state !== desafio.state) {
    throw new LoginError('state_invalido', 'O `state` não confere: tentativa de login forjada.');
  }

  const resposta = await buscar(descoberta.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: parametros.code,
      client_id: config.clienteId,
      client_secret: config.customerSecret,
      redirect_uri: config.urlOfCallback,
      grant_type: 'authorization_code',
      code_verifier: desafio.verificadorPkce,
    }),
  });

  if (!resposta.ok) {
    throw new LoginError('troca_falhou', `A troca do código falhou (${resposta.status}).`);
  }
  const corpo = (await resposta.json()) as { id_token?: string };
  if (!corpo.id_token) throw new LoginError('sem_id_token', 'A resposta veio sem `id_token`.');

  return verificarIdTokenOidc(corpo.id_token, config, descoberta, desafio.nonce, chaves);
}

export async function verificarIdTokenOidc(
  idToken: string,
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  nonce: string,
  chaves: Parameters<typeof jwtVerify>[1] = chavesDe(descoberta),
): Promise<PessoaExterna> {
  // Check exact `issuer` and `audience`. Without `audience`, an assertion issued for another
  // application could pass here; in Entra, the attacker only needs their own app.
  const { payload } = await jwtVerify(idToken, chaves, {
    issuer: emissoresAceitos(config, descoberta),
    audience: config.clienteId,
  });

  if (payload['nonce'] !== nonce) {
    throw new LoginError('nonce_invalido', 'O `nonce` não confere: token reaproveitado.');
  }

  // With multiple `aud` values, `azp` identifies the authorized party. Without this check, a
  // token issued for another client that also lists us would pass.
  if (Array.isArray(payload.aud) && payload['azp'] !== config.clienteId) {
    throw new LoginError('azp_invalido', 'O token foi emitido para outro aplicativo.');
  }

  if (config.provedor === 'entra') conferirTenantDoEntra(config, payload);

  const sujeito = sujeitoDoToken(config.provedor, payload);
  const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
  if (!sujeito || !email) {
    throw new LoginError('token_incompleto', 'O `id_token` veio sem sujeito ou sem `email`.');
  }

  return {
    emissor: descoberta.emissor,
    sujeito,
    email,
    emailVerificado: emailVerificado(config.provedor, payload),
    nome: typeof payload['name'] === 'string' ? payload['name'] : undefined,
    avatarUrl: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
  };
}

/**
 * In multitenant Entra, `iss` is `https://login.microsoftonline.com/{tid}/v2.0`, while discovery uses `{tenantid}` as a placeholder. Accept issuers for declared `tid` values only.
 */
function emissoresAceitos(config: ConfigOidc, descoberta: DescobertaOidc): string[] {
  const tids = config.tenantsEntra ?? [];
  if (config.provedor !== 'entra' || tids.length === 0) return [descoberta.emissor];
  return tids.map((tid) => descoberta.emissor.replace('{tenantid}', tid));
}

function conferirTenantDoEntra(config: ConfigOidc, payload: Record<string, unknown>): void {
  const tids = config.tenantsEntra ?? [];
  if (tids.length === 0) return;
  const tid = payload['tid'];
  if (typeof tid !== 'string' || !tids.includes(tid)) {
    throw new LoginError(
      'tenant_do_idp_invalido',
      'O token veio de outro diretório da Microsoft, não do diretório desta conta.',
    );
  }
}

/**
 * The stable account subject.
 *
 * **For Entra, use `{tid}:{oid}`, NEVER `sub`.** `sub` is pairwise per app registration, so recreating an app changes every user's `sub` and orphans all linked accounts. `oid` is the stable directory user ID; the `tid` prefix prevents collisions across directories.
 */
export function sujeitoDoToken(provedor: ProvedorSso, payload: Record<string, unknown>): string {
  if (provedor === 'entra') {
    const tid = payload['tid'];
    const oid = payload['oid'];
    if (typeof tid !== 'string' || typeof oid !== 'string') return '';
    return `${tid}:${oid}`;
  }
  return typeof payload['sub'] === 'string' ? payload['sub'] : '';
}

/**
 * Has the domain owner verified this email?
 *
 * **Entra does not emit `email_verified`.** Treating absence as false breaks Entra; treating it as true creates the section 8 vulnerability. Microsoft's equivalent is optional `xms_edov`, which the organization must enable in its app registration. Without it, the answer is unknown and therefore false here. Federated SAML/WS-Fed accounts lack a verified domain and report `xms_edov` false, as required.
 */
export function emailVerificado(provedor: ProvedorSso, payload: Record<string, unknown>): boolean {
  if (provedor === 'entra') return payload['xms_edov'] === true;
  return payload['email_verified'] === true;
}
