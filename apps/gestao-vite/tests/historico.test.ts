import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GROUPINGS,
  groupingValid,
  agruparHistory,
  alternarTodosVisiveis,
  reconciliarMarcados,
} from '../src/lib/historico.ts';
import type { LinhaHistory } from '../src/lib/historico.ts';
import { ticketDe } from '../src/lib/monitoramento.ts';

/**
 * O agrupamento do Histórico e o número do ticket.
 *
 * Os dois são lidos por gente: o agrupamento decide quantas conversas o gestor
 * atribui a cada fila, e o ticket é o que o atendente dita no telefone. Nenhum
 * dos dois toca banco.
 */

const linha = (parcial: Partial<LinhaHistory> = {}): LinhaHistory => ({
  id: 'a',
  ticket: '#000001',
  contactName: 'Contato',
  queueName: 'Suporte',
  agentName: 'Ana',
  encerradaEm: '2026-09-05T19:22:00.000Z',
  status: 'finalizada',
  esperaSeg: 10,
  firstRespostaSeg: 20,
  attendanceSeg: 30,
  etiquetas: [],
  ...parcial,
});

test('agrupamento vindo da URL cai em "nenhum" quando não é do catálogo', () => {
  /* O valor chega de `searchParams`, ou seja, de qualquer um que digite na
     barra de endereço. Sem esta peneira, um valor estranho passaria adiante e
     `agruparHistorico` devolveria a lista dobrada por uma chave inexistente. */
  assert.equal(groupingValid('fila'), 'fila');
  assert.equal(groupingValid(undefined), 'nenhum');
  assert.equal(groupingValid(''), 'nenhum');
  assert.equal(groupingValid('atendente; drop'), 'nenhum');
  assert.equal(groupingValid('toString'), 'nenhum');
  for (const a of GROUPINGS) assert.equal(groupingValid(a.chave), a.chave);
});

test('sem agrupamento, sai um grupo só com a lista inteira', () => {
  const linhas = [linha(), linha({ id: 'b' })];
  const groups = agruparHistory(linhas, 'nenhum');
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.titulo, '');
  assert.equal(groups[0]!.linhas.length, 2);
});

test('por fila, quem não tem fila ganha um grupo próprio em vez de sumir', () => {
  /* Conversa perdida na fila raiz tem `filaNome` nulo. Se ela não virar grupo,
     a soma dos grupos fica menor que o total e o gestor conclui que o dia teve
     menos conversa do que teve. */
  const groups = agruparHistory(
    [linha({ queueName: 'Suporte' }), linha({ id: 'b', queueName: null })],
    'fila',
  );
  assert.deepEqual(groups.map((g) => g.titulo).sort(), ['Sem fila', 'Suporte']);
  assert.equal(
    groups.reduce((s, g) => s + g.linhas.length, 0),
    2,
  );
});

test('os grupos saem do maior para o menor', () => {
  /* A ordem é a resposta da tela: o primeiro grupo é onde o volume está. */
  const groups = agruparHistory(
    [
      linha({ agentName: 'Ana' }),
      linha({ id: 'b', agentName: 'Bia' }),
      linha({ id: 'c', agentName: 'Bia' }),
    ],
    'atendente',
  );
  assert.deepEqual(
    groups.map((g) => [g.titulo, g.linhas.length]),
    [
      ['Bia', 2],
      ['Ana', 1],
    ],
  );
});

test('o desfecho vira rótulo em português, e o desconhecido passa cru', () => {
  /* Rótulo é o que o gestor lê. Um status novo no banco não pode fazer o grupo
     desaparecer — ele aparece com o nome técnico, que é feio mas visível. */
  const groups = agruparHistory(
    [linha({ status: 'abandonada' }), linha({ id: 'b', status: null })],
    'status',
  );
  const titulos = groups.map((g) => g.titulo).sort();
  assert.deepEqual(titulos, ['Abandonada', 'Sem desfecho']);
});

test('por etiqueta a conversa entra em cada etiqueta que tem', () => {
  /* De propósito a soma dos grupos passa do total: a pergunta é "quantas
     conversas encostaram nesta etiqueta", não "como reparto o total". Se
     alguém "consertar" isso, a contagem por etiqueta passa a subnotificar. */
  const groups = agruparHistory(
    [linha({ etiquetas: ['Elogio', 'Reclamação'] }), linha({ id: 'b', etiquetas: [] })],
    'etiqueta',
  );
  assert.deepEqual(groups.map((g) => g.titulo).sort(), ['Elogio', 'Reclamação', 'Sem etiqueta']);
  assert.equal(
    groups.reduce((s, g) => s + g.linhas.length, 0),
    3,
  );
});

test('agrupar não mexe na lista que recebeu', () => {
  /* A mesma lista alimenta a exportação em CSV logo depois. */
  const linhas = [linha(), linha({ id: 'b' })];
  agruparHistory(linhas, 'fila');
  assert.equal(linhas.length, 2);
});

test('seleção descarta IDs ausentes da lista visível sem alterar a entrada', () => {
  const original = new Set(['a', 'b', 'c']);
  const atual = reconciliarMarcados(original, ['b', 'd']);
  assert.deepEqual([...atual], ['b']);
  assert.deepEqual([...original], ['a', 'b', 'c']);
  assert.equal(reconciliarMarcados(atual, ['b', 'd']), atual);
});

test('selecionar todos considera somente resultados visíveis', () => {
  const filtrados = ['b', 'd'];
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a', 'b']), filtrados)], filtrados);
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a', 'b', 'd']), filtrados)], []);
  assert.deepEqual([...alternarTodosVisiveis(new Set(['a']), [])], []);
});

test('o ticket sai dos últimos seis do uuid, em maiúsculas e sem hífen', () => {
  /* É o número que o atendente lê em voz alta e o gestor cola na busca. Se a
     regra mudar, os tickets já ditados deixam de achar a conversa. */
  assert.equal(ticketDe('0191f3aa-77e2-7a1b-9c3d-0000000abc12'), '#0ABC12');
  assert.equal(ticketDe('----------------------------ABCDEF'), '#ABCDEF');
});
