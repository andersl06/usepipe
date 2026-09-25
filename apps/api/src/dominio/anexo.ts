import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  StorageInDisk,
  VALIDITY_LINK_MS,
  assinar,
  assinaturaValida,
  keyOfAttachment,
  keyOfTenant,
  maxBytesDoMime,
  mimeAceito,
  mimeParaServir,
  serveAsAttachment,
  tipoDoMime,
} from '@pipe/storage';
import type { Storage } from '@pipe/storage';
import { keyringOfAmbiente } from '@pipe/db';
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';

/**
 * Anexo: subir, ler e montar o link.
 *
 * Ver `docs/specs/2026-09-07-storage-de-anexos.md`. Três regras que não se dobram:
 *
 * 1. **O tenant vem da credencial, e é o primeiro segmento da chave.** Um cliente
 *    nunca compartilha prefixo com outro.
 * 2. **Nada é servido por URL pública adivinhável por id.** Sai link assinado com 15
 *    minutos, o mesmo modelo de *file token* da Blip.
 * 3. **O tipo é carimbado pelos BYTES.** Extensão e `Content-Type` do upload são texto
 *    que o cliente escreveu; um `.png` que é HTML vira XSS na tela de quem abrir.
 */

let armazem: Storage | null = null;

export function storage(): Storage {
  armazem ??= new StorageInDisk();
  return armazem;
}

/** Só para teste: troca o backend sem subir infra. */
export function useStorage(novo: Storage | null): void {
  armazem = novo;
}

/**
 * O segredo que assina os links.
 *
 * Reaproveita o chaveiro que já protege o token da Meta — uma chave a menos para
 * rotacionar e um lugar a menos para vazar.
 */
function secretOfLink(): string {
  const keyring = keyringOfAmbiente();
  const chave = keyring.chaves.get(keyring.atual);
  if (!chave) throw new Error('chaveiro sem a chave atual: link de anexo não pode ser assinado');
  return chave.toString('base64');
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

  // O tipo real primeiro: o teto de tamanho depende dele, e um vídeo declarado como
  // PDF passaria pelo limite de 100 MB em vez do de 16 MB.
  const mime = mimeParaServir(pedido.mimeDeclarado, pedido.dados);
  if (!mimeAceito(mime)) {
    throw PipeError.request(
      'type_real_not_accepted',
      `O arquivo diz ser "${pedido.mimeDeclarado}", mas o conteúdo é "${mime}".`,
      { declarado: pedido.mimeDeclarado, real: mime },
    );
  }

  const teto = maxBytesDoMime(mime);
  if (pedido.dados.byteLength > teto) {
    throw PipeError.request(
      'file_large_excessive',
      `O arquivo tem ${mb(pedido.dados.byteLength)} MB e o limite para este tipo é ${mb(teto)} MB.`,
      { bytes: pedido.dados.byteLength, limite: teto },
    );
  }
  if (pedido.dados.byteLength === 0) {
    throw PipeError.request('file_empty', 'O arquivo está vazio.');
  }

  const key = keyOfAttachment(pedido.tenantId, pedido.nomeOriginal);
  const checksum = createHash('sha256').update(pedido.dados).digest('hex');

  // Grava no storage ANTES do banco: linha sem arquivo é anexo quebrado na tela;
  // arquivo sem linha é só lixo, e o disco aguenta.
  await storage().guardar(key, pedido.dados);

  const id = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original, checksum)
      values (${pedido.tenantId}, ${key}, ${mime}, ${pedido.dados.byteLength},
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
    bytes: pedido.dados.byteLength,
    tipo: tipoDoMime(mime),
    link: linkOfAttachment(id),
  };
}

/**
 * O link assinado de um anexo, com 15 minutos de validade.
 *
 * É esta URL que a Meta baixa quando mandamos mídia, e é ela que a tela usa. Absoluta
 * porque a Meta busca de fora — `PIPE_STORAGE_URL_BASE` deixa de apontar para um host
 * que não existe e passa a ser a base pública da própria `api`.
 */
export function linkOfAttachment(attachmentId: string, agora = Date.now()): string {
  const expira = agora + VALIDITY_LINK_MS;
  const assinatura = assinar(attachmentId, expira, secretOfLink());
  const base = (
    process.env['PIPE_STORAGE_URL_BASE'] ??
    process.env['PIPE_URL_API'] ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}/v1/attachments/${attachmentId}?expira=${expira}&assinatura=${assinatura}`;
}

export interface AttachmentForServe {
  data: Uint8Array;
  mime: string;
  nomeOriginal: string | null;
  /** `true` obriga download em vez de abrir inline. Ver `servirComoAnexo`. */
  asAttachment: boolean;
}

/**
 * Lê um anexo a partir de um link assinado.
 *
 * **Não exige sessão de propósito**: a Meta precisa baixar a mídia e não tem cookie
 * nosso. A credencial é a própria assinatura, e por isso ela é curta e por anexo.
 *
 * O tenant é o do ANEXO, resolvido do banco pelo id — não vem da URL. Assinatura
 * prova que o link saiu de nós; a conferência de prefixo prova que o arquivo é do
 * tenant daquele anexo.
 */
export async function readAttachmentSigned(
  anexoId: string,
  expira: number,
  assinatura: string,
  tenantIdOfAttachment: (id: string) => Promise<{ tenantId: string } | null>,
): Promise<AttachmentForServe> {
  if (!assinaturaValida(anexoId, expira, assinatura, secretOfLink())) {
    // Link vencido e link forjado dão a MESMA resposta: distinguir contaria a quem
    // tenta qual metade do palpite acertou.
    throw PipeError.naoAutorizado('Link inválido ou vencido.');
  }

  const dono = await tenantIdOfAttachment(anexoId);
  if (!dono) throw PipeError.naoEncontrado('Anexo');

  const linha = await noTenant(dono.tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      keyStorage: string;
      mime: string;
      nome_original: string | null;
    }>(sql`
      select chave_storage, mime, nome_original from anexo where id = ${anexoId}::uuid limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Anexo');

  // Cinto e suspensório: a chave gravada tem de estar na faixa do tenant dela.
  if (!keyOfTenant(linha.keyStorage, dono.tenantId)) {
    throw PipeError.naoEncontrado('Anexo');
  }

  const objeto = await storage().ler(linha.keyStorage);
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
