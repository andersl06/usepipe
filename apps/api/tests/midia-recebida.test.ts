import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// O modo tem que ser decidido antes de qualquer import que leia a variável, como
// nos outros testes de webhook.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
// Pequeno de propósito: o teste de "desiste no limite" não precisa de 5 rodadas
// para provar a régua.
process.env['PIPE_MIDIA_MAX_TENTATIVAS'] = '3';

const { criarBanco, fecharBanco, migrar, semear } = await import('@pipe/db');
const { baixarMidiaDoAnexo, definirBuscadorDeMidia, hostDeMidiaPermitido, MAX_TENTATIVAS_DOWNLOAD } =
  await import('../src/dominio/midia.js');
const { usarArmazenamento } = await import('../src/dominio/anexo.js');

/**
 * Download da mídia recebida (`dominio/midia.ts`), direto — sem passar pela fila.
 *
 * `PIPE_FILAS=memoria` faz `enfileirarDownloadMidia` não fazer nada (mesma regra do
 * espelho no CRM: fila que fala com serviço externo não roda em linha no teste), então
 * quem quer provar o download de verdade chama `baixarMidiaDoAnexo` direto — é
 * exatamente o que o consumidor da fila faz em produção.
 *
 * Os fixtures são o mínimo que a função lê: um tenant, um canal (a fonte do token) e
 * um anexo com `bytes = 0`. Não precisa de inbox, fila nem mensagem — desde a
 * `0033_download_de_midia.sql`, `anexo.canal_id` aponta direto para o canal.
 */

type Dono = ReturnType<typeof criarBanco>;
let dono: Dono;
const S = randomUUID().slice(0, 8);

/** Armazenamento em memória: o teste não precisa de disco para provar a regra. */
const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
  await migrar(process.env['DATABASE_URL']);
  dono = criarBanco({ url: process.env['DATABASE_URL']!, maxConexoes: 3 });
  usarArmazenamento({
    guardar: async (chave, dados) => {
      objetos.set(chave, dados);
      return { chave, bytes: dados.byteLength };
    },
    ler: async (chave) => {
      const dados = objetos.get(chave);
      return dados ? { dados, bytes: dados.byteLength } : null;
    },
    remover: async (chave) => {
      objetos.delete(chave);
    },
  });
});

afterAll(async () => {
  usarArmazenamento(null);
  definirBuscadorDeMidia(null);
  await fecharBanco(dono);
});

afterEach(() => {
  definirBuscadorDeMidia(null);
});

async function novoTenant(sufixo: string): Promise<string> {
  const { tenantId } = await semear(dono, { nome: `midia ${sufixo}`, slug: `midia-${sufixo}` });
  return tenantId;
}

async function novoCanal(
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

async function novoAnexo(
  tenantId: string,
  canalId: string,
  chave: string,
  opcoes: { mime?: string; checksum?: string | null } = {},
): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into anexo (tenant_id, canal_id, chave_storage, mime, bytes, checksum)
    values (
      ${tenantId}::uuid, ${canalId}::uuid, ${chave}, ${opcoes.mime ?? 'application/octet-stream'},
      0, ${opcoes.checksum ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

type LinhaAnexo = {
  [coluna: string]: unknown;
  chave_storage: string;
  mime: string;
  bytes: number;
  checksum: string | null;
  download_tentativas: number;
  download_erro: string | null;
  download_proxima_tentativa_em: Date | string | null;
};

async function linhaAnexo(id: string): Promise<LinhaAnexo> {
  const { rows } = await dono.execute<LinhaAnexo>(sql`
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

describe('hostDeMidiaPermitido — a lista de hosts da Meta (SSRF)', () => {
  it('aceita os hosts documentados, só em https', () => {
    expect(hostDeMidiaPermitido('https://graph.facebook.com/v26.0/123')).toBe(true);
    expect(hostDeMidiaPermitido('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1')).toBe(
      true,
    );
    expect(hostDeMidiaPermitido('https://scontent.xx.fbcdn.net/v/foo.jpg')).toBe(true);
    expect(hostDeMidiaPermitido('https://fbcdn.net/v/foo.jpg')).toBe(true);
    expect(hostDeMidiaPermitido(URL_INSTAGRAM)).toBe(true);
  });

  it('recusa host fora da lista, esquema não https e domínio forjado por sufixo', () => {
    expect(hostDeMidiaPermitido('https://evil.example/roubado.jpg')).toBe(false);
    expect(hostDeMidiaPermitido('http://graph.facebook.com/v26.0/123')).toBe(false);
    // "termina com fbcdn.net.evil.com" não é "termina com fbcdn.net".
    expect(hostDeMidiaPermitido('https://fbcdn.net.evil.com/x')).toBe(false);
    expect(hostDeMidiaPermitido('não é url')).toBe(false);
  });
});

describe('WhatsApp: busca metadado e baixa com o mesmo Bearer', () => {
  it('baixa, confere sha256 e grava — o MIME final é o dos bytes, não o declarado', async () => {
    const tenantId = await novoTenant(`wa-ok-${S}`);
    const token = 'token-do-canal-de-teste';
    const canalId = await novoCanal(tenantId, 'whatsapp_cloud', { tokenAcesso: token, apiVersao: 'v26.0' });
    const anexoId = await novoAnexo(tenantId, canalId, 'meta:media-123', { mime: 'image/jpeg' });
    const sha256 = createHash('sha256').update(PNG).digest('hex');

    const pedidos: { url: string; auth: string | null }[] = [];
    definirBuscadorDeMidia(async (entrada, init) => {
      const url = String(entrada);
      pedidos.push({ url, auth: cabecalho(init, 'authorization') });
      if (url === 'https://graph.facebook.com/v26.0/media-123') {
        return respostaJson({
          url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-123',
          // Declarado errado de propósito: os bytes são PNG, não JPEG — quem decide é
          // `mimeParaServir`, como no upload manual.
          mime_type: 'image/jpeg',
          sha256,
        });
      }
      if (url.startsWith('https://lookaside.fbsbx.com/')) return respostaBytes(PNG);
      throw new Error(`url inesperada no dublê: ${url}`);
    });

    const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(resultado).toEqual({ estado: 'baixado' });

    // As DUAS chamadas — metadado e bytes — levam o Bearer do canal.
    expect(pedidos).toHaveLength(2);
    expect(pedidos.every((p) => p.auth === `Bearer ${token}`)).toBe(true);

    const linha = await linhaAnexo(anexoId);
    expect(linha.bytes).toBe(PNG.byteLength);
    expect(linha.mime).toBe('image/png');
    expect(linha.checksum).toBe(sha256);
    expect(linha.chave_storage.startsWith(`${tenantId}/`)).toBe(true);
    expect(linha.download_tentativas).toBe(0);
    expect(linha.download_erro).toBeNull();
  });
});

describe('Instagram: baixa direto da URL do CDN, sem token', () => {
  it('grava sem mandar Authorization', async () => {
    const tenantId = await novoTenant(`ig-ok-${S}`);
    const canalId = await novoCanal(tenantId, 'instagram', {});
    const anexoId = await novoAnexo(tenantId, canalId, URL_INSTAGRAM, { mime: 'application/octet-stream' });

    let auth: string | null | undefined;
    let urlPedida: string | undefined;
    definirBuscadorDeMidia(async (entrada, init) => {
      urlPedida = String(entrada);
      auth = cabecalho(init, 'authorization');
      return respostaBytes(JPEG);
    });

    const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(resultado).toEqual({ estado: 'baixado' });
    expect(urlPedida).toBe(URL_INSTAGRAM);
    expect(auth).toBeNull();

    const linha = await linhaAnexo(anexoId);
    expect(linha.mime).toBe('image/jpeg');
    expect(linha.bytes).toBe(JPEG.byteLength);
  });
});

describe('sha256 divergente', () => {
  it('recusa e não grava — nem o anexo, nem os bytes no storage', async () => {
    const tenantId = await novoTenant(`sha-${S}`);
    const canalId = await novoCanal(tenantId, 'whatsapp_cloud', { tokenAcesso: 'tok' });
    const anexoId = await novoAnexo(tenantId, canalId, 'meta:media-sha');
    const objetosAntes = objetos.size;

    definirBuscadorDeMidia(async (entrada) => {
      const url = String(entrada);
      if (url.includes('graph.facebook.com')) {
        return respostaJson({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'text/plain', sha256: 'deadbeef' });
      }
      return respostaBytes(Buffer.from('conteudo que nao bate com o sha256'));
    });

    const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.estado === 'falhou') expect(resultado.motivo).toContain('sha256');

    const linha = await linhaAnexo(anexoId);
    expect(linha.bytes).toBe(0);
    expect(objetos.size).toBe(objetosAntes); // nada novo foi guardado no storage
    // Falha permanente esgota a régua na hora — não fica reagendando o que nunca vai bater.
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
    expect(linha.download_proxima_tentativa_em).toBeNull();
  });
});

describe('host fora da lista', () => {
  it('recusa ANTES de baixar bytes — o dublê nunca é chamado', async () => {
    const tenantId = await novoTenant(`host-${S}`);
    const canalId = await novoCanal(tenantId, 'instagram', {});
    const anexoId = await novoAnexo(tenantId, canalId, 'https://evil.example/roubado.jpg');

    let chamou = false;
    definirBuscadorDeMidia(async () => {
      chamou = true;
      return respostaBytes(Buffer.from('nunca deveria chegar aqui'));
    });

    const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.estado === 'falhou') expect(resultado.motivo).toContain('fora da lista');
    expect(chamou).toBe(false);

    const linha = await linhaAnexo(anexoId);
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
  });
});

describe('tamanho acima do limite', () => {
  it('áudio acima de 16 MB é recusado — o mesmo teto do upload manual', async () => {
    const tenantId = await novoTenant(`grande-${S}`);
    const canalId = await novoCanal(tenantId, 'instagram', {});
    const anexoId = await novoAnexo(tenantId, canalId, URL_INSTAGRAM, { mime: 'audio/mpeg' });

    const grande = Buffer.alloc(16 * 1024 * 1024 + 1024, 0x41);
    grande[0] = 0x49;
    grande[1] = 0x44;
    grande[2] = 0x33; // ID3 → audio/mpeg pelos bytes

    definirBuscadorDeMidia(async () => respostaBytes(grande));

    const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(resultado).toMatchObject({ estado: 'falhou' });
    if (resultado.estado === 'falhou') expect(resultado.motivo).toContain('limite');

    const linha = await linhaAnexo(anexoId);
    expect(linha.bytes).toBe(0);
  });
});

describe('falha temporária', () => {
  it('reagenda a cada tentativa e desiste no limite — sem gastar a permanente', async () => {
    const tenantId = await novoTenant(`retry-${S}`);
    const canalId = await novoCanal(tenantId, 'instagram', {});
    const anexoId = await novoAnexo(tenantId, canalId, URL_INSTAGRAM);

    definirBuscadorDeMidia(async () => {
      throw new Error('ECONNRESET: rede caiu no meio do download');
    });

    for (let tentativa = 1; tentativa < MAX_TENTATIVAS_DOWNLOAD; tentativa += 1) {
      const resultado = await baixarMidiaDoAnexo(tenantId, anexoId);
      expect(resultado).toEqual({ estado: 'reagendado' });
      const linha = await linhaAnexo(anexoId);
      expect(linha.download_tentativas).toBe(tentativa);
      expect(linha.download_proxima_tentativa_em).not.toBeNull();
    }

    const final = await baixarMidiaDoAnexo(tenantId, anexoId);
    expect(final).toMatchObject({ estado: 'falhou' });
    if (final.estado === 'falhou') expect(final.motivo).toContain('desistiu');

    const linha = await linhaAnexo(anexoId);
    expect(linha.download_tentativas).toBe(MAX_TENTATIVAS_DOWNLOAD);
    expect(linha.download_proxima_tentativa_em).toBeNull();
    expect(linha.bytes).toBe(0);
  });
});

describe('idempotência', () => {
  it('anexo já baixado (bytes > 0) não baixa de novo', async () => {
    const tenantId = await novoTenant(`idemp-${S}`);
    const canalId = await novoCanal(tenantId, 'instagram', {});
    const anexoId = await novoAnexo(tenantId, canalId, URL_INSTAGRAM);

    let chamadas = 0;
    definirBuscadorDeMidia(async () => {
      chamadas += 1;
      return respostaBytes(JPEG);
    });

    expect(await baixarMidiaDoAnexo(tenantId, anexoId)).toEqual({ estado: 'baixado' });
    expect(chamadas).toBe(1);

    // Segunda chamada — o empurrão da fila e a varredura podem se cruzar.
    expect(await baixarMidiaDoAnexo(tenantId, anexoId)).toEqual({ estado: 'ignorado' });
    expect(chamadas).toBe(1);
  });
});

describe('isolamento entre tenants', () => {
  it('anexo de um tenant é invisível para o outro — a RLS barra antes do download', async () => {
    const tenantA = await novoTenant(`iso-a-${S}`);
    const tenantB = await novoTenant(`iso-b-${S}`);
    const canalA = await novoCanal(tenantA, 'instagram', {});
    const anexoId = await novoAnexo(tenantA, canalA, URL_INSTAGRAM);

    let chamou = false;
    definirBuscadorDeMidia(async () => {
      chamou = true;
      return respostaBytes(JPEG);
    });

    const resultado = await baixarMidiaDoAnexo(tenantB, anexoId);
    expect(resultado).toEqual({ estado: 'ignorado' });
    expect(chamou).toBe(false);

    const linha = await linhaAnexo(anexoId);
    expect(linha.bytes).toBe(0);
  });
});
