import type { CartaoHistorico } from '../componentes/lista-historico';

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

function valoresDe(c: CartaoHistorico): string[] {
  return [
    c.ticket,
    c.encerrada,
    c.contato,
    c.fila,
    c.atendente,
    c.espera,
    c.primeiraResposta,
    c.atendimento,
    c.statusTexto,
    c.etiquetas.join(', '),
  ];
}

/**
 * Campo sempre entre aspas, com aspas de dentro dobradas. É o mínimo que
 * sobrevive a nome de contato com ponto e vírgula, com aspas ou com quebra de
 * linha — e nome de contato tem os três.
 */
export function celulaCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export function montarCsv(cartoes: readonly CartaoHistorico[]): string {
  const linhas = [
    COLUNAS_CSV.map(celulaCsv).join(';'),
    ...cartoes.map((c) => valoresDe(c).map(celulaCsv).join(';')),
  ];
  // O BOM na frente é o que faz o Excel em português abrir o acento certo.
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}
