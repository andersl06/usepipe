import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  StorageInDisk,
  assinaturaValida,
  baseDoLinkDeAnexo,
  keyOfAttachment,
  keyOfTenant,
  linkAssinadoDeAnexo,
  maxBytesDoMime,
  mimeAceito,
  mimeParaServir,
  segredoDeLink,
  serveAsAttachment,
  tipoDoMime,
} from '@pipe/storage';
import type { Storage } from '@pipe/storage';
import { keyringOfEnvironment } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';

/**
 * Attachment upload, read and link generation follow `docs/specs/2026-09-07-storage-de-anexos.md`. Three invariants: the tenant comes from the credential and is the first storage-key segment, so customers never share a prefix; files are not served from guessable public ID URLs, but through 15-minute signed links like Blip *file tokens*; MIME type is determined from bytes because extension and uploaded `Content-Type` are client claims, and a `.png` containing HTML could execute script for the opener.
 */

let armazem: Storage | null = null;

export function storage(): Storage {
  armazem ??= new StorageInDisk();
  return armazem;
}

/** Test helper: replace the storage backend without starting infrastructure. */
export function useStorage(novo: Storage | null): void {
  armazem = novo;
}

/**
 * Use the existing keyring that protects Meta tokens to sign links, avoiding another key to rotate and another place a secret could leak.
 */
function secretOfLink(): string {
  return segredoDeLink(keyringOfEnvironment());
}

export interface AttachmentSaved {
  id: string;
  mime: string;
  bytes: number;
  tipo: 'imagem' | 'audio' | 'video' | 'documento';
  link: string;
}

export interface PedidoDeUpload {
  tenantId: string;
  nomeOriginal: string | null;
  mimeDeclarado: string;
  data: Uint8Array;
}

export async function saveAttachment(pedido: PedidoDeUpload): Promise<AttachmentSaved> {
  if (!mimeAceito(pedido.mimeDeclarado)) {
    throw PipeError.request(
      'type_not_accepted',
      `O tipo "${pedido.mimeDeclarado}" não é aceito.`,
      { mime: pedido.mimeDeclarado },
    );
  }

  // Determine the real type before applying the size cap: a video declared as
  // PDF passaria pelo limite de 100 MB em vez do de 16 MB.
  const mime = mimeParaServir(pedido.mimeDeclarado, pedido.data);
  if (!mimeAceito(mime)) {
    throw PipeError.request(
      'type_real_not_accepted',
      `O arquivo diz ser "${pedido.mimeDeclarado}", mas o conteúdo é "${mime}".`,
      { declarado: pedido.mimeDeclarado, real: mime },
    );
  }

  const teto = maxBytesDoMime(mime);
  if (pedido.data.byteLength > teto) {
    throw PipeError.request(
      'file_large_excessive',
      `O arquivo tem ${mb(pedido.data.byteLength)} MB e o limite para este tipo é ${mb(teto)} MB.`,
      { bytes: pedido.data.byteLength, limite: teto },
    );
  }
  if (pedido.data.byteLength === 0) {
    throw PipeError.request('file_empty', 'O arquivo está vazio.');
  }

  const key = keyOfAttachment(pedido.tenantId, pedido.nomeOriginal);
  const checksum = createHash('sha256').update(pedido.data).digest('hex');

  // Write to storage before the database: a row without a file is a broken attachment on screen;
  // a file without a row is only orphaned data that storage can tolerate.
  await storage().guardar(key, pedido.data);

  const id = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original, checksum)
      values (${pedido.tenantId}, ${key}, ${mime}, ${pedido.data.byteLength},
              ${pedido.nomeOriginal}, ${checksum})
      returning id
    `);
    const criado = rows[0]?.id;
    if (!criado) throw new Error('não gravou o anexo');
    return criado;
  });

  return {
    id,
    mime,
    bytes: pedido.data.byteLength,
    tipo: tipoDoMime(mime),
    link: linkOfAttachment(id),
  };
}

/**
 * Create a signed attachment URL valid for 15 minutes. Meta downloads this URL when we send media, and the screen also uses it. It must be absolute because Meta fetches externally, so it is built on the public API base (`PIPE_URL_API`), the host that verifies the signature. The delivery worker builds the same link with the same helper at send time.
 */
export function linkOfAttachment(attachmentId: string, agora = Date.now()): string {
  return linkAssinadoDeAnexo({
    anexoId: attachmentId,
    segredo: secretOfLink(),
    base: baseDoLinkDeAnexo(),
    agora,
  });
}

export interface AttachmentForServe {
  data: Uint8Array;
  mime: string;
  nomeOriginal: string | null;
  /** `true` obriga download em vez de abrir inline. Ver `servirComoAnexo`. */
  asAttachment: boolean;
}

/**
 * Read an attachment through a signed link without requiring a session: Meta must download media but has no Pipe cookie. The short-lived signature for one attachment is the credential. Resolve the tenant from the attachment ID in the database, never from the URL. The signature proves we issued the link; the storage-key prefix check proves the file belongs to that attachment's tenant.
 */
export async function readAttachmentSigned(
  anexoId: string,
  expira: number,
  assinatura: string,
  tenantIdOfAttachment: (id: string) => Promise<{ tenantId: string } | null>,
): Promise<AttachmentForServe> {
  if (!assinaturaValida(anexoId, expira, assinatura, secretOfLink())) {
    // Expired and forged links return the same response; distinguishing them would tell a guesser which part was correct.
    // tenta qual metade do palpite acertou.
    throw PipeError.naoAutorizado('Link inválido ou vencido.');
  }

  const dono = await tenantIdOfAttachment(anexoId);
  if (!dono) throw PipeError.naoEncontrado('Anexo');

  const linha = await noTenant(dono.tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      chave_storage: string;
      mime: string;
      nome_original: string | null;
    }>(sql`
      select chave_storage, mime, nome_original from anexo where id = ${anexoId}::uuid limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Anexo');

  // Check again that the stored key lies within its tenant's prefix.
  if (!keyOfTenant(linha.chave_storage, dono.tenantId)) {
    throw PipeError.naoEncontrado('Anexo');
  }

  const objeto = await storage().ler(linha.chave_storage);
  if (!objeto) throw PipeError.naoEncontrado('Anexo');

  return {
    data: objeto.data,
    mime: linha.mime,
    nomeOriginal: linha.nome_original,
    asAttachment: serveAsAttachment(linha.mime),
  };
}

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(0);
}
