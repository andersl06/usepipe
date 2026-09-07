import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehOrdem, filasDe, naFila, ordenar } from '../src/lib/ordem.ts';
import type { ConversaOrdenavel } from '../src/lib/ordem.ts';

/**
 * A ordem da coluna de atendimentos.
 *
 * Vale um teste porque o erro aqui é silencioso do mesmo jeito que o da
 * formatação de tempo: a lista aparece cheia, ordenada, e errada. Quem escolhe
 * "mais antigas primeiro" está caçando quem espera há mais tempo, e uma
 * inversão de sinal entrega exatamente o contrário sem nenhum sintoma na tela.
 */

const t = (iso: string) => new Date(`2026-09-07T${iso}:00-03:00`);

function conversa(
  nome: string,
  campos: Partial<ConversaOrdenavel> = {},
): ConversaOrdenavel & { nome: string } {
  return {
    nome,
    criadaEm: t('10:00'),
    ultimaMensagemEm: t('10:00'),
    prioridade: 'media',
    filaNome: null,
    ...campos,
  };
}

const nomes = (lista: { nome: string }[]) => lista.map((c) => c.nome);

test('a ordem padrão é a última mensagem, da mais recente para a mais antiga', () => {
  const lista = [
    conversa('meio', { ultimaMensagemEm: t('11:00') }),
    conversa('velha', { ultimaMensagemEm: t('09:00') }),
    conversa('nova', { ultimaMensagemEm: t('13:00') }),
  ];
  assert.deepEqual(nomes(ordenar(lista, 'recentes')), ['nova', 'meio', 'velha']);
});

test('conversa sem mensagem nenhuma vai para o fim, não para o topo', () => {
  /* Ela não é "a mais antiga": é a que ainda não começou. No topo, ela empurra
     para baixo justamente quem está esperando resposta. */
  const lista = [
    conversa('muda', { ultimaMensagemEm: null }),
    conversa('falante', { ultimaMensagemEm: t('09:00') }),
  ];
  assert.deepEqual(nomes(ordenar(lista, 'recentes')), ['falante', 'muda']);
});

test('"mais antigas" olha a abertura da conversa, não a última mensagem', () => {
  /* A última mensagem se move toda vez que o cliente cobra: ordenar por ela
     faria o cliente insistente PERDER a vez na fila de quem espera mais. */
  const lista = [
    conversa('recente', { criadaEm: t('12:00'), ultimaMensagemEm: t('09:00') }),
    conversa('antiga', { criadaEm: t('08:00'), ultimaMensagemEm: t('13:00') }),
  ];
  assert.deepEqual(nomes(ordenar(lista, 'antigas')), ['antiga', 'recente']);
});

test('a prioridade desempata pela mais antiga, e a desconhecida vale média', () => {
  const lista = [
    conversa('baixa', { prioridade: 'baixa', criadaEm: t('08:00') }),
    conversa('alta-nova', { prioridade: 'alta', criadaEm: t('12:00') }),
    conversa('sem-prioridade', { prioridade: 'urgentissima', criadaEm: t('09:00') }),
    conversa('alta-velha', { prioridade: 'alta', criadaEm: t('09:00') }),
    conversa('media', { prioridade: 'media', criadaEm: t('11:00') }),
  ];
  assert.deepEqual(nomes(ordenar(lista, 'prioridade')), [
    'alta-velha',
    'alta-nova',
    'sem-prioridade',
    'media',
    'baixa',
  ]);
});

test('ordenar não mexe na lista que recebeu', () => {
  /* A mesma lista é contada pelas fichas depois de ser ordenada para a tela.
     Ordenar no lugar faria a contagem depender da ordem de duas chamadas. */
  const lista = [conversa('b', { criadaEm: t('12:00') }), conversa('a', { criadaEm: t('08:00') })];
  ordenar(lista, 'antigas');
  assert.deepEqual(nomes(lista), ['b', 'a']);
});

test('a ordem que veio da URL é validada antes de virar comportamento', () => {
  assert.equal(ehOrdem('antigas'), true);
  assert.equal(ehOrdem('prioridade'), true);
  assert.equal(ehOrdem(undefined), false);
  assert.equal(ehOrdem('drop table'), false);
});

test('as filas saem sem repetição, sem nulo e em ordem de gente', () => {
  const lista = [
    conversa('a', { filaNome: 'Suporte' }),
    conversa('b', { filaNome: null }),
    conversa('c', { filaNome: 'Ávila' }),
    conversa('d', { filaNome: 'Suporte' }),
    conversa('e', { filaNome: 'Aline' }),
  ];
  /* `localeCompare` em pt-BR, e não ordem de código: "Ávila" antes de "Suporte"
     e depois de "Aline". Em ordem de código o acento cairia depois do Z. */
  assert.deepEqual(filasDe(lista), ['Aline', 'Ávila', 'Suporte']);
});

test('fila vazia é "todas", e a conversa sem fila só aparece lá', () => {
  const semFila = conversa('a');
  const comFila = conversa('b', { filaNome: 'Suporte' });
  assert.equal(naFila(semFila, ''), true);
  assert.equal(naFila(comFila, ''), true);
  assert.equal(naFila(semFila, 'Suporte'), false);
  assert.equal(naFila(comFila, 'Suporte'), true);
  assert.equal(naFila(comFila, 'Financeiro'), false);
});
