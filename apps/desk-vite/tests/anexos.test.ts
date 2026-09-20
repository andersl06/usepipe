import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ARQUIVOS_POR_ENVIO,
  MAX_BYTES_AUDIO_VIDEO,
  MAX_BYTES_POR_ARQUIVO,
  recusaDoLote,
  type ArquivoDoLote,
} from '../src/lib/anexos';

function arquivo(name: string, type: string, size: number): ArquivoDoLote {
  return { name, type, size };
}

test('lote dentro dos limites passa', () => {
  const lote = [
    arquivo('foto.png', 'image/png', 2_000_000),
    arquivo('contrato.pdf', 'application/pdf', MAX_BYTES_POR_ARQUIVO),
    arquivo('audio.ogg', 'audio/ogg', MAX_BYTES_AUDIO_VIDEO),
  ];
  assert.equal(recusaDoLote(lote), null);
});

test('mais de dez arquivos recusa o lote inteiro, dizendo quantos vieram', () => {
  const lote = Array.from({ length: MAX_ARQUIVOS_POR_ENVIO + 1 }, (_, i) =>
    arquivo(`f${i}.png`, 'image/png', 10),
  );
  const motivo = recusaDoLote(lote);
  assert.ok(motivo?.includes(`máximo ${MAX_ARQUIVOS_POR_ENVIO}`));
  assert.ok(motivo?.includes('11'));
  assert.ok(motivo?.includes('Nenhum arquivo foi enviado.'));
});

test('um arquivo grande demais no meio recusa o lote e cita o nome', () => {
  const lote = [
    arquivo('ok.png', 'image/png', 10),
    arquivo('video.mp4', 'video/mp4', MAX_BYTES_AUDIO_VIDEO + 1),
    arquivo('ok2.png', 'image/png', 10),
  ];
  const motivo = recusaDoLote(lote);
  assert.ok(motivo?.includes('"video.mp4"'));
  assert.ok(motivo?.includes('16 MB'));
});

test('documento acima de 100 MB recusa; áudio de 20 MB recusa mesmo abaixo de 100', () => {
  assert.ok(recusaDoLote([arquivo('a.pdf', 'application/pdf', MAX_BYTES_POR_ARQUIVO + 1)]));
  assert.ok(recusaDoLote([arquivo('a.mp3', 'audio/mpeg', 20 * 1_048_576)]));
});

test('arquivo vazio e seleção vazia são recusados', () => {
  assert.ok(recusaDoLote([arquivo('vazio.txt', 'text/plain', 0)])?.includes('"vazio.txt"'));
  assert.equal(recusaDoLote([]), 'Escolha ao menos um arquivo.');
});
