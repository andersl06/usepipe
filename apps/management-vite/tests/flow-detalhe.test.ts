import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_VISIVEL,
  itensDoMenu,
  numeroDaHome,
  pilhaDaEquipe,
} from '../src/pages/flow/itens';

/**
 * The contact bar's row (`/fluxo/{id}`).
 *
 * What this file locks down is the screen's only decision: what the ROUTER shows and the FLOW doesn't, and vice versa. In the source this comes from two places far apart from each other — `getTemplateSetupItem()` (which prepends "Serviços" for `master`) and the claims map's `hideInTemplate` (which hides `builder` and `desk` in that same `master`) — and it's exactly the kind of rule that comes back wrong in a silent refactor: the screen keeps loading, it just starts offering the router a builder it doesn't have.
 */

const ID = '5b6843ae-b4f8-4bc0-bce2-e32318043297';
/** `base` is `flowPath(shortName)` (D-52) — the tree is single now, no `/flow/` or `/router/` prefix to pick. */
const BASE = `/application/detail/${ID}`;

test('analytics leads to the contact\'s OWN analytics', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const analytics = itensDoMenu(tipo, BASE).find((i) => i.rotulo === 'Análise');
    assert.equal(analytics?.href, `${BASE}/analytics`);
  }
});

test('Channels leads to the contact\'s OWN channels', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const channels = itensDoMenu(tipo, BASE).find((i) => i.rotulo === 'Canais');
    assert.equal(channels?.href, `${BASE}/channels`);
  }
});

test('Contacts and Content open their areas within the contact\'s context', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const itens = itensDoMenu(tipo, BASE);
    /* `contacts` → `users` (D-54, route-inventory.md §2). */
    assert.equal(itens.find((i) => i.rotulo === 'Contatos')?.href, `${BASE}/users`);
    assert.equal(itens.find((i) => i.rotulo === 'Conteúdos')?.href, `${BASE}/contents`);
    assert.equal(itens.find((i) => i.rotulo === 'Recursos')?.href, `${BASE}/resources`);
  }
});

test('Growth and Log open their screens within the contact\'s context', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const itens = itensDoMenu(tipo, BASE);
    assert.equal(
      itens.find((i) => i.rotulo === 'Growth')?.href,
      `${BASE}/growth/active-messages`,
    );
    assert.equal(itens.find((i) => i.rotulo === 'Log')?.href, `${BASE}/log`);
  }
});

test('a fonte da subbarra não inclui Inteligência artificial sem claims do bot', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    assert.ok(!itensDoMenu(tipo, BASE).some((item) => item.rotulo === 'Inteligência artificial'));
  }
});

test('the router offers neither Builder nor Attendance', () => {
  const rotulos = itensDoMenu('roteador', BASE).map((i) => i.rotulo);
  assert.ok(!rotulos.includes('Builder'));
  assert.ok(!rotulos.includes('Atendimento'));
});

test('the router opens with "Services", the template\'s item', () => {
  assert.equal(itensDoMenu('roteador', BASE)[0]?.rotulo, 'Serviços');
  /*
   * And the flow has no template item at all: the source's `switch` has no case for `builder`.
   */
  assert.equal(itensDoMenu('fluxo', BASE)[0]?.rotulo, 'Builder');
});

test('the flow keeps the two the router loses', () => {
  const rotulos = itensDoMenu('fluxo', BASE).map((i) => i.rotulo);
  assert.ok(rotulos.includes('Builder'));
  assert.ok(rotulos.includes('Atendimento'));
});

test('Builder leads to the D-54 segment, templates/builder', () => {
  const builder = itensDoMenu('fluxo', BASE).find((item) => item.rotulo === 'Builder');
  assert.equal(builder?.href, `${BASE}/templates/builder`);
});

test('Services (router template item) leads to templates/pipeline (D-54)', () => {
  const services = itensDoMenu('roteador', BASE).find((item) => item.rotulo === 'Serviços');
  assert.equal(services?.href, `${BASE}/templates/pipeline`);
});

test('Attendance still lands on the internal monitoring route', () => {
  const attendance = itensDoMenu('fluxo', BASE).find((item) => item.rotulo === 'Atendimento');
  assert.equal(attendance?.href, `${BASE}/attendance/monitoring`);
});

test('the rest of the row is the same in both, and in the same order', () => {
  const semEspecificos = (tipo: 'fluxo' | 'roteador') =>
    itensDoMenu(tipo, BASE)
      .map((i) => i.rotulo)
      .filter((r) => !['Serviços', 'Builder', 'Atendimento'].includes(r));
  assert.deepEqual(semEspecificos('roteador'), semEspecificos('fluxo'));
  assert.deepEqual(semEspecificos('fluxo'), [
    'Análise',
    'Growth',
    'Canais',
    'Contatos',
    'Conteúdos',
    'Recursos',
    'Log',
    'Pagamentos',
  ]);
});

test('the five visible ones are the order measured in the source', () => {
  /*
   * `application-detail-pipeprincipal-configurations-basic.html` (builder) and `roteador-team__pagina.html` (master), the source of both.
   */
  const rotulos = (tipo: 'fluxo' | 'roteador') =>
    itensDoMenu(tipo, BASE)
      .slice(0, LIMITE_VISIVEL)
      .map((i) => i.rotulo);
  assert.deepEqual(rotulos('fluxo'), ['Builder', 'Atendimento', 'Análise', 'Growth', 'Canais']);
  assert.deepEqual(rotulos('roteador'), ['Serviços', 'Análise', 'Growth', 'Canais', 'Contatos']);
});

test('sobra item para o "…" nos dois tipos', () => {
  /*
   * If the row ever fits entirely in five, the "…" disappears from the screen — and that's what the design expects. The test exists to flag it when that changes.
   */
  assert.ok(itensDoMenu('fluxo', BASE).length > LIMITE_VISIVEL);
  assert.ok(itensDoMenu('roteador', BASE).length > LIMITE_VISIVEL);
});

/*
 * The source's step 2 (`getUpdatedMenus()`): the row sieved by THIS PERSON's permissions on that bot. Without the argument nothing changes — that's what the tests above lock down, and it's what every tenant that never opened Team sees.
 */
const SO_ISSO = (permissoes: Record<string, 'nenhum' | 'ler' | 'escrever'>) => ({
  papelNoFluxo: 'personalizado' as const,
  permissoes,
  editsByAccount: false,
});

test('the flow\'s permissions hide what the person cannot see', () => {
  const itens = itensDoMenu('fluxo', BASE, SO_ISSO({ builder: 'escrever', analysis: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Builder', 'Análise'],
  );
});

test('"No permission" disappears from the bar, and the destination stays the same as always', () => {
  const itens = itensDoMenu('fluxo', BASE, SO_ISSO({ builder: 'nenhum', channels: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Canais'],
  );
  assert.equal(itens[0]?.href, `${BASE}/channels`);
});

test('"Conteúdos" is the `resources` entry on the permission list, not `contents`', () => {
  /*
   * It's the only key on which the source's two lists disagree by name — and Pipe's own "Recursos"
   * item (the screen actually behind Blip's `resources` permission) shares that same gate, so
   * granting `resources` reveals both Pipe screens at once.
   */
  assert.deepEqual(
    itensDoMenu('fluxo', BASE, SO_ISSO({ resources: 'ler' })).map((i) => i.rotulo),
    ['Conteúdos', 'Recursos'],
  );
  assert.deepEqual(itensDoMenu('fluxo', BASE, SO_ISSO({ contents: 'ler' })), []);
});

test('whoever edits the flow through the ACCOUNT still sees the entire row', () => {
  /*
   * The other side of the double gate: account permission isn't sieved by the flow's permission, otherwise 0035 would strip access from people who already had it.
   */
  const account = { papelNoFluxo: null, permissoes: {}, editsByAccount: true };
  assert.deepEqual(itensDoMenu('fluxo', BASE, account), itensDoMenu('fluxo', BASE));
});

test('the router template\'s item does not go through the permission sieve', () => {
  /*
   * `getTemplateSetupItem()` runs BEFORE `getUpdatedMenus()` and isn't from the catalog: "Serviços" stays even when the person has no resource at all.
   */
  const itens = itensDoMenu('roteador', BASE, SO_ISSO({}));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Serviços'],
  );
});

test('a pilha da equipe: sete rostos e um "+N" que para em 9', () => {
  const gente = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ nome: `P ${i}`, fotoUrl: null }));
  assert.equal(pilhaDaEquipe(gente(7)).length, 7);
  const oito = pilhaDaEquipe(gente(8));
  assert.equal(oito.length, 8);
  assert.equal(oito[7]?.nome, '+ 1');
  assert.equal(pilhaDaEquipe(gente(30))[7]?.nome, '+ 9');
});

test('o número da home arredonda para baixo, com "+", como o processNumber', () => {
  assert.equal(numeroDaHome(10), '10');
  assert.equal(numeroDaHome(57), '+50');
  assert.equal(numeroDaHome(1234), '+1K');
  assert.equal(numeroDaHome(25000), '+20K');
  assert.equal(numeroDaHome(250000), '+200K');
  assert.equal(numeroDaHome(3500000), '+3M');
});
