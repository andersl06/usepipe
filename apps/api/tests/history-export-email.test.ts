import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../src/session.js';

process.env['PIPE_EMAIL_MODO'] = 'duble';

/** Dados por tenant: o "banco" do teste só devolve o que pertence ao tenant da transação. */
const bancos = vi.hoisted(() => ({
  A: { users: ['ana@a.com', 'bia@a.com'], linhas: [{ ticket: '#AAAAAA', contactName: 'Contato A', labels: [] as string[] }], total: 1 },
  B: { users: ['bob@b.com'], linhas: [{ ticket: '#BBBBBB', contactName: 'Contato B', labels: [] as string[] }], total: 1 },
  consultas: [] as string[],
}));

type Tx = { tenantId: 'A' | 'B' };

vi.mock('../src/database.js', () => ({
  noTenant: async (tenantId: string, ler: (tx: Tx) => Promise<unknown>) => ler({ tenantId } as Tx),
}));
vi.mock('../src/domain/management/window.js', () => ({
  fusoDoTenant: async () => 'UTC',
  windowOfToday: async () => ({ start: new Date('2026-09-23T00:00:00.000Z'), end: new Date('2026-09-24T00:00:00.000Z') }),
  windowOfDates: async (_tx: unknown, _f: string, de: string, ate: string) => ({
    start: new Date(`${de}T00:00:00.000Z`),
    end: new Date(`${ate}T00:00:00.000Z`),
  }),
  dataIso: (d: Date, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(d),
}));
vi.mock('../src/domain/management/history.js', () => ({
  carregarCatalogos: async () => ({}),
  loadHistory: async (tx: Tx, ..._resto: unknown[]) => {
    bancos.consultas.push(tx.tenantId);
    const b = bancos[tx.tenantId];
    return {
      total: b.total,
      linhas: b.linhas.map((l, i) => ({
        id: `id-${i}`, queueName: 'Fila', agentName: 'Ag', closedAt: new Date('2026-09-22T12:00:00Z'),
        status: 'finalizada', esperaSeg: 65, firstResponseSeg: 5, attendanceSeg: 125, ...l,
      })),
    };
  },
}));
vi.mock('../src/domain/management/history-export.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exigirUsuariosDoTenant: async (tx: Tx, tenantId: string, emails: string[]) => {
    expect(tx.tenantId).toBe(tenantId);
    if (!emails.every((e) => bancos[tx.tenantId].users.includes(e))) {
      const { PipeError } = await import('../src/errors.js');
      throw PipeError.request('destinatarios_fora_do_tenant', 'fora');
    }
  },
}));

const { ManagementOperationsController } = await import('../src/controllers/management-operations.js');
const { RemetenteDuble } = await import('../src/domain/email.js');
const controller = new ManagementOperationsController();
const sessao = (tenantId: string) => ({ session: { tenantId, userId: 'u', origem: 'google' } }) as unknown as RequestWithSession;
const exportar = (tenantId: string, corpo: Record<string, unknown>) => controller.exportHistoryByEmail(sessao(tenantId), corpo);
const decodificar = (b64: string) => Buffer.from(b64, 'base64');

beforeEach(() => {
  RemetenteDuble.reiniciar();
  bancos.consultas.length = 0;
  bancos.B.total = 1;
});

describe('POST /v1/management/history/export-email', () => {
  it('csv: envia 1 anexo .csv com BOM só com as linhas do tenant da sessão', async () => {
    expect(await exportar('A', { destinatarios: ['ana@a.com'], formato: 'csv', filtros: {} })).toEqual({ enviado: true });
    const [email] = RemetenteDuble.enviados;
    expect(email?.para).toEqual(['ana@a.com']);
    expect(email?.anexos).toHaveLength(1);
    const anexo = email!.anexos![0]!;
    expect(anexo.nome).toMatch(/\.csv$/);
    const csv = decodificar(anexo.conteudoBase64).toString('utf8');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Contato A');
    expect(csv).not.toContain('Contato B');
  });

  it('tenant cruzado: usuário do tenant A não exporta nem envia dados do tenant B', async () => {
    // Um tenant na requisição é ignorado: a consulta roda no tenant da sessão.
    await exportar('A', { destinatarios: ['ana@a.com'], formato: 'csv', filtros: { tenantId: 'B', tenant_id: 'B' } });
    expect(bancos.consultas).toEqual(['A']);
    expect(RemetenteDuble.enviados[0]?.anexos?.[0]).toBeDefined();
    expect(decodificar(RemetenteDuble.enviados[0]!.anexos![0]!.conteudoBase64).toString('utf8')).not.toContain('Contato B');
    // E-mail de usuário do tenant B pedido pela sessão de A: recusado, nada enviado.
    RemetenteDuble.reiniciar();
    await expect(exportar('A', { destinatarios: ['bob@b.com'], formato: 'csv' })).rejects.toMatchObject({
      status: 400, codigo: 'destinatarios_fora_do_tenant',
    });
    expect(RemetenteDuble.enviados).toHaveLength(0);
  });

  it('a sessão B só recebe dados de B', async () => {
    await exportar('B', { destinatarios: ['bob@b.com'], formato: 'csv' });
    const csv = decodificar(RemetenteDuble.enviados[0]!.anexos![0]!.conteudoBase64).toString('utf8');
    expect(csv).toContain('Contato B');
    expect(csv).not.toContain('Contato A');
  });

  it('recusa mais de 5 destinatários, e-mail malformado ou lista vazia sem enviar', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => `u${i}@a.com`);
    for (const destinatarios of [seis, ['sem-arroba'], ['a@b.com, c@d.com'], [], undefined, [42]]) {
      await expect(exportar('A', { destinatarios, formato: 'csv' })).rejects.toMatchObject({ status: 400 });
    }
    expect(RemetenteDuble.enviados).toHaveLength(0);
    expect(bancos.consultas).toHaveLength(0);
  });

  it('recusa formato desconhecido', async () => {
    await expect(exportar('A', { destinatarios: ['ana@a.com'], formato: 'xlsx' })).rejects.toMatchObject({ codigo: 'formato_invalid' });
  });

  it('acima de 10.000 linhas responde 413 e não envia', async () => {
    bancos.B.total = 10_001;
    await expect(exportar('B', { destinatarios: ['bob@b.com'], formato: 'csv' })).rejects.toMatchObject({ status: 413 });
    expect(RemetenteDuble.enviados).toHaveLength(0);
  });

  it('pdf: anexo .pdf válido', async () => {
    await exportar('A', { destinatarios: ['ana@a.com'], formato: 'pdf' });
    const anexo = RemetenteDuble.enviados[0]!.anexos![0]!;
    expect(anexo.nome).toMatch(/\.pdf$/);
    expect(decodificar(anexo.conteudoBase64).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('neutraliza fórmula no CSV anexado e monta o assunto no servidor', async () => {
    bancos.A.linhas[0]!.contactName = '=HYPERLINK("http://x")';
    await exportar('A', { destinatarios: ['ana@a.com'], formato: 'csv', filtros: { contact: 'Assunto\r\nBcc: x@y.com' } });
    const email = RemetenteDuble.enviados[0]!;
    expect(decodificar(email.anexos![0]!.conteudoBase64).toString('utf8')).toContain(`"'=HYPERLINK`);
    expect(email.assunto).toMatch(/^Exportação do Histórico \(\d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}\)$/);
    bancos.A.linhas[0]!.contactName = 'Contato A';
  });
});

describe('remetente HTTP', () => {
  it('manda attachments no formato Resend', async () => {
    const { RemetenteHttp } = await import('../src/domain/email.js');
    process.env['PIPE_EMAIL_TOKEN'] = 'token-de-teste-123';
    process.env['PIPE_EMAIL_REMETENTE'] = 'pipe@teste.com';
    const buscar = vi.fn(async () => new Response('{}', { status: 200 }));
    await new RemetenteHttp(buscar as unknown as typeof fetch).enviar({
      para: ['ana@a.com'], assunto: 's', texto: 't', anexos: [{ nome: 'h.csv', tipo: 'text/csv', conteudoBase64: 'QQ==' }],
    });
    const corpo = JSON.parse((buscar.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(corpo.attachments).toEqual([{ filename: 'h.csv', content: 'QQ==' }]);
  });
});
