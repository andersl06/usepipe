import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArmazenamentoEmDisco,
  MAX_BYTES_AUDIO_VIDEO,
  MAX_BYTES_POR_ARQUIVO,
  assinar,
  assinaturaValida,
  chaveDeAnexo,
  chaveDoTenant,
  maxBytesDoMime,
  mimeAceito,
  mimeParaServir,
  servirComoAnexo,
  tipoDoMime,
  tipoReal,
} from '../src/index.js';

const SEGREDO = 'segredo-de-teste';

async function raizTemporaria(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pipe-storage-'));
}

describe('limites, copiados do settings.json da Blip', () => {
  it('mantém os números deles', () => {
    expect(MAX_BYTES_POR_ARQUIVO).toBe(104_857_600);
    expect(MAX_BYTES_AUDIO_VIDEO).toBe(16_777_216);
  });

  it('áudio e vídeo têm teto menor — o erro que o Desk deles comete', () => {
    // O cliente da Blip valida só os 100 MB e deixa subir áudio que a plataforma
    // recusa depois. Aqui o teto certo vale desde a validação.
    expect(maxBytesDoMime('audio/mpeg')).toBe(MAX_BYTES_AUDIO_VIDEO);
    expect(maxBytesDoMime('video/mp4')).toBe(MAX_BYTES_AUDIO_VIDEO);
    expect(maxBytesDoMime('application/pdf')).toBe(MAX_BYTES_POR_ARQUIVO);
    expect(maxBytesDoMime('image/png')).toBe(MAX_BYTES_POR_ARQUIVO);
  });

  it('aceita o que a Blip aceita e recusa o resto', () => {
    expect(mimeAceito('application/pdf')).toBe(true);
    expect(mimeAceito('image/webp')).toBe(true);
    expect(mimeAceito('text/csv')).toBe(true);
    expect(mimeAceito('application/x-msdownload')).toBe(false);
    expect(mimeAceito('application/octet-stream')).toBe(false);
  });

  it('SVG é aceito, mas nunca tratado como imagem', () => {
    // SVG é XML executável: renderizado inline vira XSS.
    expect(mimeAceito('image/svg+xml')).toBe(true);
    expect(tipoDoMime('image/svg+xml')).toBe('documento');
    expect(servirComoAnexo('image/svg+xml')).toBe(true);
    expect(servirComoAnexo('text/html')).toBe(true);
    expect(servirComoAnexo('image/png')).toBe(false);
  });
});

describe('tipo real pelos bytes, não pela extensão', () => {
  it('reconhece as assinaturas que importam', () => {
    expect(tipoReal(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(tipoReal(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(tipoReal(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('application/pdf');
    expect(tipoReal(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe('application/zip');
  });

  it('desmascara HTML disfarçado de PNG — o caminho do XSS', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script>');
    // Os bytes não são PNG, e o declarado não sobrevive à conferência.
    expect(tipoReal(html)).toBeNull();
    // Sem assinatura, fica o declarado; quem chama já garantiu que está na lista.
    expect(mimeParaServir('text/html', html)).toBe('text/html');
    // E `text/html` nunca vai inline.
    expect(servirComoAnexo(mimeParaServir('text/html', html))).toBe(true);
  });

  it('os BYTES ganham do que o upload declarou', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(mimeParaServir('application/pdf', png)).toBe('image/png');
  });

  it('não inventa tipo quando não há assinatura', () => {
    expect(tipoReal(new TextEncoder().encode('nome;valor\n1;2'))).toBeNull();
    expect(mimeParaServir('text/csv', new TextEncoder().encode('a;b'))).toBe('text/csv');
  });

  it('aguenta arquivo curto demais sem estourar', () => {
    expect(tipoReal(new Uint8Array([]))).toBeNull();
    expect(tipoReal(new Uint8Array([0x89]))).toBeNull();
  });
});

describe('isolamento por tenant no caminho do objeto', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';

  it('a chave começa pelo tenant, sempre', () => {
    expect(chaveDeAnexo(tenant, 'foto.png').startsWith(`${tenant}/`)).toBe(true);
  });

  it('duas chamadas nunca colidem, mesmo com o mesmo nome', () => {
    expect(chaveDeAnexo(tenant, 'foto.png')).not.toBe(chaveDeAnexo(tenant, 'foto.png'));
  });

  it('recusa chave de outro tenant e travessia de diretório', () => {
    const outro = '22222222-2222-4222-8222-222222222222';
    expect(chaveDoTenant(`${tenant}/2026/09/x.png`, tenant)).toBe(true);
    expect(chaveDoTenant(`${outro}/2026/09/x.png`, tenant)).toBe(false);
    expect(chaveDoTenant(`${tenant}/../${outro}/x.png`, tenant)).toBe(false);
    expect(chaveDoTenant(`/etc/passwd`, tenant)).toBe(false);
    expect(chaveDoTenant(`${tenant}\\x.png`, tenant)).toBe(false);
  });

  it('não deixa extensão maluca virar parte da chave', () => {
    const chave = chaveDeAnexo(tenant, 'arquivo.exe%00.png');
    expect(chave).toMatch(/\.png$/);
    expect(chave).not.toContain('%00');
  });
});

describe('link assinado com validade', () => {
  const anexoId = 'aaaaaaaa-1111-4111-8111-111111111111';

  it('aceita a assinatura certa dentro da validade', () => {
    const expira = Date.now() + 60_000;
    const s = assinar(anexoId, expira, SEGREDO);
    expect(assinaturaValida(anexoId, expira, s, SEGREDO)).toBe(true);
  });

  it('recusa depois de vencer', () => {
    const expira = Date.now() - 1;
    const s = assinar(anexoId, expira, SEGREDO);
    expect(assinaturaValida(anexoId, expira, s, SEGREDO)).toBe(false);
  });

  it('recusa assinatura de OUTRO anexo — nada de trocar o id na URL', () => {
    const expira = Date.now() + 60_000;
    const s = assinar('bbbbbbbb-2222-4222-8222-222222222222', expira, SEGREDO);
    expect(assinaturaValida(anexoId, expira, s, SEGREDO)).toBe(false);
  });

  it('recusa validade esticada na mão', () => {
    const expira = Date.now() + 60_000;
    const s = assinar(anexoId, expira, SEGREDO);
    expect(assinaturaValida(anexoId, expira + 3_600_000, s, SEGREDO)).toBe(false);
  });

  it('recusa assinatura de outro segredo', () => {
    const expira = Date.now() + 60_000;
    expect(assinaturaValida(anexoId, expira, assinar(anexoId, expira, 'outro'), SEGREDO)).toBe(
      false,
    );
  });

  it('recusa lixo sem estourar', () => {
    const expira = Date.now() + 60_000;
    expect(assinaturaValida(anexoId, expira, '', SEGREDO)).toBe(false);
    expect(assinaturaValida(anexoId, expira, 'nao-e-hex', SEGREDO)).toBe(false);
    expect(assinaturaValida(anexoId, Number.NaN, 'x', SEGREDO)).toBe(false);
  });
});

describe('backend em disco', () => {
  it('guarda e lê de volta os mesmos bytes', async () => {
    const armazem = new ArmazenamentoEmDisco(await raizTemporaria());
    const dados = new Uint8Array([1, 2, 3, 4, 5]);

    const guardado = await armazem.guardar('tenant-a/2026/09/x.bin', dados);
    const lido = await armazem.ler('tenant-a/2026/09/x.bin');

    expect(guardado.bytes).toBe(5);
    expect(lido?.bytes).toBe(5);
    expect(Array.from(lido!.dados)).toEqual([1, 2, 3, 4, 5]);
  });

  it('objeto que não existe é ausência, não erro', async () => {
    const armazem = new ArmazenamentoEmDisco(await raizTemporaria());
    expect(await armazem.ler('tenant-a/nao/existe.bin')).toBeNull();
  });

  it('remove, e remover de novo não estoura', async () => {
    const armazem = new ArmazenamentoEmDisco(await raizTemporaria());
    await armazem.guardar('t/x.bin', new Uint8Array([9]));
    await armazem.remover('t/x.bin');
    expect(await armazem.ler('t/x.bin')).toBeNull();
    await expect(armazem.remover('t/x.bin')).resolves.toBeUndefined();
  });

  it('não escreve nem lê fora da raiz', async () => {
    const raiz = await raizTemporaria();
    const armazem = new ArmazenamentoEmDisco(raiz);

    await expect(armazem.guardar('../fora.bin', new Uint8Array([1]))).rejects.toThrow(
      /fora da raiz/,
    );
    await expect(armazem.ler('../../etc/passwd')).rejects.toThrow(/fora da raiz/);
  });

  it('o vizinho de prefixo não passa por raiz', async () => {
    // `/tmp/pipe-storage-abc` não pode alcançar `/tmp/pipe-storage-abcMAL`.
    const raiz = await raizTemporaria();
    const armazem = new ArmazenamentoEmDisco(raiz);
    await writeFile(`${raiz}MAL`, 'segredo');
    await expect(armazem.ler(`../${raiz.split(/[/\\]/).pop()}MAL`)).rejects.toThrow(/fora da raiz/);
    // E o arquivo continua lá, intocado.
    expect(await readFile(`${raiz}MAL`, 'utf8')).toBe('segredo');
  });
});
