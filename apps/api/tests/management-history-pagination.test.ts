import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../src/session.js';

const duplos = vi.hoisted(() => ({
  loadHistory: vi.fn(async (..._args: unknown[]) => ({ linhas: [], total: 61 })),
}));

vi.mock('../src/database.js', () => ({
  noTenant: async (_tenantId: string, ler: (tx: unknown) => Promise<unknown>) => ler({}),
}));
vi.mock('../src/domain/management/window.js', () => ({
  fusoDoTenant: async () => 'UTC',
  windowOfToday: async () => ({
    start: new Date('2026-09-23T00:00:00.000Z'),
    end: new Date('2026-09-24T00:00:00.000Z'),
  }),
  windowOfDates: async (_tx: unknown, _fuso: string, de: string, ate: string) => ({
    start: new Date(`${de}T00:00:00.000Z`),
    end: new Date(`${ate}T00:00:00.000Z`),
  }),
  dataIso: (data: Date, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(data),
}));
vi.mock('../src/domain/management/history.js', () => ({
  carregarCatalogos: async () => ({ queues: [], agents: [], labels: [] }),
  loadHistory: duplos.loadHistory,
}));
vi.mock('../src/domain/management/attendance.js', () => ({ loadAttendance: async () => ({}) }));

const { ManagementOperationsController } = await import('../src/controllers/management-operations.js');
const controller = new ManagementOperationsController();
const request = { session: { tenantId: 'tenant', userId: 'usuario', origem: 'google' } } as unknown as RequestWithSession;

const chamar = (pagina?: string, porPagina?: string, ticket?: string, contato?: string) =>
  controller.history(request, undefined, undefined, undefined, undefined, undefined, ticket, contato, pagina, porPagina);

beforeEach(() => duplos.loadHistory.mockClear());

describe('GET /v1/management/history paginado no servidor', () => {
  it('pagina=2&porPagina=25 pede a janela 25..50 e devolve o total geral', async () => {
    const resposta = await chamar('2', '25');
    expect(duplos.loadHistory.mock.calls[0]?.[3]).toEqual({ limit: 25, offset: 25 });
    expect([resposta.total, resposta.pagina, resposta.porPagina]).toEqual([61, 2, 25]);
  });

  it('sem parâmetros usa a primeira página de 50', async () => {
    const resposta = await chamar();
    expect(duplos.loadHistory.mock.calls[0]?.[3]).toEqual({ limit: 50, offset: 0 });
    expect([resposta.pagina, resposta.porPagina]).toEqual([1, 50]);
  });

  it('recusa porPagina fora de 5, 10, 15, 25, 50, 100, 250, 500 sem consultar o banco', async () => {
    await expect(chamar('1', '501')).rejects.toMatchObject({ codigo: 'porPagina_invalid', status: 400 });
    await expect(chamar('1', '7')).rejects.toMatchObject({ codigo: 'porPagina_invalid', status: 400 });
    expect(duplos.loadHistory).not.toHaveBeenCalled();
  });

  it('recusa página zero, negativa ou não inteira', async () => {
    for (const pagina of ['0', '-1', '1.5', 'x']) {
      await expect(chamar(pagina, '25')).rejects.toMatchObject({ codigo: 'pagina_invalid', status: 400 });
    }
  });

  it('repassa ids de ticket e contato ao filtro, limitando a 20 ids', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `#A${i}`).join(',');
    await chamar('1', '25', ids, 'Ana');
    const filtro = duplos.loadHistory.mock.calls[0]?.[2] as { tickets: string[]; contact: string };
    expect(filtro.tickets).toHaveLength(20);
    expect(filtro.contact).toBe('Ana');
  });
});
