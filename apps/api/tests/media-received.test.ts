import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// The mode must be decided before any import that reads the variable, just as
// nos outros testes de webhook.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
// Deliberately small: the "gives up at the limit" test does not need 5 rounds
// to prove the ruler.
process.env['PIPE_MIDIA_MAX_TENTATIVAS'] = '3';

const { createDatabasecriarBancocreateDatabase, closeDatabasefecharBancocloseDatabase, migratemigrarmigrate, seedsemearseed } = await import('@pipe/db');
const { baixarMediaOfAttachment, defineBuscadorOfMedia, hostOfMediaAllowed, MAX_TENTATIVAS_DOWNLOAD } =
  await import('../src/domain/media.js');
const { useStorage } = await import('../src/domain/attachment.js');

/**
 * Downloading received media (`dominio/midia.ts`), directly — without going through the queue. `PIPE_FILAS=memoria` makes `enfileirarDownloadMidia` a no-op (the same rule as the CRM mirror: a queue that talks to an external service does not run inline in tests), so proving the real download means calling `baixarMidiaDoAnexo` directly — exactly what the queue consumer does in production. The fixtures are the minimum the function reads: a tenant, a channel (the token's source), and an attachment with `bytes = 0`. No inbox, queue or message is needed — since `0033_download_de_midia.sql`, `anexo.canal_id` points directly to the channel.
 */

type Dono = ReturnType<typeof createDatabasecriarBancocreateDatabase>;
let dono: Dono;
const S = randomUUID().slice(0, 8);

/** In-memory storage: the test does not need disk to prove the rule. */
const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
  await migratemigrarmigrate(process.env['DATABASE_URL']);
  dono = createDatabasecriarBancocreateDatabase({ url: process.env['DATABASE_URL']!, maxConexoes: 3 });
  useStorage({
    guardar: async (key, data) => {
      objetos.set(key, data);
      return { key, bytes: data.byteLength };
    },
    ler: async (chave) => {
      const data = objetos.get(chave);
      return data ? { data, bytes: data.byteLength } : null;
    },
    remover: async (chave) => {
      objetos.delete(chave);
    },
  });
});

afterAll(async () => {
  useStorage(null);
  defineBuscadorOfMedia(null);
  await closeDatabasefecharBancocloseDatabase(dono);
});

afterEach(() => {
  defineBuscadorOfMedia(null);
});

async function novoTenant(sufixo: string): Promise<string> {
  const { tenantId } = await seedsemearseed(dono, { nome: `midia ${sufixo}`, slug: `midia-${sufixo}` });
  return tenantId;
}

async function newChannel(
  tenantId: string,
  tipo: 'whatsapp_cloud' | 'instagram',
  config: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, config)
    values (${tenantId}::uuid, ${tipo}, 'canal de teste', ${JSON.stringify(config)}::jsonb)
    returning id
  `);
  return rows[0]!.id;
}

async function newAttachment(
  tenantId: string,
  channelId: string,
  chave: string,
  options: { mime?: string; checksum?: string | null } = {},
): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into anexo (tenant_id, canal_id, chave_storage, mime, bytes, checksum)
    values (
      ${tenantId}::uuid, ${channelId}::uuid, ${chave}, ${options.mime ?? 'application/octet-stream'},
      0, ${options.checksum ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

type LineAttachment = {
  [column: string]: unknown;
  keyStorage: string;
  mime: string;
  bytes: number;
  checksum: string | null;
  download_tentativas: number;
  downloadError: string | null;
  download_proxima_tentativa_em: Date | string | null;
};

async function lineAttachment(id: string): Promise<LineAttachment> {
  const { rows } = await dono.execute<LineAttachment>(sql`
    select chave_storage, mime, bytes, checksum, download_tentativas, download_erro,
           download_proxima_tentativa_em
      from anexo where id = ${id}::uuid
  `);
  return rows[0]!;
}

function cabecalho(init: RequestInit | undefined, nome: string): string | null {
  const cabecalhos = init?.headers as Record<string, string> | undefined;
  return cabecalhos?.[nome] ?? null;
}

function respostaJson(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200 });
}

function respostaBytes(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status });
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const URL_INSTAGRAM = 'https://scontent-gru2-1.cdninstagram.com/v/foto.jpg';

describe('Allow only documented Meta media hosts over HTTPS', () => {
  it('aceita os hosts documentados, só em https', () => {
    expect(hostOfMediaAllowed('https://graph.facebook.com/v26.0/123')).toBe(true);
    expect(hostOfMediaAllowed('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1')).toBe(
      true,
    );
    expect(hostOfMediaAllowed('https://scontent.xx.fbcdn.net/v/foo.jpg')).toBe(true);
    expect(hostOfMediaAllowed('https://fbcdn.net/v/foo.jpg')).toBe(true);
    expect(hostOfMediaAllowed(URL_INSTAGRAM)).toBe(true);
  });

  it('Reject unlisted hosts, non-HTTPS URLs, and forged host suffixes', () => {
    expect(hostOfMediaAllowed('https://evil.example/roubado.jpg')).toBe(false);
    expect(hostOfMediaAllowed('http://graph.facebook.com/v26.0/123')).toBe(false);
    // "ends with fbcdn.net.evil.com" is not the same as "ends with fbcdn.net".
    expect(hostOfMediaAllowed('https://fbcdn.net.evil.com/x')).toBe(false);
    expect(hostOfMediaAllowed('não é url')).toBe(false);
  });
});

describe('Download WhatsApp media with one Bearer token, verify sha256, and detect MIME from bytes', () => {
  it('baixa, confere sha256 e grava — o MIME final é o dos bytes, não o declarado', async () => {
    const tenantId = await novoTenant(`wa-ok-${S}`);
    const token = 'token-do-canal-de-teste';
    const channelId = await newChannel(tenantId, 'whatsapp_cloud', { tokenAcesso: token, apiVersao: 'v26.0' });
    const attachmentId = await newAttachment(tenantId, channelId, 'meta:media-123', { mime: 'image/jpeg' });
    const sha256 = createHash('sha256').update(PNG).digest('hex');

    const pedidos: { url: string; auth: string | null }[] = [];
    defineBuscadorOfMedia(async (inbound, init) => {
      const url = String(inbound);
      pedidos.push({ url, auth: cabecalho(init, 'authorization') });
      if (url === 'https://graph.facebook.com/v26.0/media-123') {
        return respostaJson({
          url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-123',
          // Deliberately declared wrong: the bytes are PNG, not JPEG — the one who decides is
          // `mimeParaServir`, como no upload manual.
          mime_type: 'image/jpeg',
          sha256,
        });
      }
      if (url.startsWith('https://lookaside.fbsbx.com/')) return respostaBytes(PNG);
      throw new Error(`url inesperada no dublê: ${url}`);
    });

    const resultado = await baixarMediaOfAttachment(tenantId, attachmentId);
    expect(resultado).toEqual({ estado: 'baixado' });

    // As DUAS chamadas — metadado e bytes — levam o Bearer do canal.
    expect(pedidos).toHaveLength(2);
    expect(pedidos.every((p) => p.auth === `Bearer ${token}`)).toBe(true);

    const linha = await lineAttachment(attachmentId);
    expect(linha.bytes).toBe(PNG.byteLength);
    expect(linha.mime).toBe('image/png');
    expect(linha.checksum).toBe(sha256);
    expect(linha.keyStorage.startsWith(`${tenantId}/`)).toBe(true);
    expect(linha.download_tentativas).toBe(0);
    expect(linha.downloadError).toBeNull();
  });
});

describe('Instagram: baixa direto da URL do CDN, sem token', () => {
  it('grava sem mandar Authorization', async () => {
    const tenantId = await novoTenant(`ig-ok-${S}`);
    const canalId = await newChannel(tenantId, 'instagram', {});
    const anexoId = await newAttachment(tenantId, canalId, URL_INSTAGRAM, { mime: 'application/octet-stream' });

    let auth: string | null | undefined;
    let urlPedida: string | undefined;
    defineBuscadorOfMedia(async (entrada, init) => {
      urlPedida = String(entrada);
      auth = cabecalho(init, 'authorization');
      return respostaBytes(JPEG);
    });

    const resultado = await baixarMediaOfAttachment(tenantId, anexoId);
    expect(resultado).toEqual({ estado: 'baixado' });
    expect(urlPedida).toBe(URL_INSTAGRAM);
    expect(auth).toBeNull();

    const linha = await lineAttachment(anexoId);
    expect(linha.mime).toBe('image/jpeg');
    expect(linha.bytes).toBe(JPEG.byteLength);
  });
});

describe('sha256 divergente', () => {
  it('Reject bad media without storing the attachment or bytes', async () => {
    const tenantId = await novoTenant(`sha-${S}`);
    const canalId = await newChannel(tenantId, 'whatsapp_cloud', { tokenAcesso: 'tok' });
    const anexoId = await newAttachment(tenantId, canalId, 'meta:media-sha');
    const objetosAntes = objetos.size;

    defineBuscadorOfMedia(async (entrada) => {
      const url = String(entrada);
      if (url.includes('graph.facebook.com')) {
        return respostaJson({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'text/plain', sha256: 'deadbeef' });
      }
      return respostaBytes(Buffer.from('conteudo que nao bate com o sha256'));
    });

    const resultado = await baixarMediaOfAttachment(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.state === 'falhou') expect(resultado.motivo).toContain('sha256');

    const linha = await lineAttachment(anexoId);
    expect(linha.bytes).toBe(0);
    expect(objetos.size).toBe(objetosAntes); // nada novo foi guardado no storage
    // A permanent failure exhausts the ruler immediately — it does not keep rescheduling something that will never succeed.
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
    expect(linha.download_proxima_tentativa_em).toBeNull();
  });
});

describe('host fora da lista', () => {
  it('recusa ANTES de baixar bytes — o dublê nunca é chamado', async () => {
    const tenantId = await novoTenant(`host-${S}`);
    const canalId = await newChannel(tenantId, 'instagram', {});
    const anexoId = await newAttachment(tenantId, canalId, 'https://evil.example/roubado.jpg');

    let chamou = false;
    defineBuscadorOfMedia(async () => {
      chamou = true;
      return respostaBytes(Buffer.from('nunca deveria chegar aqui'));
    });

    const resultado = await baixarMediaOfAttachment(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.state === 'falhou') expect(resultado.motivo).toContain('fora da lista');
    expect(chamou).toBe(false);

    const linha = await lineAttachment(anexoId);
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
  });
});

describe('tamanho acima do limite', () => {
  it('áudio acima de 16 MB é recusado — o mesmo teto do upload manual', async () => {
    const tenantId = await novoTenant(`grande-${S}`);
    const canalId = await newChannel(tenantId, 'instagram', {});
    const anexoId = await newAttachment(tenantId, canalId, URL_INSTAGRAM, { mime: 'audio/mpeg' });

    const grande = Buffer.alloc(16 * 1024 * 1024 + 1024, 0x41);
    grande[0] = 0x49;
    grande[1] = 0x44;
    grande[2] = 0x33; // ID3 → audio/mpeg pelos bytes

    defineBuscadorOfMedia(async () => respostaBytes(grande));

    const resultado = await baixarMediaOfAttachment(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.state === 'falhou') expect(resultado.motivo).toContain('limite');

    const linha = await lineAttachment(anexoId);
    expect(linha.bytes).toBe(0);
  });
});

describe('falha temporária', () => {
  it('reagenda a cada tentativa e desiste no limite — sem gastar a permanente', async () => {
    const tenantId = await novoTenant(`retry-${S}`);
    const canalId = await newChannel(tenantId, 'instagram', {});
    const anexoId = await newAttachment(tenantId, canalId, URL_INSTAGRAM);

    defineBuscadorOfMedia(async () => {
      throw new Error('ECONNRESET: rede caiu no meio do download');
    });

    for (let tentativa = 1; tentativa < MAX_TENTATIVAS_DOWNLOAD; tentativa += 1) {
      const resultado = await baixarMediaOfAttachment(tenantId, anexoId);
      expect(resultado).toEqual({ estado: 'reagendado' });
      const linha = await lineAttachment(anexoId);
      expect(linha.download_tentativas).toBe(tentativa);
      expect(linha.download_proxima_tentativa_em).not.toBeNull();
    }

    const final = await baixarMediaOfAttachment(tenantId, anexoId);
    expect(final).toMatchObject({ estado: 'falhou' });
    if (final.state === 'falhou') expect(final.motivo).toContain('desistiu');

    const linha = await lineAttachment(anexoId);
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
    expect(linha.download_proxima_tentativa_em).toBeNull();
    expect(linha.bytes).toBe(0);
  });
});

describe('idempotência', () => {
  it('Skip downloading an attachment whose bytes are already stored', async () => {
    const tenantId = await novoTenant(`idemp-${S}`);
    const canalId = await newChannel(tenantId, 'instagram', {});
    const anexoId = await newAttachment(tenantId, canalId, URL_INSTAGRAM);

    let chamadas = 0;
    defineBuscadorOfMedia(async () => {
      chamadas += 1;
      return respostaBytes(JPEG);
    });

    expect(await baixarMediaOfAttachment(tenantId, anexoId)).toEqual({ estado: 'baixado' });
    expect(chamadas).toBe(1);

    // Second call — the queue's push and the sweep can overlap.
    expect(await baixarMediaOfAttachment(tenantId, anexoId)).toEqual({ estado: 'ignorado' });
    expect(chamadas).toBe(1);
  });
});

describe('Isolate downloaded media by tenant', () => {
  it('Hide one tenant\'s attachment from another before download', async () => {
    const tenantA = await novoTenant(`iso-a-${S}`);
    const tenantB = await novoTenant(`iso-b-${S}`);
    const channelA = await newChannel(tenantA, 'instagram', {});
    const anexoId = await newAttachment(tenantA, channelA, URL_INSTAGRAM);

    let chamou = false;
    defineBuscadorOfMedia(async () => {
      chamou = true;
      return respostaBytes(JPEG);
    });

    const resultado = await baixarMediaOfAttachment(tenantB, anexoId);
    expect(resultado).toEqual({ estado: 'ignorado' });
    expect(chamou).toBe(false);

    const linha = await lineAttachment(anexoId);
    expect(linha.bytes).toBe(0);
  });
});
