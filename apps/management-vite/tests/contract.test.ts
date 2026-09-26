import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOGO,
  PAPEIS_DA_ORIGEM,
  cardsVisible,
  accountEhRole,
  readMemberTargets,
  permissionRequired,
} from '../src/pages/contract/catalogo';

/**
 * The Contract Panel's card filter.
 *
 * It's the rule that decides what each role sees, and getting it wrong doesn't break the screen: it opens, looking fine, showing whoever can't access it a path to something that isn't theirs — which is the kind of defect nobody sees in staging and that shows up in the first contract audit.
 *
 * The source's funnel has three steps (flag, metric, permission); ours has just one, because we have neither a flag nor a subscription. What this test pins down is that one step, plus the demo-mode gate — which shows everything and, for that very reason, must never leak into any write.
 */

test('with no account permission at all, no card appears', () => {
  assert.deepEqual(cardsVisible([]), []);
  /*
   * Their `guest`: reads the summary and the workspace, and sees zero cards — the source's only workspace card requires WRITE.
   */
  assert.deepEqual(cardsVisible(['conta.resumo.ler', 'conta.workspace.ler']), []);
});

test('each card shows the permission it requires, and only that one', () => {
  for (const card of CATALOGO) {
    const codigo = permissionRequired(card);
    const vistos = cardsVisible([codigo]).map((c) => c.id);
    assert.ok(vistos.includes(card.id), `${card.id} deveria aparecer com ${codigo}`);
  }

  // Reading members doesn't grant the card that requires WRITING members (their `e` check).
  const readOnly = cardsVisible(['conta.membros.ler']).map((c) => c.id);
  assert.ok(readOnly.includes('membros'));
  assert.ok(!readOnly.includes('chamadas'));
});

test('demo mode shows the entire catalog, even with no permission at all', () => {
  const previa = cardsVisible([], { demo: true });
  assert.equal(previa.length, CATALOGO.length);
  // And it's still just a mockup: the card that has no route yet still shows "em breve" (coming soon).
  assert.ok(previa.some((c) => !c.pronto));
});

test('the three account roles have their labels and icons, in the source\'s order', () => {
  assert.deepEqual(Object.keys(PAPEIS_DA_ORIGEM), ['guest', 'member', 'admin']);
  assert.deepEqual(
    Object.values(PAPEIS_DA_ORIGEM).map((p) => [p.rotulo, p.icone]),
    [
      ['Pode visualizar', 'olho'],
      ['Pode editar', 'editar'],
      ['Admin', 'avatar'],
    ],
  );
});

test('attendance role is not account role, and a raw name never becomes a label', () => {
  for (const nome of ['admin', 'member', 'guest']) assert.ok(accountEhRole(nome));
  for (const nome of ['administrador', 'gestor', 'supervisor', 'atendente', 'avaliador', '', null]) {
    assert.ok(!accountEhRole(nome), `${nome} não é papel de conta`);
  }
  // `toString` exists on every object; it must not pass as a role.
  assert.ok(!accountEhRole('toString'));
});

/**
 * Reading the Members screen's targets.
 *
 * It's a trust boundary: what comes in are browser strings, and they decide whether to touch `usuario` or `convite`. An unknown prefix that slipped through here would turn into a query with another table's id.
 */
test('only targets with a known prefix and a filled-in id pass', () => {
  assert.deepEqual(readMemberTargets(['usuario:u1', 'convite:c1']), [
    { tipo: 'usuario', id: 'u1' },
    { tipo: 'convite', id: 'c1' },
  ]);

  // A prefix that doesn't exist, no prefix, an empty id, and just whitespace: none of it gets through.
  assert.deepEqual(readMemberTargets(['papel:p1', 'u1', 'usuario:', 'convite:   ', '']), []);

  // The id may contain colons; only the FIRST one splits it from the prefix.
  assert.deepEqual(readMemberTargets(['usuario:a:b']), [{ tipo: 'usuario', id: 'a:b' }]);
});
