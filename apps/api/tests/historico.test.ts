import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequisicaoComSessao } from '../src/sessao.js';

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

vi.mock('../src/banco.js', () => ({
  noTenant: async (_tenantId: string, ler: (tx: unknown) => Promise<unknown>) => ler({}),
}));
vi.mock('../src/dominio/gestao/janela.js', () => ({
  fusoDoTenant: duplos.fusoDoTenant,
  janelaDeHoje: duplos.janelaDeHoje,
  janelaDeDatas: duplos.janelaDeDatas,
  dataIso: (data: Date, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(data),
}));
vi.mock('../src/dominio/gestao/historico.js', () => ({
  carregarCatalogos: async () => ({ filas: [], atendentes: [], etiquetas: [] }),
  carregarHistorico: duplos.carregarHistorico,
}));
vi.mock('../src/dominio/gestao/atendimento.js', () => ({
  carregarAtendimento: async () => ({}),
}));

const { ControladorGestaoOperacao } = await import('../src/controladores/gestao-operacao.js');
const controlador = new ControladorGestaoOperacao();
const requisicao = { sessao: { tenantId: 'tenant', usuarioId: 'usuario', origem: 'google' } } as unknown as RequisicaoComSessao;

beforeEach(() => {
  duplos.fusoDoTenant.mockResolvedValue('UTC');
  duplos.janelaDeHoje.mockResolvedValue({
    inicio: new Date('2026-09-23T00:00:00.000Z'),
    fim: new Date('2026-09-24T00:00:00.000Z'),
  });
  duplos.janelaDeDatas.mockClear();
});

describe('GET /v1/gestao/historico', () => {
  it('usa os últimos 30 dias, incluindo hoje, quando não recebe datas', async () => {
    const resposta = await controlador.historico(requisicao);
    expect([resposta.de, resposta.ate]).toEqual(['2026-08-25', '2026-09-23']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'UTC', '2026-08-25', '2026-09-23');
  });

  it('conta 30 datas civis no fuso do tenant ao atravessar o horário de verão', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.janelaDeHoje.mockResolvedValue({
      inicio: new Date('2026-03-20T04:00:00.000Z'),
      fim: new Date('2026-03-21T04:00:00.000Z'),
    });

    const resposta = await controlador.historico(requisicao);
    expect([resposta.de, resposta.ate]).toEqual(['2026-02-19', '2026-03-20']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'America/New_York', '2026-02-19', '2026-03-20');
  });

  it('preserva datas explícitas', async () => {
    const resposta = await controlador.historico(requisicao, undefined, undefined, undefined, '2026-07-01', '2026-07-15');
    expect([resposta.de, resposta.ate]).toEqual(['2026-07-01', '2026-07-15']);
    expect(duplos.janelaDeDatas).toHaveBeenLastCalledWith({}, 'UTC', '2026-07-01', '2026-07-15');
  });

  it('mantém o cálculo legado dos demais relatórios ao atravessar DST', async () => {
    duplos.fusoDoTenant.mockResolvedValue('America/New_York');
    duplos.janelaDeHoje.mockResolvedValue({
      inicio: new Date('2026-03-10T04:00:00.000Z'),
      fim: new Date('2026-03-11T04:00:00.000Z'),
    });

    const resposta = await controlador.relatorioDeAtendimento(requisicao);
    expect([resposta.de, resposta.ate]).toEqual(['2026-03-03', '2026-03-10']);
    expect(duplos.janelaDeDatas).toHaveBeenCalledWith({}, 'America/New_York', '2026-03-03', '2026-03-10');
  });
});
