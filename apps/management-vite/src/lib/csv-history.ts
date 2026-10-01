import type { CardHistory } from '../components/lista-history';

/**
 * History bulk-action CSV escaping lives outside the component because it is logic that must be runnable under `pnpm --filter @pipe/gestao test`. Use semicolon, not comma: Portuguese Excel uses it as list separator, otherwise all data opens in one column.
 */


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
    c.firstResponse,
    c.attendance,
    c.statusTexto,
    c.etiquetas.join(', '),
  ];
}

/**
 * Always quote each CSV field and double embedded quotes, so contact names containing semicolons, quotes, or newlines survive.
 */
export function celulaCsv(value: string): string {
  // Spreadsheets run cells starting with = + - @ tab or CR as formulas; the apostrophe makes them text.
  const seguro = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export function montarCsv(cards: readonly CardHistory[]): string {
  const linhas = [
    COLUNAS_CSV.map(celulaCsv).join(';'),
    ...cards.map((c) => valuesOf(c).map(celulaCsv).join(';')),
  ];
  // Prefix BOM so Portuguese Excel decodes accented characters correctly.
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}
