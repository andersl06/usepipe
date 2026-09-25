import type { CardHistory } from '../components/lista-history';

/**
 * O CSV da ação em massa do Histórico.
 *
 * Mora fora do componente porque escapar campo é lógica, não desenho, e
 * lógica precisa de uma verificação que roda:
 *
 *     pnpm --filter @pipe/gestao test
 *
 * Separador é ponto e vírgula, e não vírgula: no Excel em português é o
 * separador de lista, e com vírgula a planilha abre tudo numa coluna só.
 */

/** Os rótulos das colunas, na ordem em que saem no arquivo. */
export const COLUNAS_CSV = [
  'Ticket',
  'Encerrada',
  'Contato',
  'Fila',
  'Atendente',
  'Espera do cliente',
  '1ª resposta',
  'Atendimento',
  'Situação',
  'Etiquetas',
] as const;

function valuesOf(c: CardHistory): string[] {
  return [
    c.ticket,
    c.encerrada,
    c.contact,
    c.queue,
    c.agent,
    c.espera,
    c.firstResposta,
    c.attendance,
    c.statusTexto,
    c.etiquetas.join(', '),
  ];
}

/**
 * Campo sempre entre aspas, com aspas de dentro dobradas. É o mínimo que
 * sobrevive a nome de contato com ponto e vírgula, com aspas ou com quebra de
 * linha — e nome de contato tem os três.
 */
export function celulaCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function montarCsv(cards: readonly CardHistory[]): string {
  const linhas = [
    COLUNAS_CSV.map(celulaCsv).join(';'),
    ...cards.map((c) => valuesOf(c).map(celulaCsv).join(';')),
  ];
  // O BOM na frente é o que faz o Excel em português abrir o acento certo.
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}
