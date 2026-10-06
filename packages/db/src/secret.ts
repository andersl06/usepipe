import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Encrypt tenant secrets at rest.
 *
 * `canal.config` holds Meta's permanent token, `appSecret`, `verifyToken`, and the SMTP password. A token holder can send messages **as the tenant's number**. The schema promised at-rest encryption from the start; this file implements it.
 *
 * RLS protects tenants through the application, but not a dump. Backups reach object storage and operator machines; a plaintext `pg_dump` would reveal EVERY tenant credential.
 *
 * **An envelope carries the key ID.** Rotate by making a new key current while retaining old keys until their data is rewritten. Without IDs, rotation would demand a one-shot migration and would tend never to happen.
 *
 * **AES-256-GCM, not CBC:** GCM authenticates ciphertext as well as encrypting it. Otherwise a database writer could tamper with ciphertext undetected; targeted corruption of `phoneNumberId` could route messages to the wrong number.
 *
 * Keys live OUTSIDE the database in `PIPE_CHAVES_SEGREDO` as comma-separated `<id>:<32 bytes em base64>` entries; `PIPE_CHAVE_SEGREDO_ATUAL` selects the current one. Production supplies them through SOPS (see `infra/`).
 */

/** Envelope marker. No dot in its name because dots separate envelope fields. */
const MARCA = 'pipev1';

export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SegredoErro';
  }
}

export interface Keyring {

  atual: string;
  /** Todas as chaves conhecidas, inclusive as antigas ainda em uso. */
  chaves: Map<string, Buffer>;
}

/**
 * Read the keyring from the environment and fail loudly. A missing production key is a deployment error; continuing would write tokens in plaintext while appearing to encrypt them.
 */
export function keyringOfEnvironment(env: NodeJS.ProcessEnv = process.env): Keyring {
  const cru = env['PIPE_CHAVES_SEGREDO'];
  if (!cru) throw new SecretError('PIPE_CHAVES_SEGREDO não está definida.');

  const chaves = new Map<string, Buffer>();
  for (const parte of cru.split(',')) {
    const limpo = parte.trim();
    if (!limpo) continue;
    const corte = limpo.indexOf(':');
    if (corte <= 0) throw new SecretError('Chave sem id: use `<id>:<base64>`.');
    const id = limpo.slice(0, corte);
    const material = Buffer.from(limpo.slice(corte + 1), 'base64');
    if (material.length !== 32) {
      throw new SecretError(`A chave "${id}" não tem 32 bytes: AES-256 exige exatamente isso.`);
    }
    chaves.set(id, material);
  }
  if (chaves.size === 0) throw new SecretError('PIPE_CHAVES_SEGREDO está vazia.');

  const atual = env['PIPE_CHAVE_SEGREDO_ATUAL'] ?? [...chaves.keys()][0]!;
  if (!chaves.has(atual)) {
    throw new SecretError(`PIPE_CHAVE_SEGREDO_ATUAL="${atual}" não está no chaveiro.`);
  }
  return { atual, chaves };
}

/** `pipev1.<idChave>.<iv>.<tag>.<cifrado>`, tudo em base64url menos a marca e o id. */
export function cifrar(texto: string, chaveiro: Keyring): string {
  const chave = chaveiro.chaves.get(chaveiro.atual);
  if (!chave) throw new SecretError('A chave atual sumiu do chaveiro.');

  const iv = randomBytes(12); // 96 bits: o tamanho que o GCM espera, e o único seguro com nonce aleatório
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const dado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();

  return [
    MARCA,
    chaveiro.atual,
    iv.toString('base64url'),
    tag.toString('base64url'),
    dado.toString('base64url'),
  ].join('.');
}


export function estaCifrado(value: string): boolean {
  return value.startsWith(`${MARCA}.`);
}

export function decifrar(pacote: string, keyring: Keyring): string {
  if (!estaCifrado(pacote)) {
    throw new SecretError('O valor não está cifrado: decifrar texto claro esconderia o defeito.');
  }
  const partes = pacote.split('.');
  if (partes.length !== 5) throw new SecretError('Envelope malformado.');
  const [, idKey, ivB64, tagB64, dadoB64] = partes as [string, string, string, string, string];

  const key = keyring.chaves.get(idKey);
  if (!key) {
    throw new SecretError(
      `A chave "${idKey}" não está no chaveiro: ela cifrou este dado e não pode ser descartada.`,
    );
  }

  const decifra = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decifra.setAuthTag(Buffer.from(tagB64, 'base64url'));
  try {
    return Buffer.concat([
      decifra.update(Buffer.from(dadoB64, 'base64url')),
      decifra.final(),
    ]).toString('utf8');
  } catch {
    // GCM `final()` throws when the authentication tag is wrong. Do not expose the original error:
    // authentication-failure detail can become an oracle.
    throw new SecretError('Autenticação falhou: o dado cifrado foi alterado ou a chave é outra.');
  }
}

/**
 * Secret fields in `canal.config`.
 *
 * Use a closed list instead of encrypting the whole object: other configuration must remain readable and queryable. `phoneNumberId` appears in diagnostics and `apiVersao` in support. Encrypting everything would require decryption for ordinary operations.
 */
export const FIELDS_SECRET_OF_CHANNEL = [
  'tokenAcesso',
  'appSecret',
  'verifyToken',
  'senhaSmtp',
  'clientSecret',
  // Two-step PIN saved when registering the number (`configuracao-de-webhook.ts`).
  // With it, someone controlling the number could migrate the tenant's WhatsApp to another provider.
  'pinVerificacao',
  // Pipe Chat visitor-token HMAC secret; never returned by any endpoint.
  'widgetSecret',
] as const;

type Config = Record<string, unknown>;


export function cifrarConfig(config: Config, chaveiro: Keyring): Config {
  const saida: Config = { ...config };
  for (const campo of FIELDS_SECRET_OF_CHANNEL) {
    const value = saida[campo];
    if (typeof value !== 'string' || value === '' || estaCifrado(value)) continue;
    saida[campo] = cifrar(value, chaveiro);
  }
  return saida;
}

/**
 * Decrypt secret fields on read.
 *
 * Plaintext values pass through deliberately, and only here, so data written before encryption was introduced remains readable without disrupting operations. The write path has no such tolerance; new data is encrypted.
 */
export function decifrarConfig(config: Config, chaveiro: Keyring): Config {
  const saida: Config = { ...config };
  for (const campo of FIELDS_SECRET_OF_CHANNEL) {
    const valor = saida[campo];
    if (typeof valor !== 'string' || !estaCifrado(valor)) continue;
    saida[campo] = decifrar(valor, chaveiro);
  }
  return saida;
}


export function secretChecks(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
