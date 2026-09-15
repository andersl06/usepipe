import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOGO,
  PAPEIS_DA_ORIGEM,
  cartoesVisiveis,
  ehPapelDeConta,
  lerAlvosDeMembro,
  permissaoExigida,
} from '../src/app/contrato/catalogo.ts';

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

test('sem nenhuma permissão de conta, nenhum cartão aparece', () => {
  assert.deepEqual(cartoesVisiveis([]), []);
  /* O `guest` deles: lê o resumo e o espaço de trabalho, e vê zero cartões —
     o único cartão de workspace da origem exige ESCRITA. */
  assert.deepEqual(cartoesVisiveis(['conta.resumo.ler', 'conta.workspace.ler']), []);
});

test('cada cartão aparece com a permissão que ele exige, e só com ela', () => {
  for (const cartao of CATALOGO) {
    const codigo = permissaoExigida(cartao);
    const vistos = cartoesVisiveis([codigo]).map((c) => c.id);
    assert.ok(vistos.includes(cartao.id), `${cartao.id} deveria aparecer com ${codigo}`);
  }

  // Ler membro não dá o cartão que pede ESCREVER membro (a conferência `e` deles).
  const soLeitura = cartoesVisiveis(['conta.membros.ler']).map((c) => c.id);
  assert.ok(soLeitura.includes('membros'));
  assert.ok(!soLeitura.includes('chamadas'));
});

test('o modo demonstração mostra o catálogo inteiro, mesmo sem permissão nenhuma', () => {
  const previa = cartoesVisiveis([], { demonstracao: true });
  assert.equal(previa.length, CATALOGO.length);
  // E continua sendo só desenho: o cartão que ainda não tem rota segue "em breve".
  assert.ok(previa.some((c) => !c.pronto));
});

test('os três papéis de conta têm os rótulos e ícones deles, na ordem da origem', () => {
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

test('papel de atendimento não é papel de conta, e nome cru nunca vira rótulo', () => {
  for (const nome of ['admin', 'member', 'guest']) assert.ok(ehPapelDeConta(nome));
  for (const nome of ['administrador', 'gestor', 'supervisor', 'atendente', 'avaliador', '', null]) {
    assert.ok(!ehPapelDeConta(nome), `${nome} não é papel de conta`);
  }
  // `toString` existe em todo objeto; não pode passar por papel.
  assert.ok(!ehPapelDeConta('toString'));
});

/**
 * A leitura dos alvos da tela de Membros.
 *
 * É um portão de confiança: o que chega são strings do navegador, e é delas que
 * sai a decisão de mexer em `usuario` ou em `convite`. Um prefixo desconhecido
 * que passasse daqui viraria consulta com id de outra tabela.
 */
test('só passam alvos com prefixo conhecido e id preenchido', () => {
  assert.deepEqual(lerAlvosDeMembro(['usuario:u1', 'convite:c1']), [
    { tipo: 'usuario', id: 'u1' },
    { tipo: 'convite', id: 'c1' },
  ]);

  // Prefixo que não existe, sem prefixo, id vazio e só espaço: nada disso passa.
  assert.deepEqual(lerAlvosDeMembro(['papel:p1', 'u1', 'usuario:', 'convite:   ', '']), []);

  // O id pode ter dois-pontos; só o PRIMEIRO separa.
  assert.deepEqual(lerAlvosDeMembro(['usuario:a:b']), [{ tipo: 'usuario', id: 'a:b' }]);
});
