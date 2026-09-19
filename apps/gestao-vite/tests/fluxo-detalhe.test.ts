import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITE_VISIVEL,
  itensDoMenu,
  numeroDaHome,
  pilhaDaEquipe,
} from '../src/paginas/fluxo/itens';

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

test('a Análise leva à análise DO contato, no prefixo do próprio tipo', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const analise = itensDoMenu(tipo, ID).find((i) => i.rotulo === 'Análise');
    assert.equal(analise?.href, `/${tipo}/${ID}/analise`);
  }
});

test('Canais leva aos canais DO contato, no prefixo do próprio tipo', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const canais = itensDoMenu(tipo, ID).find((i) => i.rotulo === 'Canais');
    assert.equal(canais?.href, `/${tipo}/${ID}/canais`);
  }
});

test('Contatos e Conteúdos abrem suas áreas no contexto do contato', () => {
  for (const tipo of ['roteador', 'fluxo'] as const) {
    const itens = itensDoMenu(tipo, ID);
    assert.equal(itens.find((i) => i.rotulo === 'Contatos')?.href, `/${tipo}/${ID}/contatos`);
    assert.equal(itens.find((i) => i.rotulo === 'Conteúdos')?.href, `/${tipo}/${ID}/conteudos`);
  }
});

test('Growth e Log abrem suas telas no contexto do contato', () => {
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

test('o roteador não oferece Builder nem Atendimento', () => {
  const rotulos = itensDoMenu('roteador', ID).map((i) => i.rotulo);
  assert.ok(!rotulos.includes('Builder'));
  assert.ok(!rotulos.includes('Atendimento'));
});

test('o roteador abre com "Serviços", que é o item do template', () => {
  assert.equal(itensDoMenu('roteador', ID)[0]?.rotulo, 'Serviços');
  /* E o fluxo não tem item de template nenhum: o `switch` da origem não tem
     caso para `builder`. */
  assert.equal(itensDoMenu('fluxo', ID)[0]?.rotulo, 'Builder');
});

test('o fluxo mantém os dois que o roteador perde', () => {
  const rotulos = itensDoMenu('fluxo', ID).map((i) => i.rotulo);
  assert.ok(rotulos.includes('Builder'));
  assert.ok(rotulos.includes('Atendimento'));
});

test('o resto da fileira é o mesmo nos dois, e na mesma ordem', () => {
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

test('os cinco visíveis são a ordem medida na origem', () => {
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
const SO_ISSO = (permissoes: Record<string, 'nenhum' | 'ler' | 'escrever'>) => ({
  papelNoFluxo: 'personalizado' as const,
  permissoes,
  editaPelaConta: false,
});

test('as permissões do fluxo escondem o que a pessoa não pode ver', () => {
  const itens = itensDoMenu('fluxo', ID, SO_ISSO({ builder: 'escrever', analysis: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Builder', 'Análise'],
  );
});

test('"Sem permissão" some da barra, e o destino continua o mesmo de sempre', () => {
  const itens = itensDoMenu('fluxo', ID, SO_ISSO({ builder: 'nenhum', channels: 'ler' }));
  assert.deepEqual(
    itens.map((i) => i.rotulo),
    ['Canais'],
  );
  assert.equal(itens[0]?.href, `/fluxo/${ID}/canais`);
});

test('"Conteúdos" é o recurso `resources` da lista de permissões, não `contents`', () => {
  /* É a única chave em que as duas listas da origem discordam de nome. */
  assert.deepEqual(
    itensDoMenu('fluxo', ID, SO_ISSO({ resources: 'ler' })).map((i) => i.rotulo),
    ['Conteúdos'],
  );
  assert.deepEqual(itensDoMenu('fluxo', ID, SO_ISSO({ contents: 'ler' })), []);
});

test('quem edita fluxo pela CONTA continua vendo a fileira inteira', () => {
  /* O outro lado do duplo portão: a permissão de conta não é peneirada pela
     do fluxo, senão a 0035 tiraria acesso de quem já tinha. */
  const conta = { papelNoFluxo: null, permissoes: {}, editaPelaConta: true };
  assert.deepEqual(itensDoMenu('fluxo', ID, conta), itensDoMenu('fluxo', ID));
});

test('o item do template do roteador não passa pela peneira de permissão', () => {
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
