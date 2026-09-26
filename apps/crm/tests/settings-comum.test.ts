import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CATALOG_OF_SCOPES,
  CATALOGO_DE_EVENTOS,
  ehUuid,
  scopesValid,
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
} from '../src/lib/settings-comum.ts';

/**
 * The settings area's ruler.
 *
 * Everything here runs on both sides: in the browser to avoid a wasted round
 * trip, and on the server because the server action is an HTTP address and
 * anyone can reach it. A single test, no framework — `node --import tsx --test`,
 * the same pattern as `campos-editaveis.test.ts`.
 *
 * What it protects, in order of damage: a field code that corrupts the
 * `jsonb` key, a webhook URL in plaintext, and the two lists copied from
 * `apps/api` drifting silently.
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

test('email is the key: lowercase and without spaces', () => {
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
  // The complaint names the field: "The role's name", not "The name".
  assert.match(recusarNome(null, 'O nome do papel') ?? '', /papel/);
});

test('webhook exige https; logo aceita http mas nunca javascript:', () => {
  assert.equal(recusarUrl('https://exemplo.com.br/pipe', { exigirHttps: true }), null);
  assert.ok(recusarUrl('http://exemplo.com.br/pipe', { exigirHttps: true }));

  assert.equal(recusarUrl('http://exemplo.com.br/logo.png'), null);
  // The classic `<img src>` vector: neither `javascript:` nor `data:` are image URLs.
  assert.ok(recusarUrl('javascript:alert(1)'));
  assert.ok(recusarUrl('data:image/svg+xml;base64,AAAA'));
  assert.ok(recusarUrl('exemplo.com.br'));

  // A blank optional field isn't an error; a blank required one is.
  assert.equal(recusarUrl(null, { obrigatoria: false }), null);
  assert.ok(recusarUrl(null));
});

test('the field code is derived from the label without accents or spaces, and starting with a letter', () => {
  assert.equal(sugerirCodigo('Faturamento anual'), 'faturamento_anual');
  assert.equal(sugerirCodigo('Nº de funcionários'), 'n_de_funcionarios');
  assert.equal(sugerirCodigo('  Região / UF  '), 'regiao_uf');
  // Starting with a digit is the case the rule rejects, and the prefix is what saves it.
  assert.equal(sugerirCodigo('2026 meta'), 'campo_2026_meta');
  assert.ok(sugerirCodigo('x'.repeat(80)).length <= 40);

  // O que sai de `sugerirCodigo` sempre passa em `recusarCodigoDeCampo`: se um
  // should ever stop passing, this is the assert that catches it.
  for (const rotulo of ['Faturamento anual', 'Nº de funcionários', '2026 meta', 'Região / UF']) {
    assert.equal(recusarCodigoDeCampo(sugerirCodigo(rotulo)), null, rotulo);
  }
});

test('the field code rejects anything that would break the jsonb key', () => {
  assert.equal(recusarCodigoDeCampo('faturamento_anual'), null);
  for (const ruim of ['', 'A', 'Faturamento', 'com espaço', 'com-traço', '2026', 'ç', 'a'.repeat(41)]) {
    assert.ok(recusarCodigoDeCampo(ruim), `${ruim} não pode passar`);
  }
  assert.ok(recusarCodigoDeCampo(null));
});

test('field type comes from the catalog, not from the request', () => {
  assert.ok(tipoDeCampoValido('texto'));
  assert.ok(tipoDeCampoValido('numero'));
  for (const ruim of ['jsonb', 'TEXTO', '', null]) assert.equal(tipoDeCampoValido(ruim), false);
});

test('unknown scope and event are discarded individually, not rejected as a whole batch', () => {
  assert.deepEqual(scopesValid(['conversas:ler', 'inventado', 'conversas:ler']), [
    'conversas:ler',
  ]);
  assert.deepEqual(scopesValid([]), []);
  assert.deepEqual(eventosValidos(['conversa.criada', 'nada.disso']), ['conversa.criada']);
});

test('uuid: whatever becomes a `where` clause passes through here first', () => {
  assert.ok(ehUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
  for (const ruim of ["' or 1=1--", '3f2504e0', '', null, 42]) assert.equal(ehUuid(ruim), false);
});

test('timezone is validated against the runtime\'s timezone database', () => {
  assert.ok(fusoValido('America/Sao_Paulo'));
  assert.ok(fusoValido('UTC'));
  assert.equal(fusoValido('America/Nao_Existe'), false);
  assert.equal(fusoValido(''), false);
});

/**
 * The two lists below are copies of `apps/api`'s, because `apps/crm` doesn't
 * depend on it. An unguarded copy drifts: the API gets a new event, the
 * webhooks screen doesn't offer it, and nobody finds out until someone asks
 * why nothing arrives.
 *
 * Reads the file as TEXT instead of importing it on purpose — importing would
 * create the dependency the copy exists to avoid.
 */
function listInFile(caminho: string, constante: string): string[] {
  const fonte = readFileSync(join(import.meta.dirname, '..', '..', '..', caminho), 'utf8');
  const block = new RegExp(`${constante}\\s*=\\s*\\[([^\\]]*)\\]`).exec(fonte);
  assert.ok(block, `não achei ${constante} em ${caminho}`);
  return [...block[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

test('the scope catalog has not diverged from apps/api', () => {
  assert.deepEqual(
    CATALOG_OF_SCOPES.map((e) => e.codigo),
    listInFile('apps/api/src/autenticacao.ts', 'CATALOGO_ESCOPOS'),
  );
});

test('o catálogo de eventos não divergiu de apps/api', () => {
  assert.deepEqual(
    [...CATALOGO_DE_EVENTOS],
    listInFile('apps/api/src/webhooks-saida.ts', 'EVENTOS'),
  );
});
