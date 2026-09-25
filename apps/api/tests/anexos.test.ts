import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 13).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { useStorage } = await import('../src/dominio/anexo.js');
const { MAX_BYTES_AUDIO_VIDEO } = await import('@pipe/storage');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

let cenario: Cenario;
let api: ApiNoAr;

/** Armazenamento em memória: o teste não precisa de disco para provar a regra. */
const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
  useStorage({
    guardar: async (key, dados) => {
      objetos.set(key, dados);
      return { key, bytes: dados.byteLength };
    },
    ler: async (chave) => {
      const data = objetos.get(chave);
      return data ? { data, bytes: data.byteLength } : null;
    },
    remover: async (chave) => {
      objetos.delete(chave);
    },
  });
  cenario = await montarCenario(`anexo-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  // O link é absoluto porque é a Meta que o baixa. No teste a porta é efêmera, então
  // a base pública passa a ser a do servidor que acabou de subir.
  process.env['PIPE_STORAGE_URL_BASE'] = api.url;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
  useStorage(null);
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function up(
  dados: Buffer,
  mime: string,
  nome = 'arquivo.png',
  token = cenario.token,
): Promise<Response> {
  return fetch(`${api.url}/v1/attachments?nome=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${token}` },
    body: new Uint8Array(dados),
  });
}

describe('Upload attachments and return signed links', () => {
  it('Store an attachment and return a signed link', async () => {
    const resposta = await up(PNG, 'image/png');

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      mime: string;
      bytes: number;
      type: string;
      link: string;
    };
    expect(corpo.mime).toBe('image/png');
    expect(corpo.tipo).toBe('imagem');
    expect(corpo.bytes).toBe(PNG.byteLength);
    expect(corpo.link).toContain('assinatura=');
    expect(corpo.link).toContain('expira=');
  });

  it('Prefix attachment object keys with the tenant ID', async () => {
    const resposta = await up(PNG, 'image/png');
    const { id } = (await resposta.json()) as { id: string };

    const { rows } = await cenario.dono.execute<{ keyStorage: string }>(
      sql`select chave_storage from anexo where id = ${id}::uuid`,
    );
    expect(rows[0]!.keyStorage.startsWith(`${cenario.tenantId}/`)).toBe(true);
  });

  it('recusa tipo fora da lista da Blip', async () => {
    const resposta = await up(Buffer.from([0x4d, 0x5a, 0x90]), 'application/x-msdownload', 'a.exe');
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: { code: string } }).erro.codigo).toBe(
      'type_not_accepted',
    );
  });

  it('os BYTES desmentem o Content-Type: PNG declarado como PDF vira PNG', async () => {
    const resposta = await up(PNG, 'application/pdf', 'mentira.pdf');
    expect(resposta.status).toBe(201);
    expect(((await resposta.json()) as { mime: string }).mime).toBe('image/png');
  });

  it('Reject empty attachment files', async () => {
    const resposta = await up(Buffer.alloc(0), 'image/png');
    expect(resposta.status).toBe(400);
  });

  it('áudio acima de 16 MB é recusado, mesmo abaixo dos 100 MB', async () => {
    // O erro que o Desk da Blip comete: valida só os 100 MB e deixa subir o que a
    // plataforma recusa depois.
    const grande = Buffer.alloc(MAX_BYTES_AUDIO_VIDEO + 1024, 0x41);
    grande[0] = 0x49;
    grande[1] = 0x44;
    grande[2] = 0x33; // ID3 → audio/mpeg

    const resposta = await up(grande, 'audio/mpeg', 'longo.mp3');

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.error.codigo).toBe('file_large_excessive');
    expect(corpo.error.message).toContain('16');
  });

  it('sem credencial, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(PNG),
    });
    expect(resposta.status).toBe(401);
  });
});

describe('Download attachments through signed links', () => {
  async function linkDe(data: Buffer, mime: string, nome: string): Promise<string> {
    const r = await up(data, mime, nome);
    return ((await r.json()) as { link: string }).link;
  }

  it('devolve os bytes com o link válido', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');

    const resposta = await fetch(link);

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await resposta.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('Allow Meta to download signed media links without our cookie or API key', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    // Sem `authorization`, sem `cookie`. É o caso real do link que vai para a Meta.
    expect((await fetch(link)).status).toBe(200);
  });

  it('recusa link sem assinatura', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const semAssinatura = link.replace(/&assinatura=[^&]*/, '');
    expect((await fetch(semAssinatura)).status).toBe(401);
  });

  it('recusa assinatura adulterada', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const url = new URL(link);
    const assinatura = url.searchParams.get('signature')!;
    // Troca o primeiro dígito por OUTRO. Antes isto era `replace(/assinatura=./,
    // 'assinatura=0')`, que não alterava nada quando o dígito já era `0` — o teste
    // passava por sorte em 15 de 16 execuções.
    url.searchParams.set('signature', (assinatura[0] === '0' ? '1' : '0') + assinatura.slice(1));

    expect((await fetch(url.toString())).status).toBe(401);
  });

  it('Reject a manually extended signed-link expiration', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const expira = Number(new URL(link).searchParams.get('expires'));
    const esticado = link.replace(`expira=${expira}`, `expira=${expira + 3_600_000}`);
    expect((await fetch(esticado)).status).toBe(401);
  });

  it('Reject an attachment ID changed without updating its signature', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const outro = await linkDe(PNG, 'image/png', 'outra.png');
    const idOutro = new URL(outro).pathname.split('/').pop()!;
    const trocado = link.replace(/\/v1\/anexos\/[^?]+/, `/v1/attachments/${idOutro}`);
    expect((await fetch(trocado)).status).toBe(401);
  });

  it('HTML sai como download, nunca inline — é assim que o XSS não acontece', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const link = await linkDe(html, 'text/html', 'pagina.html');

    const resposta = await fetch(link);

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('application/octet-stream');
    expect(resposta.headers.get('content-disposition')).toContain('attachment');
    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('SVG também sai como download', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const resposta = await fetch(await linkDe(svg, 'image/svg+xml', 'x.svg'));
    expect(resposta.headers.get('content-disposition')).toContain('attachment');
  });

  it('Return 404 for a missing attachment after validating its signature', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const id = new URL(link).pathname.split('/').pop()!;
    await cenario.dono.execute(sql`delete from anexo where id = ${id}::uuid`);
    expect((await fetch(link)).status).toBe(404);
  });
});
