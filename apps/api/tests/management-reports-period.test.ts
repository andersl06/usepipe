import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../src/session.js';
import type * as Sessao from '../src/session.js';

const duplos = vi.hoisted(() => ({
  loadAttendance: vi.fn(async (..._args: unknown[]) => ({})),
  loadEffort: vi.fn(async (..._args: unknown[]) => ({})),
  loadSatisfaction: vi.fn(async (..._args: unknown[]) => ({})),
  tenants: [] as string[],
  negar: false,
  permissoes: [] as string[],
}));

vi.mock('../src/session.js', async (original) => ({
  ...(await original<typeof Sessao>()),
  requirePermission: async (_tx: unknown, _u: string, codigo: string) => {
    duplos.permissoes.push(codigo);
    if (duplos.negar) throw Object.assign(new Error('negado'), { status: 403, codigo: 'sem_permissao' });
  },
}));

vi.mock('../src/database.js', () => ({
  noTenant: async (tenantId: string, ler: (tx: unknown) => Promise<unknown>) => {
    duplos.tenants.push(tenantId);
    return ler({});
  },
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
  loadHistory: async () => ({ linhas: [], total: 0 }),
}));
vi.mock('../src/domain/management/attendance.js', () => ({ loadAttendance: duplos.loadAttendance }));
vi.mock('../src/domain/management/effort.js', () => ({ loadEffort: duplos.loadEffort }));
vi.mock('../src/domain/management/satisfaction.js', () => ({ loadSatisfaction: duplos.loadSatisfaction }));

const { ManagementOperationsController } = await import('../src/controllers/management-operations.js');
const controller = new ManagementOperationsController();
const request = { session: { tenantId: 'tenant-a', userId: 'usuario', origem: 'google' } } as unknown as RequestWithSession;

beforeEach(() => {
  duplos.loadAttendance.mockClear();
  duplos.loadEffort.mockClear();
  duplos.loadSatisfaction.mockClear();
  duplos.tenants.length = 0;
  duplos.permissoes.length = 0;
  duplos.negar = false;
});

const recusado = { status: 400, codigo: 'periodo_longo_demais' };
const chamadas = {
  atendimento: (de?: string, ate?: string) => controller.reportOfAttendance(request, undefined, undefined, de, ate),
  esforco: (de?: string, ate?: string) => controller.reportOfEffort(request, de, ate),
  satisfacao: (de?: string, ate?: string) => controller.reportOfSatisfaction(request, de, ate),
};

describe('relatórios: permissão', () => {
  it.each(Object.entries(chamadas))('%s exige relatorio.ver antes de consultar os dados', async (_nome, chamar) => {
    duplos.negar = true;
    await expect(chamar('2026-09-01', '2026-09-10')).rejects.toMatchObject({ status: 403 });
    expect(duplos.permissoes).toEqual(['relatorio.ver']);
    expect(duplos.loadAttendance).not.toHaveBeenCalled();
    expect(duplos.loadEffort).not.toHaveBeenCalled();
    expect(duplos.loadSatisfaction).not.toHaveBeenCalled();
  });
});

describe('relatórios: período limitado a 90 dias no servidor', () => {
  it.each(Object.entries(chamadas))('%s recusa 91 dias sem consultar os dados', async (_nome, chamar) => {
    await expect(chamar('2026-06-01', '2026-08-30')).rejects.toMatchObject(recusado);
    expect(duplos.loadAttendance).not.toHaveBeenCalled();
    expect(duplos.loadEffort).not.toHaveBeenCalled();
    expect(duplos.loadSatisfaction).not.toHaveBeenCalled();
  });

  it.each(Object.entries(chamadas))('%s aceita exatamente 90 dias e usa o tenant da sessão', async (_nome, chamar) => {
    const r = await chamar('2026-06-01', '2026-08-29');
    expect([r.de, r.ate]).toEqual(['2026-06-01', '2026-08-29']);
    expect(duplos.tenants).toEqual(['tenant-a']);
  });

  it.each(Object.entries(chamadas))('%s recusa data final anterior à inicial', async (_nome, chamar) => {
    await expect(chamar('2026-09-10', '2026-09-01')).rejects.toMatchObject({ status: 400, codigo: 'periodo_invalido' });
  });

  it.each(Object.entries(chamadas))('%s sem período usa o padrão e passa', async (_nome, chamar) => {
    await expect(chamar()).resolves.toMatchObject({ ate: '2026-09-23' });
  });
});
