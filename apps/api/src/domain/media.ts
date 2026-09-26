import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { decifrarConfig, estaCifrado } from '@pipe/db';
import { esperaMs } from '@pipe/workers';
import type { JobMedia } from '@pipe/workers';
import { keyOfAttachment, maxBytesDoMime, mimeParaServir } from '@pipe/storage';
import { databaseOwner, keyring, noTenant } from '../database.js';
import { storage } from './attachment.js';

/**
 * Download inbound WhatsApp and Instagram media to Pipe storage. `dominio/entrada.ts` initially saves WhatsApp `chave_storage = 'meta:<media_id>'` or an Instagram CDN URL with `bytes = 0`; these external references expire, so download outside the webhook. WhatsApp `GET /{versao}/{media_id}` with the channel Bearer returns `{ url, mime_type, file_size, sha256 }`; fetch the roughly five-minute URL with the same Bearer. Instagram CDN URLs download without a token. To prevent SSRF, allow HTTPS and Meta hosts only. Validate both Graph's returned URL and Instagram's webhook URL: each is untrusted external text. Both media URLs must use `https`.
 */

export const MAX_TENTATIVAS_DOWNLOAD = Number(process.env['PIPE_MIDIA_MAX_TENTATIVAS'] ?? 5);

const URL_BASE_GRAPH = 'https://graph.facebook.com';
const VERSAO_PADRAO_GRAPH = process.env['WHATSAPP_API_VERSAO'] ?? 'v26.0';

/**
 * Permitted Meta media hosts: `graph.facebook.com` for WhatsApp metadata, `lookaside.fbsbx.com` for WhatsApp Cloud API media, `*.fbcdn.net` for Meta CDN including `scontent*.xx.fbcdn.net`, and `*.cdninstagram.com` for Instagram Direct CDN.
 */
const HOSTS_PERMITIDOS: readonly RegExp[] = [
  /^graph\.facebook\.com$/,
  /^lookaside\.fbsbx\.com$/,
  /(^|\.)fbcdn\.net$/,
  /(^|\.)cdninstagram\.com$/,
];

export function hostOfMediaAllowed(bruto: string): boolean {
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && HOSTS_PERMITIDOS.some((re) => re.test(url.hostname));
}

/** Injectable HTTP fetch so tests use a fake without touching `cliente-graph.ts`. */
let buscar: typeof fetch = fetch;
export function defineSearchOfMedia(novo: typeof fetch | null): void {
  buscar = novo ?? fetch;
}

interface InfoOfMedia {
  url?: string;
  mime_type?: string;
  sha256?: string;
}

type LineAttachment = {
  id: string;
  keyStorage: string;
  mime: string;
  nome_original: string | null;
  checksum: string | null;
  download_tentativas: number;
  channelType: string | null;
  channelConfig: Record<string, unknown> | null;
};

export type ResultadoDownload =
  | { state: 'ignorado' }
  | { state: 'baixado' }
  | { state: 'reagendado' }
  | { state: 'falhou'; motivo: string };

type Baixado = { mime: string; bytes: Uint8Array; sha256Esperado?: string | undefined };
type FalhaPermanente = { errorPermanent: string };

/**
 * Download one attachment's media, called by the queue consumer after inbound commit and by the periodic sweep.
 */
export async function downloadMediaOfAttachment(tenantId: string, attachmentId: string): Promise<ResultadoDownload> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineAttachment>(sql`
      select a.id, a.chave_storage as "keyStorage", a.mime, a.nome_original, a.checksum,
             a.download_tentativas, ca.tipo as "channelType", ca.config as "channelConfig"
        from anexo a
        left join canal ca on ca.id = a.canal_id
       where a.id = ${attachmentId}::uuid and a.bytes = 0
       limit 1
    `);
    return rows[0] ?? null;
  });

  // The attachment disappeared or another attempt already downloaded it; enqueue and sweep may race, so treat this as an idempotent no-op.
  if (!linha) return { state: 'ignorado' };
  if (!linha.channelType) {
    return marcarFalha(tenantId, linha, 'Anexo sem canal: não há de onde baixar a mídia.');
  }

  try {
    const baixado =
      linha.channelType === 'whatsapp_cloud'
        ? await baixarDoWhatsApp(linha)
        : await baixarDoInstagram(linha);
    if ('errorPermanent' in baixado) return marcarFalha(tenantId, linha, baixado.errorPermanent);

    const mimeFinal = mimeParaServir(baixado.mime, baixado.bytes);
    const teto = maxBytesDoMime(mimeFinal);
    if (baixado.bytes.byteLength > teto) {
      return marcarFalha(
        tenantId,
        linha,
        `Baixado com ${baixado.bytes.byteLength} bytes, acima do limite de ${teto} para "${mimeFinal}".`,
      );
    }

    const checksum = createHash('sha256').update(baixado.bytes).digest('hex');
    if (baixado.sha256Esperado && checksum !== baixado.sha256Esperado.toLowerCase()) {
      return marcarFalha(tenantId, linha, 'O sha256 do arquivo baixado não bate com o que a Meta informou.');
    }

    const key = keyOfAttachment(tenantId, linha.nome_original);
    await storage().guardar(key, baixado.bytes);

    await noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        update anexo
           set chave_storage = ${key}, mime = ${mimeFinal}, bytes = ${baixado.bytes.byteLength},
               checksum = ${checksum}, download_tentativas = 0, download_erro = null,
               download_proxima_tentativa_em = null
         where id = ${attachmentId}::uuid
      `);
    });
    return { state: 'baixado' };
  } catch (error) {
    return reagendarOuDesistir(tenantId, linha, (error as Error).message);
  }
}

async function baixarDoWhatsApp(linha: LineAttachment): Promise<Baixado | FalhaPermanente> {
  const mediaId = linha.keyStorage.startsWith('meta:') ? linha.keyStorage.slice(5) : null;
  if (!mediaId) {
    return { errorPermanent: `"${linha.keyStorage}" não é uma referência de mídia da Meta.` };
  }

  const config = configDecifrada(linha.channelConfig);
  const token = typeof config['tokenAcesso'] === 'string' ? config['tokenAcesso'] : null;
  if (!token) return { errorPermanent: 'O canal não tem tokenAcesso em canal.config.' };
  const versao = typeof config['apiVersao'] === 'string' ? config['apiVersao'] : VERSAO_PADRAO_GRAPH;

  // Treat network and HTTP errors as temporary and let the caller reschedule. The media URL expires in about five minutes, so the next attempt obtains a fresh URL.
  const info = await pedirJson<InfoOfMedia>(
    `${URL_BASE_GRAPH}/${versao}/${mediaId}`,
    token,
    'A busca dos metadados da mídia falhou',
  );
  if (!info.url) return { errorPermanent: 'A Meta não devolveu a URL de download da mídia.' };
  if (!hostOfMediaAllowed(info.url)) {
    return { errorPermanent: `Host de mídia fora da lista permitida: ${new URL(info.url).hostname}.` };
  }

  const bytes = await pedirBytes(info.url, token, 'O download da mídia falhou');
  return { mime: info.mime_type ?? linha.mime, bytes, sha256Esperado: info.sha256 ?? linha.checksum ?? undefined };
}

async function baixarDoInstagram(linha: LineAttachment): Promise<Baixado | FalhaPermanente> {
  if (!hostOfMediaAllowed(linha.keyStorage)) {
    return { errorPermanent: `Host de mídia fora da lista permitida: ${hostnameDe(linha.keyStorage)}.` };
  }
  const bytes = await pedirBytes(linha.keyStorage, undefined, 'O download da mídia falhou');
  return { mime: linha.mime, bytes };
}

function hostnameDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Tira o token de texto que vira mensagem de erro — o mesmo cuidado de `cliente-graph.ts`. */
function esconder(texto: string, token: string): string {
  return token.length >= 8 ? texto.split(token).join('«segredo»') : texto;
}

async function pedirJson<T>(url: string, token: string, message: string): Promise<T> {
  let resposta: Response;
  try {
    resposta = await buscar(url, { headers: { authorization: `Bearer ${token}` } });
  } catch (erro) {
    throw new Error(esconder(`${message}: ${(erro as Error).message}`, token));
  }
  if (!resposta.ok) throw new Error(`${message}: HTTP ${resposta.status}.`);
  return (await resposta.json()) as T;
}

async function pedirBytes(url: string, token: string | undefined, mensagem: string): Promise<Uint8Array> {
  let resposta: Response;
  try {
    resposta = await buscar(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
  } catch (erro) {
    throw new Error(token ? esconder(`${mensagem}: ${(erro as Error).message}`, token) : `${mensagem}: ${(erro as Error).message}`);
  }
  if (!resposta.ok) throw new Error(`${mensagem}: HTTP ${resposta.status}.`);
  return new Uint8Array(await resposta.arrayBuffer());
}

/** `canal.config` is encrypted by `cifrarConfig` at channel creation; tests use plaintext. */
function configDecifrada(cru: Record<string, unknown> | null): Record<string, unknown> {
  if (!cru) return {};
  const cifrado = Object.values(cru).some((v) => typeof v === 'string' && estaCifrado(v));
  return cifrado ? decifrarConfig(cru, keyring()) : cru;
}

async function marcarFalha(tenantId: string, linha: LineAttachment, motivo: string): Promise<ResultadoDownload> {
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update anexo
         set download_tentativas = ${MAX_TENTATIVAS_DOWNLOAD}, download_erro = ${motivo},
             download_proxima_tentativa_em = null
       where id = ${linha.id}::uuid
    `);
  });
  return { state: 'falhou', motivo };
}

async function reagendarOuDesistir(
  tenantId: string,
  linha: LineAttachment,
  motivo: string,
): Promise<ResultadoDownload> {
  const tentativas = linha.download_tentativas + 1;
  if (tentativas >= MAX_TENTATIVAS_DOWNLOAD) {
    return marcarFalha(tenantId, linha, `${motivo} (desistiu depois de ${tentativas} tentativas)`);
  }
  const espera = esperaMs(tentativas);
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update anexo
         set download_tentativas = ${tentativas}, download_erro = ${motivo},
             download_proxima_tentativa_em = now() + ${`${espera} milliseconds`}::interval
       where id = ${linha.id}::uuid
    `);
  });
  return { state: 'reagendado' };
}

/**
 * Safety sweep requeues attachments left undownloaded. Like `contatosSemEspelho`, use the owner role to cross tenants, and include only rows below the attempt limit. The partial index `anexo_download_pendente_idx` (`0033_download_de_midia.sql`) supports this filter.
 */
export async function midiasPendentes(lote = 200): Promise<JobMedia[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select tenant_id, id from anexo
     where bytes = 0
       and canal_id is not null
       and download_tentativas < ${MAX_TENTATIVAS_DOWNLOAD}
       and (download_proxima_tentativa_em is null or download_proxima_tentativa_em <= now())
     order by criado_em
     limit ${lote}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, attachmentId: l.id }));
}
