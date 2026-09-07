import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLUNAS_CSV, celulaCsv, montarCsv } from '../src/lib/csv-historico.ts';
import type { CartaoHistorico } from '../src/componentes/lista-historico.tsx';

/**
 * O CSV que o gestor exporta do Histórico.
 *
 * É o formato mais fácil de quebrar em silêncio do repositório: o arquivo abre,
 * o Excel não reclama, e as colunas estão trocadas porque um nome de contato
 * tinha ponto e vírgula. Ninguém descobre até alguém somar a coluna errada.
 */

const cartao = (parcial: Partial<CartaoHistorico> = {}): CartaoHistorico => ({
  id: 'x',
  ticket: '#1',
  encerrada: '05/09, 19:22',
  contato: 'Contato',
  fila: 'Suporte',
  atendente: 'Ana',
  espera: '10:05',
  primeiraResposta: '01:22',
  atendimento: '45:33',
  statusTexto: 'Finalizada',
  statusClasse: 'etiqueta',
  critico: false,
  etiquetas: [],
  ...parcial,
});

/** Linhas do arquivo, já sem o BOM e sem a quebra final. */
function linhasDe(csv: string): string[] {
  return csv.slice(1).trimEnd().split('\r\n');
}

test('o arquivo começa com BOM', () => {
  /* Sem o BOM, o Excel em português abre o arquivo em latin-1 e todo nome
     acentuado vira lixo — "Conceição" some da planilha inteira. */
  assert.ok(montarCsv([cartao()]).startsWith('﻿'));
});

test('o cabeçalho traz as dez colunas, na ordem', () => {
  const [cabecalho] = linhasDe(montarCsv([]));
  assert.equal(cabecalho, COLUNAS_CSV.map((c) => `"${c}"`).join(';'));
  assert.equal(COLUNAS_CSV.length, 10);
});

test('sem conversa, sai só o cabeçalho', () => {
  /* Recorte vazio não pode gerar arquivo vazio: o gestor precisa ver as colunas
     e concluir que o filtro é que não achou nada. */
  assert.equal(linhasDe(montarCsv([])).length, 1);
});

test('ponto e vírgula dentro do campo não abre coluna nova', () => {
  /* O separador é `;` porque é o separador de lista do Excel em português. Sem
     as aspas, "Silva; Souza" empurra todas as colunas seguintes uma casa para a
     direita e o tempo de atendimento aparece na coluna de situação. */
  const [, linha] = linhasDe(montarCsv([cartao({ contato: 'Silva; Souza' })]));
  assert.ok(linha!.includes('"Silva; Souza"'));
  assert.equal(linha!.split('";"').length, COLUNAS_CSV.length);
});

test('aspas do valor saem dobradas', () => {
  /* Aspas soltas fecham o campo no meio e a linha inteira se desmonta. */
  assert.equal(celulaCsv('O "Grande"'), '"O ""Grande"""');
  assert.equal(celulaCsv(''), '""');
});

test('quebra de linha dentro do campo continua presa em um campo só', () => {
  /* Nome de contato colado do WhatsApp vem com `\n`. Fora das aspas, ele vira
     uma linha nova no arquivo e a exportação passa a ter mais linhas do que
     conversas. */
  const csv = montarCsv([cartao({ contato: 'Ana\nSouza' })]);
  assert.ok(csv.includes('"Ana\nSouza"'));
  // Só o `\r\n` separa registro; o `\n` solto fica dentro do campo.
  assert.equal(linhasDe(csv).length, 2);
});

test('as etiquetas viram uma coluna só, separadas por vírgula', () => {
  const [, linha] = linhasDe(montarCsv([cartao({ etiquetas: ['Elogio', 'Reclamação'] })]));
  assert.ok(linha!.endsWith('"Elogio, Reclamação"'));
});

test('cada conversa é uma linha', () => {
  assert.equal(linhasDe(montarCsv([cartao(), cartao(), cartao()])).length, 4);
});
