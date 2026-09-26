import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  StorageInDisk,
  MAX_BYTES_AUDIO_VIDEO,
  MAX_BYTES_BY_FILE,
  assinar,
  assinaturaValida,
  keyOfAttachment,
  keyOfTenant,
  maxBytesDoMime,
  mimeAceito,
  mimeParaServir,
  serveAsAttachment,
  tipoDoMime,
  tipoReal,
} from '../src/index.js';

const SECRET = 'segredo-de-teste';

async function raizTemporaria(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pipe-storage-'));
}

describe('limites, copiados do settings.json da Blip', () => {
  it('mantém os números deles', () => {
    expect(MAX_BYTES_BY_FILE).toBe(104_857_600);
    expect(MAX_BYTES_AUDIO_VIDEO).toBe(16_777_216);
  });

  it('Apply the lower size limit to audio and video files', () => {
    // The Blip client checks only 100 MB and allows audio uploads that the platform
    // rejects later. Here the correct limit applies during validation.
    expect(maxBytesDoMime('audio/mpeg')).toBe(MAX_BYTES_AUDIO_VIDEO);
    expect(maxBytesDoMime('video/mp4')).toBe(MAX_BYTES_AUDIO_VIDEO);
    expect(maxBytesDoMime('application/pdf')).toBe(MAX_BYTES_BY_FILE);
    expect(maxBytesDoMime('image/png')).toBe(MAX_BYTES_BY_FILE);
  });

  it('aceita o que a Blip aceita e recusa o resto', () => {
    expect(mimeAceito('application/pdf')).toBe(true);
    expect(mimeAceito('image/webp')).toBe(true);
    expect(mimeAceito('text/csv')).toBe(true);
    expect(mimeAceito('application/x-msdownload')).toBe(false);
    expect(mimeAceito('application/octet-stream')).toBe(false);
  });

  it('Accept SVG as a document and force attachment delivery', () => {
    // SVG is executable XML; rendering it inline causes XSS.
    expect(mimeAceito('image/svg+xml')).toBe(true);
    expect(tipoDoMime('image/svg+xml')).toBe('documento');
    expect(serveAsAttachment('image/svg+xml')).toBe(true);
    expect(serveAsAttachment('text/html')).toBe(true);
    expect(serveAsAttachment('image/png')).toBe(false);
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
    expect(tipoReal(html)).toBeNull();
    expect(mimeParaServir('text/html', html)).toBe('text/html');
    // E `text/html` nunca vai inline.
    expect(serveAsAttachment(mimeParaServir('text/html', html))).toBe(true);
  });

  it('os BYTES ganham do que o upload declarou', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(mimeParaServir('application/pdf', png)).toBe('image/png');
  });

  it('não inventa tipo quando não há assinatura', () => {
    expect(tipoReal(new TextEncoder().encode('nome;valor\n1;2'))).toBeNull();
    expect(mimeParaServir('text/csv', new TextEncoder().encode('a;b'))).toBe('text/csv');
  });

  it('Return no detected type for files too short to identify', () => {
    expect(tipoReal(new Uint8Array([]))).toBeNull();
    expect(tipoReal(new Uint8Array([0x89]))).toBeNull();
  });
});

describe('Isolate object paths by tenant', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';

  it('Prefix every attachment key with its tenant ID', () => {
    expect(keyOfAttachment(tenant, 'foto.png').startsWith(`${tenant}/`)).toBe(true);
  });

  it('duas chamadas nunca colidem, mesmo com o mesmo nome', () => {
    expect(keyOfAttachment(tenant, 'foto.png')).not.toBe(keyOfAttachment(tenant, 'foto.png'));
  });

  it('Reject another tenant\'s key and directory traversal', () => {
    const outro = '22222222-2222-4222-8222-222222222222';
    expect(keyOfTenant(`${tenant}/2026/09/x.png`, tenant)).toBe(true);
    expect(keyOfTenant(`${outro}/2026/09/x.png`, tenant)).toBe(false);
    expect(keyOfTenant(`${tenant}/../${outro}/x.png`, tenant)).toBe(false);
    expect(keyOfTenant(`/etc/passwd`, tenant)).toBe(false);
    expect(keyOfTenant(`${tenant}\\x.png`, tenant)).toBe(false);
  });

  it('Sanitize suspicious filename extensions before creating object keys', () => {
    const key = keyOfAttachment(tenant, 'arquivo.exe%00.png');
    expect(key).toMatch(/\.png$/);
    expect(key).not.toContain('%00');
  });
});

describe('Sign attachment links with an expiration time', () => {
  const attachmentId = 'aaaaaaaa-1111-4111-8111-111111111111';

  it('Accept a valid signature before it expires', () => {
    const expira = Date.now() + 60_000;
    const s = assinar(attachmentId, expira, SECRET);
    expect(assinaturaValida(attachmentId, expira, s, SECRET)).toBe(true);
  });

  it('recusa depois de vencer', () => {
    const expira = Date.now() - 1;
    const s = assinar(attachmentId, expira, SECRET);
    expect(assinaturaValida(attachmentId, expira, s, SECRET)).toBe(false);
  });

  it('Reject a signature made for a different attachment ID', () => {
    const expira = Date.now() + 60_000;
    const s = assinar('bbbbbbbb-2222-4222-8222-222222222222', expira, SECRET);
    expect(assinaturaValida(attachmentId, expira, s, SECRET)).toBe(false);
  });

  it('Reject a manually extended signed-link expiration', () => {
    const expira = Date.now() + 60_000;
    const s = assinar(attachmentId, expira, SECRET);
    expect(assinaturaValida(attachmentId, expira + 3_600_000, s, SECRET)).toBe(false);
  });

  it('Reject a signature made with a different secret', () => {
    const expira = Date.now() + 60_000;
    expect(assinaturaValida(attachmentId, expira, assinar(attachmentId, expira, 'outro'), SECRET)).toBe(
      false,
    );
  });

  it('recusa lixo sem estourar', () => {
    const expira = Date.now() + 60_000;
    expect(assinaturaValida(attachmentId, expira, '', SECRET)).toBe(false);
    expect(assinaturaValida(attachmentId, expira, 'nao-e-hex', SECRET)).toBe(false);
    expect(assinaturaValida(attachmentId, Number.NaN, 'x', SECRET)).toBe(false);
  });
});

describe('backend em disco', () => {
  it('Read back the same bytes that were stored', async () => {
    const armazem = new StorageInDisk(await raizTemporaria());
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const guardado = await armazem.guardar('tenant-a/2026/09/x.bin', data);
    const lido = await armazem.ler('tenant-a/2026/09/x.bin');

    expect(guardado.bytes).toBe(5);
    expect(lido?.bytes).toBe(5);
    expect(Array.from(lido!.data)).toEqual([1, 2, 3, 4, 5]);
  });

  it('Return null for a missing object', async () => {
    const armazem = new StorageInDisk(await raizTemporaria());
    expect(await armazem.ler('tenant-a/nao/existe.bin')).toBeNull();
  });

  it('remove, e remover de novo não estoura', async () => {
    const armazem = new StorageInDisk(await raizTemporaria());
    await armazem.guardar('t/x.bin', new Uint8Array([9]));
    await armazem.remover('t/x.bin');
    expect(await armazem.ler('t/x.bin')).toBeNull();
    await expect(armazem.remover('t/x.bin')).resolves.toBeUndefined();
  });

  it('não escreve nem lê fora da raiz', async () => {
    const raiz = await raizTemporaria();
    const armazem = new StorageInDisk(raiz);

    await expect(armazem.guardar('../fora.bin', new Uint8Array([1]))).rejects.toThrow(
      /fora da raiz/,
    );
    await expect(armazem.ler('../../etc/passwd')).rejects.toThrow(/fora da raiz/);
  });

  it('Reject a sibling path that merely shares the storage root prefix', async () => {
    // `/tmp/pipe-storage-abc` must not be able to reach `/tmp/pipe-storage-abcMAL`.
    const raiz = await raizTemporaria();
    const armazem = new StorageInDisk(raiz);
    await writeFile(`${raiz}MAL`, 'segredo');
    await expect(armazem.ler(`../${raiz.split(/[/\\]/).pop()}MAL`)).rejects.toThrow(/fora da raiz/);
    expect(await readFile(`${raiz}MAL`, 'utf8')).toBe('segredo');
  });
});
