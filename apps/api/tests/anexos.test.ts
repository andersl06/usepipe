import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 13).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { usarArmazenamento } = await import('../src/dominio/anexo.js');
const { MAX_BYTES_AUDIO_VIDEO } = await import('@pipe/armazenamento');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

let cenario: Cenario;
let api: ApiNoAr;

/** Armazenamento em memória: o teste não precisa de disco para provar a regra. */
const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
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
  cenario = await montarCenario(`anexo-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  // O link é absoluto porque é a Meta que o baixa. No teste a porta é efêmera, então
  // a base pública passa a ser a do servidor que acabou de subir.
  process.env['PIPE_STORAGE_URL_BASE'] = api.url;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
  usarArmazenamento(null);
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function subir(
  dados: Buffer,
  mime: string,
  nome = 'arquivo.png',
  token = cenario.token,
): Promise<Response> {
  return fetch(`${api.url}/v1/anexos?nome=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${token}` },
    body: new Uint8Array(dados),
  });
}

describe('subir anexo', () => {
  it('guarda o arquivo e devolve link assinado', async () => {
    const resposta = await subir(PNG, 'image/png');

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      mime: string;
      bytes: number;
      tipo: string;
      link: string;
    };
    expect(corpo.mime).toBe('image/png');
    expect(corpo.tipo).toBe('imagem');
    expect(corpo.bytes).toBe(PNG.byteLength);
    expect(corpo.link).toContain('assinatura=');
    expect(corpo.link).toContain('expira=');
  });

  it('a chave do objeto começa pelo tenant — isolamento no caminho', async () => {
    const resposta = await subir(PNG, 'image/png');
    const { id } = (await resposta.json()) as { id: string };

    const { rows } = await cenario.dono.execute<{ chave_storage: string }>(
      sql`select chave_storage from anexo where id = ${id}::uuid`,
    );
    expect(rows[0]!.chave_storage.startsWith(`${cenario.tenantId}/`)).toBe(true);
  });

  it('recusa tipo fora da lista da Blip', async () => {
    const resposta = await subir(Buffer.from([0x4d, 0x5a, 0x90]), 'application/x-msdownload', 'a.exe');
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'tipo_nao_aceito',
    );
  });

  it('os BYTES desmentem o Content-Type: PNG declarado como PDF vira PNG', async () => {
    const resposta = await subir(PNG, 'application/pdf', 'mentira.pdf');
    expect(resposta.status).toBe(201);
    expect(((await resposta.json()) as { mime: string }).mime).toBe('image/png');
  });

  it('recusa arquivo vazio', async () => {
    const resposta = await subir(Buffer.alloc(0), 'image/png');
    expect(resposta.status).toBe(400);
  });

  it('áudio acima de 16 MB é recusado, mesmo abaixo dos 100 MB', async () => {
    // O erro que o Desk da Blip comete: valida só os 100 MB e deixa subir o que a
    // plataforma recusa depois.
    const grande = Buffer.alloc(MAX_BYTES_AUDIO_VIDEO + 1024, 0x41);
    grande[0] = 0x49;
    grande[1] = 0x44;
    grande[2] = 0x33; // ID3 → audio/mpeg

    const resposta = await subir(grande, 'audio/mpeg', 'longo.mp3');

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { erro: { codigo: string; mensagem: string } };
    expect(corpo.erro.codigo).toBe('arquivo_grande_demais');
    expect(corpo.erro.mensagem).toContain('16');
  });

  it('sem credencial, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/anexos`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(PNG),
    });
    expect(resposta.status).toBe(401);
  });
});

describe('baixar por link assinado', () => {
  async function linkDe(dados: Buffer, mime: string, nome: string): Promise<string> {
    const r = await subir(dados, mime, nome);
    return ((await r.json()) as { link: string }).link;
  }

  it('devolve os bytes com o link válido', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');

    const resposta = await fetch(link);

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await resposta.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('não pede cookie nem chave — a Meta baixa a mídia sem credencial nossa', async () => {
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
    const assinatura = url.searchParams.get('assinatura')!;
    // Troca o primeiro dígito por OUTRO. Antes isto era `replace(/assinatura=./,
    // 'assinatura=0')`, que não alterava nada quando o dígito já era `0` — o teste
    // passava por sorte em 15 de 16 execuções.
    url.searchParams.set('assinatura', (assinatura[0] === '0' ? '1' : '0') + assinatura.slice(1));

    expect((await fetch(url.toString())).status).toBe(401);
  });

  it('recusa validade esticada na mão', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const expira = Number(new URL(link).searchParams.get('expira'));
    const esticado = link.replace(`expira=${expira}`, `expira=${expira + 3_600_000}`);
    expect((await fetch(esticado)).status).toBe(401);
  });

  it('não deixa trocar o id do anexo mantendo a assinatura', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const outro = await linkDe(PNG, 'image/png', 'outra.png');
    const idOutro = new URL(outro).pathname.split('/').pop()!;
    const trocado = link.replace(/\/v1\/anexos\/[^?]+/, `/v1/anexos/${idOutro}`);
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

  it('anexo inexistente, 404 — depois de a assinatura passar', async () => {
    const link = await linkDe(PNG, 'image/png', 'foto.png');
    const id = new URL(link).pathname.split('/').pop()!;
    await cenario.dono.execute(sql`delete from anexo where id = ${id}::uuid`);
    expect((await fetch(link)).status).toBe(404);
  });
});
