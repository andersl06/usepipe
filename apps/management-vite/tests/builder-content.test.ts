import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBlock } from '../src/pages/builder/model.ts';
import {
  adicionarConteudo,
  cardsOf,
  contentErrors,
  definirMidia,
  novaFigurinha,
  novaImagem,
  novoAudio,
  novoDocumento,
  novoVideo,
  novoDigitando,
  novoPedirLocalizacao,
  novaLocalizacao,
  novoWebLink,
  novoConteudoDinamico,
  novoConteudoHttp,
} from '../src/pages/builder/conteudo.ts';
import type { ItemDeConteudo } from '../src/pages/builder/model.ts';

/**
 * Round trip for each `conteudo-midia` type approved at the gate (D-18/D-24): create ->
 * add to a block -> read back with `cardsOf` as the same card, with no loss. All five share
 * `application/vnd.lime.media-link+json`; the reference tells them apart only by the file's
 * real MIME, so the editor remembers the chosen card via `$typeOfContent`
 * (`ref/inventario-conteudo.md`).
 */

const TIPOS = [
  { nome: 'figurinha', midia: 'sticker', criar: novaFigurinha },
  { nome: 'audio', midia: 'audio', criar: novoAudio },
  { nome: 'imagem', midia: 'image', criar: novaImagem },
  { nome: 'video', midia: 'video', criar: novoVideo },
  { nome: 'documento', midia: 'document', criar: novoDocumento },
] as const;

for (const { nome, midia, criar } of TIPOS) {
  test(`${nome}: ida e volta sem perda (uri e legenda)`, () => {
    const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
    const item: ItemDeConteudo = criar(`https://cdn.exemplo.com/${nome}.arquivo`, `legenda de ${nome}`);
    const r = adicionarConteudo(bloco, item);
    assert.equal(r.ok, true);
    if (!r.ok) return;

    const cartoes = cardsOf(r.block).filter((c) => c.tipo === 'midia');
    assert.equal(cartoes.length, 1);
    const cartao = cartoes[0]!;
    assert.equal(cartao.midia, midia);
    assert.equal(cartao.uri, `https://cdn.exemplo.com/${nome}.arquivo`);
    assert.equal(cartao.legenda, `legenda de ${nome}`);
  });

  test(`${nome}: sem uri é apontado por contentErrors com a mensagem literal`, () => {
    const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
    const r = adicionarConteudo(bloco, criar('', ''));
    assert.equal(r.ok, true);
    if (!r.ok) return;

    assert.deepEqual(contentErrors(r.block), ["O campo 'uri' é obrigatório no conteúdo de mídia."]);
  });
}

test('definirMidia atualiza uri e legenda preservando o MIME real', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
  const r = adicionarConteudo(bloco, novaImagem('https://cdn.exemplo.com/a.png', ''));
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const atualizado = definirMidia(r.block, 0, 'https://cdn.exemplo.com/b.png', 'Foto B');
  const [cartao] = cardsOf(atualizado).filter((c) => c.tipo === 'midia');
  assert.equal(cartao!.uri, 'https://cdn.exemplo.com/b.png');
  assert.equal(cartao!.legenda, 'Foto B');
  assert.equal(contentErrors(atualizado).length, 0);
});

test('documento maior que o limite de 100 MB é apontado com a mensagem literal do inventário', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
  const r = adicionarConteudo(bloco, novoDocumento('https://cdn.exemplo.com/doc.pdf', ''));
  assert.equal(r.ok, true);
  if (!r.ok) return;

  // No upload widget yet (`ref/inventario-conteudo.md`, capturas #4-#8 pendentes): simulate an
  // imported flow that already declares `content.size`, as `engineContentErrors` (`@pipe/core`)
  // reads it.
  const acao = r.block.$contentActions![0]!.action!;
  const settings = acao.settings as { content: Record<string, unknown> };
  settings.content['size'] = 120 * 1024 * 1024;

  assert.deepEqual(contentErrors(r.block), [
    'Arquivo de 120,0 MB passa do limite de 100,0 MB para documento.',
  ]);
});

test('figurinha e imagem, ambas image/*, voltam a ler como o mesmo tipo de mídia sem $typeOfContent (fluxo importado)', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
  const r = adicionarConteudo(bloco, novaFigurinha('https://cdn.exemplo.com/fig.webp', ''));
  assert.equal(r.ok, true);
  if (!r.ok) return;

  // The engine never receives `$typeOfContent`; strip it as `converterDoEditor` would, to
  // prove the fallback (`categoriaDaMidia`) reads the real MIME the same way the motor does.
  delete r.block.$contentActions![0]!.action!['$typeOfContent'];
  const [cartao] = cardsOf(r.block).filter((c) => c.tipo === 'midia');
  assert.equal(cartao!.midia, 'image');
});

test('interactive content factories round trip through cardsOf', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
  let atual = bloco;
  for (const item of [novoDigitando(), novoPedirLocalizacao('Compartilhe sua localização'), novaLocalizacao('-19.9', '-43.9'), novoWebLink('https://example.com', 'Abrir')]) {
    const r = adicionarConteudo(atual, item);
    assert.equal(r.ok, true);
    if (r.ok) atual = r.block;
  }
  assert.deepEqual(cardsOf(atual).filter((c) => c.tipo !== 'entrada').map((c) => c.tipo), ['digitando', 'pedirLocalizacao', 'localizacao', 'webLink']);
  assert.deepEqual(contentErrors(atual), []);
});

test('dynamic content factories round trip through cardsOf', () => {
  const bloco = newBlock({}, { top: 0, left: 0 }, 'b1');
  const http = adicionarConteudo(bloco, novoConteudoHttp('https://content.example/message', 'text/plain', { authorization: 'Bearer x' }));
  assert.equal(http.ok, true);
  if (!http.ok) return;
  const dynamic = adicionarConteudo(http.block, novoConteudoDinamico('conteudoLime'));
  assert.equal(dynamic.ok, true);
  if (!dynamic.ok) return;
  assert.deepEqual(cardsOf(dynamic.block).filter((c) => c.tipo !== 'entrada').map((c) => c.tipo), ['http', 'dinamico']);
  assert.deepEqual(contentErrors(dynamic.block), []);
});
