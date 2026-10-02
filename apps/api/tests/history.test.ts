import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../src/session.js';
import type * as Sessao from '../src/session.js';

const duplos = vi.hoisted(() => ({
  fusoDoTenant: vi.fn(async () => 'UTC'),
  windowOfToday: vi.fn(async () => ({
    start: new Date('2026-09-23T00:00:00.000Z'),
    end: new Date('2026-09-24T00:00:00.000Z'),
  })),
  windowOfDates: vi.fn(async (_tx: unknown, _fuso: string, de: string, ate: string) => ({
    start: new Date(`${de}T00:00:00.000Z`),
    end: new Date(`${ate}T00:00:00.000Z`),
  })),
  loadHistory: vi.fn(async () => ({ linhas: [], total: 0 })),
}));

vi.mock('../src/session.js', async (original) => ({
  ...(await original<typeof Sessao>()),
  requirePermission: async () => undefined,
}));
vi.mock('../src/database.js', () => ({
  noTenant: async (_tenantId: string, ler: (tx: unknown) => Promise<unknown>) => ler({}),
}));
vi.mock('../src/domain/management/window.js', () => ({
  fusoDoTenant: duplos.fusoDoTenant,
  windowOfToday: duplos.windowOfToday,
  windowOfDates: duplos.windowOfDates,
  dataIso: (data: Date, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(data),
}));
vi.mock('../src/domain/management/history.js', () => ({
  carregarCatalogos: async () => ({ filas: [], atendentes: [], etiquetas: [] }),
  loadHistory: duplos.loadHistory,
}));
vi.mock('../src/domain/management/attendance.js', () => ({
  loadAttendance: async () => ({}),
}));

const { ManagementOperationsController } = await import('../src/controllers/management-operations.js');
const controller = new ManagementOperationsController();
const request = { session: { tenantId: 'tenant', userId: 'usuario', origem: 'google' } } as unknown as RequestWithSession;

beforeEach(() => {
  duplos.fusoDoTenant.mockResolvedValue('UTC');
  duplos.windowOfToday.mockResolvedValue({
    start: new Date('2026-09-23T00:00:00.000Z'),
    end: new Date('2026-09-24T00:00:00.000Z'),
  });
  duplos.windowOfDates.mockClear();
});

describe('GET /v1/management/history', () => {
  it('usa os últimos 30 dias, incluindo hoje, quando não recebe datas', async () => {
    const resposta = await controller.history(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-08-25', '2026-09-23']);
    expect(duplos.windowOfDates).toHaveBeenCalledWith({}, 'UTC', '2026-08-25', '2026-09-23');
  });

  it('Count 30 tenant-local calendar dates across daylight saving transitions', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.windowOfToday.mockResolvedValue({
      start: new Date('2026-03-20T04:00:00.000Z'),
      end: new Date('2026-03-21T04:00:00.000Z'),
    });

    const resposta = await controller.history(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-02-19', '2026-03-20']);
    expect(duplos.windowOfDates).toHaveBeenCalledWith({}, 'America/New_York', '2026-02-19', '2026-03-20');
  });

  it('preserva datas explícitas', async () => {
    const resposta = await controller.history(request, undefined, undefined, undefined, '2026-07-01', '2026-07-15');
    expect([resposta.de, resposta.ate]).toEqual(['2026-07-01', '2026-07-15']);
    expect(duplos.windowOfDates).toHaveBeenLastCalledWith({}, 'UTC', '2026-07-01', '2026-07-15');
  });

  it('aceita exatamente 90 dias e recusa 91 com 400', async () => {
    const ok = await controller.history(request, undefined, undefined, undefined, '2026-06-26', '2026-09-23');
    expect([ok.de, ok.ate]).toEqual(['2026-06-26', '2026-09-23']);
    await expect(
      controller.history(request, undefined, undefined, undefined, '2026-06-25', '2026-09-23'),
    ).rejects.toMatchObject({ status: 400, codigo: 'periodo_longo_demais' });
  });

  it('recusa data final anterior à inicial com 400', async () => {
    await expect(
      controller.history(request, undefined, undefined, undefined, '2026-07-15', '2026-07-01'),
    ).rejects.toMatchObject({ status: 400, codigo: 'periodo_invalido' });
  });

  it('Preserve legacy date calculations for other reports across daylight saving transitions', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.windowOfToday.mockResolvedValue({
      start: new Date('2026-03-10T04:00:00.000Z'),
      end: new Date('2026-03-11T04:00:00.000Z'),
    });

    const resposta = await controller.reportOfAttendance(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-03-03', '2026-03-10']);
    expect(duplos.windowOfDates).toHaveBeenCalledWith({}, 'America/New_York', '2026-03-03', '2026-03-10');
  });
});
