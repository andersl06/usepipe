import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_VISIVEL,
  itensDoMenu,
  numeroDaHome,
  pilhaDaEquipe,
} from '../src/pages/flow/itens';

/**
 * A fileira da barra do contato (`/fluxo/{id}`).
 *
 * O que este arquivo trava é a única decisão da tela: o que o ROTEADOR mostra e
 * o FLUXO não, e vice-versa. Na origem isso sai de dois lugares distantes um do
 * outro — `getTemplateSetupItem()` (que prepende "Serviços" para `master`) e o
 * `hideInTemplate` do mapa de claims (que esconde `builder` e `desk` no mesmo
 * `master`) —, e é exatamente o tipo de regra que volta errada numa refatoração
 * silenciosa: a tela continua carregando, só passa a oferecer ao roteador um
 * construtor que ele não tem.
 */

const ID = '5b6843ae-b4f8-4bc0-bce2-e32318043297';

test('analytics leads to the contact\'s OWN analytics, under its own type prefix', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const analytics = itensDoMenu(tipo, ID).find((i) => i.rotulo === 'Análise');
    assert.equal(analytics?.href, `/${tipo}/${ID}/analise`);
  }
});

test('Channels leads to the contact\'s OWN channels, under its own type prefix', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const channels = itensDoMenu(tipo, ID).find((i) => i.rotulo === 'Canais');
    assert.equal(channels?.href, `/${tipo}/${ID}/canais`);
  }
});

test('Contacts and Content open their areas within the contact\'s context', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const itens = itensDoMenu(tipo, ID);
    assert.equal(itens.find((i) => i.rotulo === 'Contatos')?.href, `/${tipo}/${ID}/contatos`);
    assert.equal(itens.find((i) => i.rotulo === 'Conteúdos')?.href, `/${tipo}/${ID}/conteudos`);
  }
});

test('Growth and Log open their screens within the contact\'s context', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const itens = itensDoMenu(tipo, ID);
    assert.equal(
      itens.find((i) => i.rotulo === 'Growth')?.href,
      `/${tipo}/${ID}/growth/mensagens-ativas`,
    );
    assert.equal(itens.find((i) => i.rotulo === 'Log')?.href, `/${tipo}/${ID}/log`);
  }
});

test('a fonte da subbarra não inclui Inteligência artificial sem claims do bot', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    assert.ok(!itensDoMenu(tipo, ID).some((item) => item.rotulo === 'Inteligência artificial'));
  }
});

test('the router offers neither Builder nor Attendance', () => {
  const rotulos = itensDoMenu('roteador', ID).map((i) => i.rotulo);
  assert.ok(!rotulos.includes('Builder'));
  assert.ok(!rotulos.includes('Atendimento'));
});

test('the router opens with "Services", the template\'s item', () => {
  assert.equal(itensDoMenu('roteador', ID)[0]?.rotulo, 'Serviços');
  /* E o fluxo não tem item de template nenhum: o `switch` da origem não tem
     caso para `builder`. */
  assert.equal(itensDoMenu('fluxo', ID)[0]?.rotulo, 'Builder');
});

test('the flow keeps the two the router loses', () => {
  const rotulos = itensDoMenu('fluxo', ID).map((i) => i.rotulo);
  assert.ok(rotulos.includes('Builder'));
  assert.ok(rotulos.includes('Atendimento'));
});

test('Attendance still lands on the internal monitoring route', () => {
  const attendance = itensDoMenu('fluxo', ID).find((item) => item.rotulo === 'Atendimento');
  assert.equal(attendance?.href, `/fluxo/${ID}/atendimento/monitoramento`);
});

test('the rest of the row is the same in both, and in the same order', () => {
  const semEspecificos = (tipo: 'fluxo' | 'roteador') =>
    itensDoMenu(tipo, ID)
      .map((i) => i.rotulo)
      .filter((r) => !['Serviços', 'Builder', 'Atendimento'].includes(r));
  assert.deepEqual(semEspecificos('roteador'), semEspecificos('fluxo'));
  assert.deepEqual(semEspecificos('fluxo'), [
    'Análise',
    'Growth',
    'Canais',
    'Contatos',
    'Conteúdos',
    'Log',
    'Pagamentos',
  ]);
});

test('the five visible ones are the order measured in the source', () => {
  /* `application-detail-pipeprincipal-configurations-basic.html` (builder) e
     `roteador-team__pagina.html` (master), a fonte dos dois. */
  const rotulos = (tipo: 'fluxo' | 'roteador') =>
    itensDoMenu(tipo, ID)
      .slice(0, LIMITE_VISIVEL)
      .map((i) => i.rotulo);
  assert.deepEqual(rotulos('fluxo'), ['Builder', 'Atendimento', 'Análise', 'Growth', 'Canais']);
  assert.deepEqual(rotulos('roteador'), ['Serviços', 'Análise', 'Growth', 'Canais', 'Contatos']);
});

test('sobra item para o "…" nos dois tipos', () => {
  /* Se um dia a fileira couber inteira em cinco, o "…" some da tela — e é isso
     que o desenho espera. O teste existe para avisar quando isso mudar. */
  assert.ok(itensDoMenu('fluxo', ID).length > LIMITE_VISIVEL);
  assert.ok(itensDoMenu('roteador', ID).length > LIMITE_VISIVEL);
});

/*
 * O passo 2 da origem (`getUpdatedMenus()`): a fileira peneirada pelas
 * permissões DA PESSOA naquele bot. Sem o argumento nada muda — é o que os
 * testes acima travam, e é o que todo tenant que nunca abriu a Equipe vê.
 */
const SO_ISSO = (permissions: Record<string, 'nenhum' | 'ler' | 'escrever'>) => ({
  papelNoFluxo: 'personalizado' as const,
  permissions,
  editaPelaConta: false,
});

test('the flow\'s permissions hide what the person cannot see', () => {
  const itens = itensDoMenu('fluxo', ID, SO_ISSO({ builder: 'escrever', analysis: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Builder', 'Análise'],
  );
});

test('"No permission" disappears from the bar, and the destination stays the same as always', () => {
  const itens = itensDoMenu('fluxo', ID, SO_ISSO({ builder: 'nenhum', channels: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Canais'],
  );
  assert.equal(itens[0]?.href, `/fluxo/${ID}/canais`);
});

test('"Conteúdos" is the `resources` entry on the permission list, not `contents`', () => {
  /* É a única chave em que as duas listas da origem discordam de nome. */
  assert.deepEqual(
    itensDoMenu('fluxo', ID, SO_ISSO({ resources: 'ler' })).map((i) => i.rotulo),
    ['Conteúdos'],
  );
  assert.deepEqual(itensDoMenu('fluxo', ID, SO_ISSO({ contents: 'ler' })), []);
});

test('whoever edits the flow through the ACCOUNT still sees the entire row', () => {
  /* O outro lado do duplo portão: a permissão de conta não é peneirada pela
     do fluxo, senão a 0035 tiraria acesso de quem já tinha. */
  const account = { papelNoFluxo: null, permissoes: {}, editaPelaConta: true };
  assert.deepEqual(itensDoMenu('fluxo', ID, account), itensDoMenu('fluxo', ID));
});

test('the router template\'s item does not go through the permission sieve', () => {
  /* `getTemplateSetupItem()` roda ANTES de `getUpdatedMenus()` e não é do
     catálogo: "Serviços" fica mesmo quando a pessoa não tem recurso nenhum. */
  const itens = itensDoMenu('roteador', ID, SO_ISSO({}));
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
