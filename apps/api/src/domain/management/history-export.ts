import { and, eq, inArray, sql } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { COLUNAS_CSV, type LinhaCsvHistory } from '@pipe/core/csv-history';
import { user } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import type { LineHistory } from './history.js';

/**
 * Exportação do Histórico por e-mail. O tenant nunca vem da requisição: a consulta e a busca de destinatários rodam na transação do tenant da sessão.
 */

export const MAX_DESTINATARIOS = 5;
export const MAX_LINHAS_EXPORTACAO = 10_000;

const EMAIL = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,255}$/;

const ROTULO_STATUS: Record<string, string> = {
  perdida: 'Perdida',
  abandonada: 'Abandonada',
  finalizada: 'Finalizada',
};

/** 1 a 5 e-mails de formato válido, sem repetição e em minúsculas; qualquer outra coisa é 400. */
export function validarDestinatarios(bruto: unknown): string[] {
  if (!Array.isArray(bruto) || bruto.length === 0 || bruto.length > MAX_DESTINATARIOS) {
    throw PipeError.request('destinatarios_invalid', `Informe de 1 a ${MAX_DESTINATARIOS} destinatários.`);
  }
  const emails = bruto.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''));
  if (emails.some((e) => e.length > 254 || !EMAIL.test(e))) {
    throw PipeError.request('destinatarios_invalid', 'Há um e-mail de destinatário malformado.');
  }
  return [...new Set(emails)];
}

/** Recusa (400) qualquer destinatário que não seja usuário ativo do tenant da sessão. */
export async function exigirUsuariosDoTenant(
  tx: TransactionPipe,
  tenantId: string,
  emails: readonly string[],
): Promise<void> {
  const rows = await tx
    .select({ email: sql<string>`lower(${user.email})` })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.ativo, true), inArray(sql`lower(${user.email})`, [...emails])));
  const achados = new Set(rows.map((r) => r.email));
  if (emails.some((e) => !achados.has(e))) {
    throw PipeError.request(
      'destinatarios_fora_do_tenant',
      'Só é possível enviar para usuários ativos da sua conta.',
    );
  }
}

export function duracao(segundos: number | null): string {
  if (segundos === null || Number.isNaN(segundos)) return '—';
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${h > 0 ? `${h}:` : ''}${dois(Math.floor((total % 3600) / 60))}:${dois(total % 60)}`;
}

/** Mesmo formato textual que a tela entrega ao CSV de download. */
export function linhaParaCsv(l: LineHistory, fuso: string): LinhaCsvHistory {
  return {
    ticket: l.ticket,
    encerrada: l.closedAt
      ? l.closedAt.toLocaleString('pt-BR', {
          timeZone: fuso,
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—',
    contact: l.contactName,
    queue: l.queueName ?? '—',
    agent: l.agentName ?? '—',
    espera: duracao(l.esperaSeg),
    firstResponse: duracao(l.firstResponseSeg),
    attendance: duracao(l.attendanceSeg),
    statusTexto: l.status ? (ROTULO_STATUS[l.status] ?? l.status) : 'Aberta',
    etiquetas: l.labels,
  };
}

/** PDF em paisagem, uma linha por ticket, com as mesmas colunas do CSV. */
export function montarPdf(linhas: readonly LinhaCsvHistory[], titulo: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const largura = (doc.page.width - 56) / COLUNAS_CSV.length;
    const linha = (celulas: readonly string[], negrito: boolean) => {
      if (doc.y > doc.page.height - 56) doc.addPage();
      const y = doc.y;
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
      celulas.forEach((c, i) =>
        doc.text(c, 28 + i * largura, y, { width: largura - 4, height: 10, lineBreak: false, ellipsis: true }),
      );
      doc.y = y + 12;
    };

    doc.font('Helvetica-Bold').fontSize(12).text(titulo, 28, 28);
    doc.moveDown();
    linha(COLUNAS_CSV, true);
    for (const c of linhas) {
      linha(
        [c.ticket, c.encerrada, c.contact, c.queue, c.agent, c.espera, c.firstResponse, c.attendance, c.statusTexto, c.etiquetas.join(', ')],
        false,
      );
    }
    doc.end();
  });
}
