import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CATALOGO_DE_ESCOPOS,
  CATALOGO_DE_EVENTOS,
  ehUuid,
  escoposValidos,
  eventosValidos,
  fusoValido,
  normalizar,
  normalizarEmail,
  recusarCodigoDeCampo,
  recusarEmail,
  recusarNome,
  recusarUrl,
  sugerirCodigo,
  temaValido,
  tipoDeCampoValido,
} from '../src/lib/configuracoes-comum.ts';

/**
 * A régua da área de configurações.
 *
 * Tudo aqui roda nos dois lados: no navegador para não fazer uma viagem à toa, e
 * no servidor porque a server action é um endereço HTTP e qualquer um alcança.
 * Um teste só, sem framework — `node --import tsx --test`, o mesmo padrão de
 * `campos-editaveis.test.ts`.
 *
 * O que ele protege, em ordem de estrago: um código de campo que estraga a chave
 * do `jsonb`, uma URL de webhook em texto claro, e as duas listas copiadas de
 * `apps/api` divergindo em silêncio.
 */

test('tema: só os três, e nada mais', () => {
  for (const bom of ['sistema', 'claro', 'escuro']) assert.ok(temaValido(bom));
  for (const ruim of ['dark', 'Claro', '', null, undefined, 42]) {
    assert.equal(temaValido(ruim), false, `${String(ruim)} não pode passar`);
  }
});

test('branco vira nulo, e espaço nas pontas some', () => {
  assert.equal(normalizar('   '), null);
  assert.equal(normalizar(undefined), null);
  assert.equal(normalizar('  Ana Ribeiro '), 'Ana Ribeiro');
});

test('e-mail é chave: minúsculo e sem espaço', () => {
  assert.equal(normalizarEmail('  Ana@Exemplo.COM.br '), 'ana@exemplo.com.br');
  assert.equal(normalizarEmail(''), null);
  assert.equal(recusarEmail('ana@exemplo.com.br'), null);
  assert.ok(recusarEmail(null));
  assert.ok(recusarEmail('ana'));
  assert.ok(recusarEmail('ana@exemplo'));
  assert.ok(recusarEmail('a n a@exemplo.com'));
});

test('nome obrigatório, com teto', () => {
  assert.equal(recusarNome('Pipe'), null);
  assert.ok(recusarNome(null));
  assert.ok(recusarNome('x'.repeat(121)));
  // A queixa nomeia o campo: "O nome do papel", não "O nome".
  assert.match(recusarNome(null, 'O nome do papel') ?? '', /papel/);
});

test('webhook exige https; logo aceita http mas nunca javascript:', () => {
  assert.equal(recusarUrl('https://exemplo.com.br/pipe', { exigirHttps: true }), null);
  assert.ok(recusarUrl('http://exemplo.com.br/pipe', { exigirHttps: true }));

  assert.equal(recusarUrl('http://exemplo.com.br/logo.png'), null);
  // O vetor clássico de `<img src>`: nem `javascript:` nem `data:` são URL de imagem.
  assert.ok(recusarUrl('javascript:alert(1)'));
  assert.ok(recusarUrl('data:image/svg+xml;base64,AAAA'));
  assert.ok(recusarUrl('exemplo.com.br'));

  // Campo opcional em branco não é erro; obrigatório em branco é.
  assert.equal(recusarUrl(null, { obrigatoria: false }), null);
  assert.ok(recusarUrl(null));
});

test('o código do campo sai do rótulo sem acento, sem espaço e começando por letra', () => {
  assert.equal(sugerirCodigo('Faturamento anual'), 'faturamento_anual');
  assert.equal(sugerirCodigo('Nº de funcionários'), 'n_de_funcionarios');
  assert.equal(sugerirCodigo('  Região / UF  '), 'regiao_uf');
  // Começar por dígito é o caso que a regra recusa, e o prefixo é o que salva.
  assert.equal(sugerirCodigo('2026 meta'), 'campo_2026_meta');
  assert.ok(sugerirCodigo('x'.repeat(80)).length <= 40);

  // O que sai de `sugerirCodigo` sempre passa em `recusarCodigoDeCampo`: se um
  // dia deixar de passar, é este assert que conta.
  for (const rotulo of ['Faturamento anual', 'Nº de funcionários', '2026 meta', 'Região / UF']) {
    assert.equal(recusarCodigoDeCampo(sugerirCodigo(rotulo)), null, rotulo);
  }
});

test('o código do campo recusa o que estragaria a chave do jsonb', () => {
  assert.equal(recusarCodigoDeCampo('faturamento_anual'), null);
  for (const ruim of ['', 'A', 'Faturamento', 'com espaço', 'com-traço', '2026', 'ç', 'a'.repeat(41)]) {
    assert.ok(recusarCodigoDeCampo(ruim), `${ruim} não pode passar`);
  }
  assert.ok(recusarCodigoDeCampo(null));
});

test('tipo de campo vem do catálogo, não da requisição', () => {
  assert.ok(tipoDeCampoValido('texto'));
  assert.ok(tipoDeCampoValido('numero'));
  for (const ruim of ['jsonb', 'TEXTO', '', null]) assert.equal(tipoDeCampoValido(ruim), false);
});

test('escopo e evento desconhecidos são descartados, não recusados em bloco', () => {
  assert.deepEqual(escoposValidos(['conversas:ler', 'inventado', 'conversas:ler']), [
    'conversas:ler',
  ]);
  assert.deepEqual(escoposValidos([]), []);
  assert.deepEqual(eventosValidos(['conversa.criada', 'nada.disso']), ['conversa.criada']);
});

test('uuid: o que vira `where` passa por aqui antes', () => {
  assert.ok(ehUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
  for (const ruim of ["' or 1=1--", '3f2504e0', '', null, 42]) assert.equal(ehUuid(ruim), false);
});

test('fuso é validado contra o banco de fusos do runtime', () => {
  assert.ok(fusoValido('America/Sao_Paulo'));
  assert.ok(fusoValido('UTC'));
  assert.equal(fusoValido('America/Nao_Existe'), false);
  assert.equal(fusoValido(''), false);
});

/**
 * As duas listas abaixo são cópias de `apps/api`, porque `apps/crm` não depende
 * dele. Cópia sem guarda diverge: a API ganha um evento, a tela de webhooks não
 * o oferece, e ninguém descobre até alguém perguntar por que não chega nada.
 *
 * Lê o arquivo como TEXTO em vez de importar de propósito — importar criaria a
 * dependência que a cópia existe para evitar.
 */
function listaNoArquivo(caminho: string, constante: string): string[] {
  const fonte = readFileSync(join(import.meta.dirname, '..', '..', '..', caminho), 'utf8');
  const bloco = new RegExp(`${constante}\\s*=\\s*\\[([^\\]]*)\\]`).exec(fonte);
  assert.ok(bloco, `não achei ${constante} em ${caminho}`);
  return [...bloco[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

test('o catálogo de escopos não divergiu de apps/api', () => {
  assert.deepEqual(
    CATALOGO_DE_ESCOPOS.map((e) => e.codigo),
    listaNoArquivo('apps/api/src/autenticacao.ts', 'CATALOGO_ESCOPOS'),
  );
});

test('o catálogo de eventos não divergiu de apps/api', () => {
  assert.deepEqual(
    [...CATALOGO_DE_EVENTOS],
    listaNoArquivo('apps/api/src/webhooks-saida.ts', 'EVENTOS'),
  );
});
