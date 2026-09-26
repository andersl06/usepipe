import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Google login through OpenID Connect using authorization code with PKCE. Three measures close known attacks:
 *
 * 1. Verify `id_token` against Google JWKS with issuer and audience checks. An unsigned or unchecked token lets anyone assemble a JSON identity.
 * 2. Generate and check per-attempt `state` and `nonce`. `state` prevents login CSRF, where a victim enters the attacker's account; `nonce` prevents replay of a captured `id_token`.
 * 3. Use PKCE even with a client secret, protecting an authorization code leaked in transit.
 *
 * The account key is `(emissor, sujeito)`, NEVER email. Email ownership can change inside a company; a successor must not inherit the previous user's account. Require `email_verified` too, or a person who creates a Google account with someone else's address could enter as them.
 */


export const GOOGLE = {
  emissor: 'https://accounts.google.com',
  autorizacao: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
} as const;

export class LoginError extends Error {
  constructor(
    readonly codigo: string,
    message: string,
  ) {
    super(message);
    this.name = 'LoginErro';
  }
}

export interface ConfigDoGoogle {
  clienteId: string;
  customerSecret: string;
  /** Precisa bater EXATAMENTE com o cadastrado no Google Cloud Console. */
  urlOfCallback: string;
}

export function configDoAmbiente(env: NodeJS.ProcessEnv = process.env): ConfigDoGoogle {
  const clienteId = env['GOOGLE_CLIENTE_ID'];
  const customerSecret = env['GOOGLE_CLIENTE_SEGREDO'];
  const urlOfCallback = env['GOOGLE_URL_RETORNO'];
  if (!clienteId || !customerSecret || !urlOfCallback) {
    throw new LoginError(
      'google_sem_config',
      'Faltam GOOGLE_CLIENTE_ID, GOOGLE_CLIENTE_SEGREDO ou GOOGLE_URL_RETORNO.',
    );
  }
  return { clienteId, customerSecret, urlOfCallback };
}

/** Values that must survive the outbound and return legs, stored in a signed cookie. */
export interface DesafioDeLogin {
  state: string;
  nonce: string;
  verificadorPkce: string;
  /** Para onde voltar depois de entrar. Caminho interno, nunca URL absoluta. */
  destination: string;
}

export function createChallenge(destination = '/'): DesafioDeLogin {
  return {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    verificadorPkce: randomBytes(32).toString('base64url'),
    // Allow only an internal path. An absolute destination would create an open redirect,
    // letting attackers use our domain as a phishing trampoline.
    destination: destination.startsWith('/') && !destination.startsWith('//') ? destination : '/',
  };
}

export function urlOfAuthorization(config: ConfigDoGoogle, desafio: DesafioDeLogin): string {
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
    // Without `prompt=select_account`, users with multiple accounts always enter the last one.
    prompt: 'select_account',
  });
  return `${GOOGLE.autorizacao}?${parametros.toString()}`;
}

/**
 * The identity asserted by the provider, Google or the tenant IdP, in the same shape.
 *
 * `sujeito` is the stable identifier IN THE PROVIDER and pairs with `emissor` as the actual account key: `sub` for Google and standard OIDC, `{tid}:{oid}` for Entra (see `oidc.ts`). `emailVerificado` states whether the provider confirmed ownership of the email domain; it controls whether this identity may be matched to an existing user.
 */
export interface PessoaExterna {
  emissor: string;
  sujeito: string;
  email: string;
  emailVerificado: boolean;
  nome: string | undefined;
  avatarUrl: string | undefined;
}


export type PessoaDoGoogle = PessoaExterna;

const jwks = createRemoteJWKSet(new URL(GOOGLE.jwks));

/**
 * Exchange the code for an `id_token` and verify it.
 *
 * `buscar` is injectable so tests can exercise the Google-facing exchange without network access or a real secret.
 */
export async function exchangeCode(
  config: ConfigDoGoogle,
  desafio: DesafioDeLogin,
  parametros: { code?: string; state?: string; error?: string },
  buscar: typeof fetch = fetch,
  chaves: Parameters<typeof jwtVerify>[1] = jwks,
): Promise<PessoaDoGoogle> {
  if (parametros.error) {
    throw new LoginError('google_recusou', `O Google recusou: ${parametros.error}`);
  }
  if (!parametros.code) throw new LoginError('sem_codigo', 'A volta do Google veio sem código.');

  // A simple comparison is sufficient: `state` is ours, generated for this attempt, and not a
  // long-lived secret. The returned value only needs to equal the one we sent.
  if (!parametros.state || parametros.state !== desafio.state) {
    throw new LoginError('state_invalido', 'O `state` não confere: tentativa de login forjada.');
  }

  const resposta = await buscar(GOOGLE.token, {
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

  return verificarIdToken(corpo.id_token, config, desafio.nonce, chaves);
}

export async function verificarIdToken(
  idToken: string,
  config: ConfigDoGoogle,
  nonce: string,
  chaves: Parameters<typeof jwtVerify>[1] = jwks,
): Promise<PessoaDoGoogle> {
  const { payload } = await jwtVerify(idToken, chaves, {
    issuer: [GOOGLE.emissor, 'accounts.google.com'],
    audience: config.clienteId,
  });

  if (payload['nonce'] !== nonce) {
    throw new LoginError('nonce_invalido', 'O `nonce` não confere: token reaproveitado.');
  }

  const sujeito = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
  if (!sujeito || !email) {
    throw new LoginError('token_incompleto', 'O `id_token` veio sem `sub` ou sem `email`.');
  }

  // Without this, someone who creates a Google account with another person's address could sign in
  // as that person. Google sets `email_verified` for Workspace and Gmail accounts;
  // its absence requires rejection, not tolerance.
  if (payload['email_verified'] !== true) {
    throw new LoginError('email_nao_verificado', 'O Google não confirmou este e-mail.');
  }

  return {
    emissor: GOOGLE.emissor,
    sujeito,
    email,
    // Sempre `true`: a linha acima recusa qualquer outra coisa.
    emailVerificado: true,
    nome: typeof payload['name'] === 'string' ? payload['name'] : undefined,
    avatarUrl: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
  };
}


export function domainOfEmail(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/**
 * Personal email domains never identify a company.
 *
 * They cannot select an existing tenant by domain: entry requires an invitation, or the Google self-service path creates a new account when `criarConta` is provided. Without this list, the first tenant to register `gmail.com` could claim everyone using Gmail.
 */
export const DOMINIOS_PUBLICOS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'proton.me',
  'protonmail.com',
]);

export function ehDomainPublic(email: string): boolean {
  return DOMINIOS_PUBLICOS.has(domainOfEmail(email));
}
