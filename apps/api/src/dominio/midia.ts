import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { decifrarConfig, estaCifrado } from '@pipe/db';
import { esperaMs } from '@pipe/workers';
import type { JobMedia } from '@pipe/workers';
import { keyOfAttachment, maxBytesDoMime, mimeParaServir } from '@pipe/armazenamento';
import { databaseOwner, keyring, noTenant } from '../banco.js';
import { storage } from './anexo.js';

/**
 * Download da mídia recebida (WhatsApp e Instagram) para o nosso storage.
 *
 * `dominio/entrada.ts` grava o anexo com `chave_storage = 'meta:<media_id>'`
 * (WhatsApp) ou a URL do CDN (Instagram) e `bytes = 0` — a referência da Meta
 * expira, e é este módulo que baixa de verdade, fora do webhook.
 *
 * WhatsApp: `GET /{versao}/{media_id}` com o Bearer do canal devolve
 * `{ url, mime_type, file_size, sha256 }`; a URL vale uns 5 minutos e é baixada com
 * o MESMO Bearer. Instagram: a URL do CDN baixa direto, sem token.
 *
 * SSRF: só os hosts da Meta abaixo, e só `https`. A URL que a Meta devolve (WhatsApp)
 * e a URL do payload do Instagram são as duas conferidas — nenhuma delas é confiável
 * só porque "veio da Meta": o payload do webhook e a resposta do Graph são texto que
 * chegou de fora.
 */

export const MAX_TENTATIVAS_DOWNLOAD = Number(process.env['PIPE_MIDIA_MAX_TENTATIVAS'] ?? 5);

const URL_BASE_GRAPH = 'https://graph.facebook.com';
const VERSAO_PADRAO_GRAPH = process.env['WHATSAPP_API_VERSAO'] ?? 'v26.0';

/**
 * Hosts de onde a mídia da Meta pode ser baixada:
 * - `graph.facebook.com` — a chamada de metadado do WhatsApp;
 * - `lookaside.fbsbx.com` — o CDN de mídia do WhatsApp Cloud API;
 * - `*.fbcdn.net` — CDN geral da Meta (cobre `scontent*.xx.fbcdn.net`);
 * - `*.cdninstagram.com` — CDN do Direct do Instagram.
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

/** Busca HTTP injetável — o teste troca por um dublê sem tocar em `cliente-graph.ts`. */
let buscar: typeof fetch = fetch;
export function defineBuscadorOfMedia(novo: typeof fetch | null): void {
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
type FalhaPermanente = { errorPermanente: string };

/**
 * Baixa a mídia de UM anexo. Chamado pelo consumidor da fila (o empurrão logo
 * depois do commit da entrada) e pela varredura periódica.
 */
export async function baixarMediaOfAttachment(tenantId: string, attachmentId: string): Promise<ResultadoDownload> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineAttachment>(sql`
      select a.id, a.chave_storage, a.mime, a.nome_original, a.checksum,
             a.download_tentativas, ca.tipo as canal_tipo, ca.config as canal_config
        from anexo a
        left join canal ca on ca.id = a.canal_id
       where a.id = ${attachmentId}::uuid and a.bytes = 0
       limit 1
    `);
    return rows[0] ?? null;
  });

  // Sumiu, ou já foi baixado por outra tentativa (o empurrão e a varredura podem se
  // cruzar): idempotência sem erro.
  if (!linha) return { state: 'ignorado' };
  if (!linha.channelType) {
    return marcarFalha(tenantId, linha, 'Anexo sem canal: não há de onde baixar a mídia.');
  }

  try {
    const baixado =
      linha.channelType === 'whatsapp_cloud'
        ? await baixarDoWhatsApp(linha)
        : await baixarDoInstagram(linha);
    if ('erroPermanente' in baixado) return marcarFalha(tenantId, linha, baixado.errorPermanente);

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
    return { errorPermanente: `"${linha.keyStorage}" não é uma referência de mídia da Meta.` };
  }

  const config = configDecifrada(linha.channelConfig);
  const token = typeof config['tokenAcesso'] === 'string' ? config['tokenAcesso'] : null;
  if (!token) return { errorPermanente: 'O canal não tem tokenAcesso em canal.config.' };
  const versao = typeof config['apiVersao'] === 'string' ? config['apiVersao'] : VERSAO_PADRAO_GRAPH;

  // Erro de rede ou HTTP aqui é sempre tratado como TEMPORÁRIO (propaga e quem chama
  // reagenda): a URL de mídia vence em ~5 minutos, e a próxima tentativa pede outra.
  const info = await pedirJson<InfoOfMedia>(
    `${URL_BASE_GRAPH}/${versao}/${mediaId}`,
    token,
    'A busca dos metadados da mídia falhou',
  );
  if (!info.url) return { errorPermanente: 'A Meta não devolveu a URL de download da mídia.' };
  if (!hostOfMediaAllowed(info.url)) {
    return { errorPermanente: `Host de mídia fora da lista permitida: ${new URL(info.url).hostname}.` };
  }

  const bytes = await pedirBytes(info.url, token, 'O download da mídia falhou');
  return { mime: info.mime_type ?? linha.mime, bytes, sha256Esperado: info.sha256 ?? linha.checksum ?? undefined };
}

async function baixarDoInstagram(linha: LineAttachment): Promise<Baixado | FalhaPermanente> {
  if (!hostOfMediaAllowed(linha.keyStorage)) {
    return { errorPermanente: `Host de mídia fora da lista permitida: ${hostnameDe(linha.keyStorage)}.` };
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

/** `canal.config` cifrado (`cifrarConfig` na criação do canal); texto puro nos testes. */
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
 * A varredura de segurança: anexo que ficou sem baixar volta para a fila.
 *
 * Mesmo desenho de `contatosSemEspelho`: roda com o papel dono porque varre todos os
 * tenants, e só olha quem ainda não esgotou as tentativas — o índice parcial
 * `anexo_download_pendente_idx` (`0033_download_de_midia.sql`) é feito para este
 * filtro.
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
  return rows.map((l) => ({ tenantId: l.tenant_id, anexoId: l.id }));
}
