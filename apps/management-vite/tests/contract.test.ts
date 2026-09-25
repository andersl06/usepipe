import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOGO,
  PAPEIS_DA_ORIGEM,
  cardsVisiveis,
  accountEhRole,
  readMemberTargets,
  permissionRequired,
} from '../src/pages/contract/catalogo';

/**
 * O filtro de cartões do Painel do contrato.
 *
 * É a regra que decide o que cada papel vê, e errá-la não quebra a tela: ela
 * abre, bonita, mostrando a quem não pode um caminho para o que não é dele —
 * que é o defeito que ninguém vê em homologação e que aparece na primeira
 * auditoria de contrato.
 *
 * O funil da origem tem três passos (flag, métrica, permissão); o nosso tem um
 * só, porque não temos flag nem assinatura. O que este teste trava é esse passo
 * e o portão do modo demonstração — que mostra tudo e não pode, por isso mesmo,
 * escapar para nenhuma escrita.
 */

test('with no account permission at all, no card appears', () => {
  assert.deepEqual(cardsVisiveis([]), []);
  /* O `guest` deles: lê o resumo e o espaço de trabalho, e vê zero cartões —
     o único cartão de workspace da origem exige ESCRITA. */
  assert.deepEqual(cardsVisiveis(['conta.resumo.ler', 'conta.workspace.ler']), []);
});

test('each card shows the permission it requires, and only that one', () => {
  for (const card of CATALOGO) {
    const codigo = permissionRequired(card);
    const vistos = cardsVisiveis([codigo]).map((c) => c.id);
    assert.ok(vistos.includes(card.id), `${card.id} deveria aparecer com ${codigo}`);
  }

  // Ler membro não dá o cartão que pede ESCREVER membro (a conferência `e` deles).
  const readOnly = cardsVisiveis(['conta.membros.ler']).map((c) => c.id);
  assert.ok(readOnly.includes('membros'));
  assert.ok(!readOnly.includes('chamadas'));
});

test('demo mode shows the entire catalog, even with no permission at all', () => {
  const previa = cardsVisiveis([], { demo: true });
  assert.equal(previa.length, CATALOGO.length);
  // E continua sendo só desenho: o cartão que ainda não tem rota segue "em breve".
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
  // `toString` existe em todo objeto; não pode passar por papel.
  assert.ok(!accountEhRole('toString'));
});

/**
 * A leitura dos alvos da tela de Membros.
 *
 * É um portão de confiança: o que chega são strings do navegador, e é delas que
 * sai a decisão de mexer em `usuario` ou em `convite`. Um prefixo desconhecido
 * que passasse daqui viraria consulta com id de outra tabela.
 */
test('only targets with a known prefix and a filled-in id pass', () => {
  assert.deepEqual(readMemberTargets(['usuario:u1', 'convite:c1']), [
    { tipo: 'usuario', id: 'u1' },
    { tipo: 'convite', id: 'c1' },
  ]);

  // Prefixo que não existe, sem prefixo, id vazio e só espaço: nada disso passa.
  assert.deepEqual(readMemberTargets(['papel:p1', 'u1', 'usuario:', 'convite:   ', '']), []);

  // O id pode ter dois-pontos; só o PRIMEIRO separa.
  assert.deepEqual(readMemberTargets(['usuario:a:b']), [{ tipo: 'usuario', id: 'a:b' }]);
});
