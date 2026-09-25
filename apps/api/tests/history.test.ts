import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../src/session.js';

const duplos = vi.hoisted(() => ({
  fusoDoTenant: vi.fn(async () => 'UTC'),
  janelaDeHoje: vi.fn(async () => ({
    inicio: new Date('2026-09-23T00:00:00.000Z'),
    fim: new Date('2026-09-24T00:00:00.000Z'),
  })),
  janelaDeDatas: vi.fn(async (_tx: unknown, _fuso: string, de: string, ate: string) => ({
    inicio: new Date(`${de}T00:00:00.000Z`),
    fim: new Date(`${ate}T00:00:00.000Z`),
  })),
  carregarHistorico: vi.fn(async () => ({ linhas: [], truncado: false })),
}));

vi.mock('../src/database.js', () => ({
  noTenant: async (_tenantId: string, ler: (tx: unknown) => Promise<unknown>) => ler({}),
}));
vi.mock('../src/domain/management/window.js', () => ({
  fusoDoTenant: duplos.fusoDoTenant,
  janelaDeHoje: duplos.janelaDeHoje,
  janelaDeDatas: duplos.janelaDeDatas,
  dataIso: (data: Date, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(data),
}));
vi.mock('../src/domain/management/history.js', () => ({
  carregarCatalogos: async () => ({ filas: [], atendentes: [], etiquetas: [] }),
  carregarHistorico: duplos.carregarHistorico,
}));
vi.mock('../src/domain/management/attendance.js', () => ({
  carregarAtendimento: async () => ({}),
}));

const { ManagementOperationsController } = await import('../src/controllers/management-operations.js');
const controller = new ManagementOperationsController();
const request = { sessao: { tenantId: 'tenant', usuarioId: 'usuario', origem: 'google' } } as unknown as RequestWithSession;

beforeEach(() => {
  duplos.fusoDoTenant.mockResolvedValue('UTC');
  duplos.janelaDeHoje.mockResolvedValue({
    inicio: new Date('2026-09-23T00:00:00.000Z'),
    fim: new Date('2026-09-24T00:00:00.000Z'),
  });
  duplos.janelaDeDatas.mockClear();
});

describe('GET /v1/management/history', () => {
  it('usa os últimos 30 dias, incluindo hoje, quando não recebe datas', async () => {
    const resposta = await controller.history(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-08-25', '2026-09-23']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'UTC', '2026-08-25', '2026-09-23');
  });

  it('Count 30 tenant-local calendar dates across daylight saving transitions', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.janelaDeHoje.mockResolvedValue({
      inicio: new Date('2026-03-20T04:00:00.000Z'),
      fim: new Date('2026-03-21T04:00:00.000Z'),
    });

    const resposta = await controller.history(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-02-19', '2026-03-20']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'America/New_York', '2026-02-19', '2026-03-20');
  });

  it('preserva datas explícitas', async () => {
    const resposta = await controller.history(request, undefined, undefined, undefined, '2026-07-01', '2026-07-15');
    expect([resposta.de, resposta.ate]).toEqual(['2026-07-01', '2026-07-15']);
    expect(duplos.janelaDeDatas).toHaveBeenLastCalledWith({}, 'UTC', '2026-07-01', '2026-07-15');
  });

  it('Preserve legacy date calculations for other reports across daylight saving transitions', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.janelaDeHoje.mockResolvedValue({
      inicio: new Date('2026-03-10T04:00:00.000Z'),
      fim: new Date('2026-03-11T04:00:00.000Z'),
    });

    const resposta = await controller.reportOfAttendance(request);
    expect([resposta.de, resposta.ate]).toEqual(['2026-03-03', '2026-03-10']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'America/New_York', '2026-03-03', '2026-03-10');
  });
});
