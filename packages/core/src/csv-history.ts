/**
 * CSV do Histórico: a mesma função gera o arquivo baixado no navegador e o anexo enviado por e-mail pela API.
 * Usa ponto e vírgula, não vírgula: o Excel em português o usa como separador de lista, senão tudo abre em uma coluna.
 */

/** Só os campos que o CSV lê; o cartão da tela tem mais. */
export interface LinhaCsvHistory {
  ticket: string;
  encerrada: string;
  contact: string;
  queue: string;
  agent: string;
  espera: string;
  firstResponse: string;
  attendance: string;
  statusTexto: string;
  etiquetas: readonly string[];
}

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

function valuesOf(c: LinhaCsvHistory): string[] {
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
 * Sempre entre aspas, com aspas internas dobradas, para que nomes com ponto e vírgula, aspas ou quebra de linha sobrevivam.
 */
export function celulaCsv(value: string): string {
  // Planilhas executam como fórmula célula iniciada por = + - @ tab ou CR; o apóstrofo a torna texto.
  const seguro = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export function montarCsv(cards: readonly LinhaCsvHistory[]): string {
  const linhas = [
    COLUNAS_CSV.map(celulaCsv).join(';'),
    ...cards.map((c) => valuesOf(c).map(celulaCsv).join(';')),
  ];
  // BOM para o Excel em português decodificar os acentos.
  return `﻿${linhas.join('\r\n')}\r\n`;
}
