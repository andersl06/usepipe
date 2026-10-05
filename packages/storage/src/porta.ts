import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { VALIDITY_LINK_MS } from './limites.js';

/**
 * The storage port follows the S3 shape.
 *
 * "S3 shape" means **bucket + opaque key + object**, without exposing filesystem paths to callers. Moving to S3, R2, or MinIO requires another implementation of this interface; callers do not change.
 *
 * TODAY we use disk storage on a volume rather than MinIO for three reasons:
 *
 * 1. **RAM is the bottleneck in this infrastructure.** We measured about 1.9 GB per CRM instance (`2026-09-07-integracao-twenty.md` section 5.3). Another VPS container consumes the resource already under pressure.
 * 2. **The required compatibility is at the INTERFACE**, provided here. The S3 protocol need not run on this machine for callers to be ready for it.
 * 3. **Our signed URL is simple.** Blip uses neither a public bucket nor presigning: it uses a *15-minute file token*. That is what `assinar` provides with HMAC using the keyring that already protects other secrets.
 *
 * ponytail: disk storage on one host has no replication. If `api` runs on multiple machines, a file written on one will not appear on another; add an S3 backend as a new implementation of this interface then.
 */

export interface ObjetoGuardado {

  key: string;
  bytes: number;
}

export interface ObjetoLido {
  data: Uint8Array;
  bytes: number;
}

export interface Storage {
  guardar(key: string, data: Uint8Array): Promise<ObjetoGuardado>;
  ler(chave: string): Promise<ObjetoLido | null>;
  remover(chave: string): Promise<void>;
}

/**
 * An attachment key. **`tenantId` is always the first segment.**
 *
 * This isolates tenants by object path: tenants never share a prefix, and the prefix access policy is already defined if this becomes an S3 bucket. The trailing `uuid` prevents guessing another tenant's object even if its `tenant_id` is known.
 */
export function keyOfAttachment(tenantId: string, nomeOriginal: string | null): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${ano}/${mes}/${randomUUID()}${extensaoDe(nomeOriginal)}`;
}

/**
 * The extension only makes the downloaded file look like a file. It **never** determines type; `tipoReal` does.
 */
function extensaoDe(nome: string | null): string {
  const ponto = (nome ?? '').lastIndexOf('.');
  if (ponto < 1) return '';
  const bruta = (nome ?? '').slice(ponto + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(bruta) ? `.${bruta}` : '';
}

/**
 * Reject keys outside the tenant prefix.
 *
 * This defends against `../` and another tenant's ID in the URL. It matters even for signed links: a signature proves we issued the link, not that it belongs to the right tenant.
 */
export function keyOfTenant(chave: string, tenantId: string): boolean {
  if (chave.includes('..') || chave.startsWith('/') || chave.includes('\\')) return false;
  return chave.startsWith(`${tenantId}/`);
}

export interface LinkAssinado {
  expiraEm: number;
  assinatura: string;
}

/**
 * Sign `<anexoId>.<expiraEm>` with HMAC-SHA256.
 *
 * The secret comes from the keyring (`PIPE_CHAVES_SEGREDO`), which also encrypts the Meta token. Possessing the link grants access until expiry, so the lifetime is short and matches Blip's: 15 minutes.
 */
export function assinar(attachmentId: string, expiraEm: number, segredo: string): string {
  return createHmac('sha256', segredo).update(`${attachmentId}.${expiraEm}`).digest('hex');
}

/** Check signature and expiry using a constant-time comparison. */
export function assinaturaValida(
  anexoId: string,
  expiraEm: number,
  assinatura: string,
  secret: string,
  agora = Date.now(),
): boolean {
  if (!Number.isFinite(expiraEm) || expiraEm <= agora) return false;
  const esperada = Buffer.from(assinar(anexoId, expiraEm, secret));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}

/** Keyring shape needed to derive the link secret; structural so this package need not depend on `@pipe/db`. */
export interface ChaveiroDeLink {
  atual: string;
  chaves: Map<string, Buffer>;
}

/**
 * Derive the link-signing secret from the keyring that already protects Meta tokens, avoiding another key to rotate. API and worker call this with the same keyring, so a link built by one is verified by the other.
 */
export function segredoDeLink(chaveiro: ChaveiroDeLink): string {
  const chave = chaveiro.chaves.get(chaveiro.atual);
  if (!chave) throw new Error('chaveiro sem a chave atual: link de anexo não pode ser assinado');
  return chave.toString('base64');
}

/**
 * Public base of the API that serves attachments (`PIPE_URL_API`). It is NOT the storage or site host: Meta downloads the link from outside, and only the API checks signature, expiry and tenant before serving the file.
 */
export function baseDoLinkDeAnexo(env: NodeJS.ProcessEnv = process.env): string {
  return (env['PIPE_URL_API'] || 'http://localhost:3000').replace(/\/$/, '');
}

export interface PedidoDeLink {
  anexoId: string;
  segredo: string;
  /** Absolute API base, no trailing slash needed. */
  base: string;
  agora?: number;
}

/**
 * Build the absolute signed URL `<base>/v1/attachments/:id?expires&signature`, valid for 15 minutes. The link expires, so whoever delivers later (outbox retry) must call this again at delivery time.
 */
export function linkAssinadoDeAnexo(pedido: PedidoDeLink): string {
  const expira = (pedido.agora ?? Date.now()) + VALIDITY_LINK_MS;
  const assinatura = assinar(pedido.anexoId, expira, pedido.segredo);
  const base = pedido.base.replace(/\/$/, '');
  return `${base}/v1/attachments/${pedido.anexoId}?expires=${expira}&signature=${assinatura}`;
}
