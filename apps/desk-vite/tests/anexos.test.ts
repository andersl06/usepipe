import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILES_BY_ENVIO,
  MAX_BYTES_AUDIO_VIDEO,
  MAX_BYTES_BY_FILE,
  recusaDoLote,
  type LoteFile,
} from '../src/lib/anexos';

function file(name: string, type: string, size: number): LoteFile {
  return { name, type, size };
}

test('lote dentro dos limites passa', () => {
  const lote = [
    file('foto.png', 'image/png', 2_000_000),
    file('contrato.pdf', 'application/pdf', MAX_BYTES_BY_FILE),
    file('audio.ogg', 'audio/ogg', MAX_BYTES_AUDIO_VIDEO),
  ];
  assert.equal(recusaDoLote(lote), null);
});

test('more than ten files rejects the whole batch, reporting how many were sent', () => {
  const lote = Array.from({ length: MAX_FILES_BY_ENVIO + 1 }, (_, i) =>
    file(`f${i}.png`, 'image/png', 10),
  );
  const motivo = recusaDoLote(lote);
  assert.ok(motivo?.includes(`máximo ${MAX_FILES_BY_ENVIO}`));
  assert.ok(motivo?.includes('11'));
  assert.ok(motivo?.includes('Nenhum arquivo foi enviado.'));
});

test('an oversized file in the middle rejects the batch and names it', () => {
  const lote = [
    file('ok.png', 'image/png', 10),
    file('video.mp4', 'video/mp4', MAX_BYTES_AUDIO_VIDEO + 1),
    file('ok2.png', 'image/png', 10),
  ];
  const motivo = recusaDoLote(lote);
  assert.ok(motivo?.includes('"video.mp4"'));
  assert.ok(motivo?.includes('16 MB'));
});

test('a document over 100 MB is rejected; audio over 20 MB is rejected even though it is under 100', () => {
  assert.ok(recusaDoLote([file('a.pdf', 'application/pdf', MAX_BYTES_BY_FILE + 1)]));
  assert.ok(recusaDoLote([file('a.mp3', 'audio/mpeg', 20 * 1_048_576)]));
});

test('an empty file and an empty selection are both rejected', () => {
  assert.ok(recusaDoLote([file('vazio.txt', 'text/plain', 0)])?.includes('"vazio.txt"'));
  assert.equal(recusaDoLote([]), 'Escolha ao menos um arquivo.');
});
