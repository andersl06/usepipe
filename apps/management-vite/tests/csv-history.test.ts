import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLUNAS_CSV, celulaCsv, montarCsv } from '../src/lib/csv-history.ts';
import type { CardHistory } from '../src/components/lista-history.tsx';

/**
 * The CSV the manager exports from History.
 *
 * It's the repository's easiest format to break silently: the file opens, Excel doesn't complain, and the columns are swapped because a contact name had a semicolon. Nobody notices until someone sums the wrong column.
 */

const card = (parcial: Partial<CardHistory> = {}): CardHistory => ({
  id: 'x',
  ticket: '#1',
  encerrada: '05/09, 19:22',
  contact: 'Contato',
  queue: 'Suporte',
  agent: 'Ana',
  espera: '10:05',
  firstResponse: '01:22',
  attendance: '45:33',
  statusTexto: 'Finalizada',
  statusClasse: 'etiqueta',
  critico: false,
  etiquetas: [],
  ...parcial,
});

/** File lines, already stripped of the BOM and the trailing line break. */
function linhasDe(csv: string): string[] {
  return csv.slice(1).trimEnd().split('\r\n');
}

test('cells starting with a formula trigger are prefixed with an apostrophe', () => {
  /* A contact named "=SUM(A1)" would otherwise run as a formula when the spreadsheet opens. */
  assert.equal(celulaCsv('=SUM(A1)'), `"'=SUM(A1)"`);
  assert.equal(celulaCsv('+55 11'), `"'+55 11"`);
  assert.equal(celulaCsv('-1'), `"'-1"`);
  assert.equal(celulaCsv('@x'), `"'@x"`);
  assert.equal(celulaCsv('\tx'), `"'\tx"`);
  assert.equal(celulaCsv('\rx'), `"'\rx"`);
  assert.equal(celulaCsv('Ana "Bia"'), `"Ana ""Bia"""`);
});

test('the file starts with a BOM', () => {
  /*
   * Without the BOM, Excel in Portuguese opens the file as latin-1 and every accented name turns into garbage — "Conceição" disappears from the whole spreadsheet.
   */
  assert.ok(montarCsv([card()]).startsWith('﻿'));
});

test('the header carries the ten columns, in order', () => {
  const [cabecalho] = linhasDe(montarCsv([]));
  assert.equal(cabecalho, COLUNAS_CSV.map((c) => `"${c}"`).join(';'));
  assert.equal(COLUNAS_CSV.length, 10);
});

test('with no conversation, only the header comes out', () => {
  /*
   * An empty slice must not produce an empty file: the manager needs to see the columns and conclude the filter simply found nothing.
   */
  assert.equal(linhasDe(montarCsv([])).length, 1);
});

test('a semicolon inside the field does not open a new column', () => {
  /*
   * The separator is `;` because it's Excel's Portuguese-locale list separator. Without quoting, "Silva; Souza" would push every following column one slot to the right, and the handling time would land in the status column.
   */
  const [, linha] = linhasDe(montarCsv([card({ contact: 'Silva; Souza' })]));
  assert.ok(linha!.includes('"Silva; Souza"'));
  assert.equal(linha!.split('";"').length, COLUNAS_CSV.length);
});

test('quotes in the value come out doubled', () => {
  /* Aspas soltas fecham o campo no meio e a linha inteira se desmonta. */
  assert.equal(celulaCsv('O "Grande"'), '"O ""Grande"""');
  assert.equal(celulaCsv(''), '""');
});

test('quebra de linha dentro do campo continua presa em um campo só', () => {
  /*
   * A contact name pasted from WhatsApp comes with `\n`. Outside quotes, it turns into a new line in the file, and the export ends up with more lines than conversations.
   */
  const csv = montarCsv([card({ contact: 'Ana\nSouza' })]);
  assert.ok(csv.includes('"Ana\nSouza"'));
  // Only `\r\n` separates a record; a lone `\n` stays inside the field.
  assert.equal(linhasDe(csv).length, 2);
});

test('tags become a single comma-separated column', () => {
  const [, linha] = linhasDe(montarCsv([card({ etiquetas: ['Elogio', 'Reclamação'] })]));
  assert.ok(linha!.endsWith('"Elogio, Reclamação"'));
});

test('each conversation is one row', () => {
  assert.equal(linhasDe(montarCsv([card(), card(), card()])).length, 4);
});
