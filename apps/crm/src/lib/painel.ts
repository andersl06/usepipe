import { and, gte, isNull, lt, sql } from 'drizzle-orm';
import { lead, oportunidade } from '@pipe/db/schema';
import { consultar, type Janela } from './banco';

/**
 * Indicadores do painel — os mesmos cinco cartões do mockup aprovado.
 *
 * Toda média mostra o denominador: a taxa de qualificação sem o total de leads é o
 * número que melhora justamente quando entram menos leads.
 */
export interface Indicadores {
  leadsNoMes: number;
  leadsNoMesAnterior: number;
  qualificadosNoMes: number;
  oportunidadesAbertas: number;
  diasMediosAbertas: number | null;
  emNegociacao: number;
  valorPonderado: number;
  fechadoNoMes: number;
  fechadoNoMesAnterior: number;
  perdidoNoMes: number;
}

export async function carregarIndicadores(mes: Janela, mesAnterior: Janela): Promise<Indicadores> {
  return consultar(async (tx) => {
    const [leads] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        qualificados: sql<number>`count(*) filter (where ${lead.status} in ('qualificado','convertido'))::int`,
      })
      .from(lead)
      .where(and(isNull(lead.excluidoEm), gte(lead.criadoEm, mes.inicio), lt(lead.criadoEm, mes.fim)));

    const [leadsAntes] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(lead)
      .where(
        and(
          isNull(lead.excluidoEm),
          gte(lead.criadoEm, mesAnterior.inicio),
          lt(lead.criadoEm, mesAnterior.fim),
        ),
      );

    const [abertas] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        valor: sql<string>`coalesce(sum(${oportunidade.valor}), 0)`,
        ponderado: sql<string>`coalesce(sum(${oportunidade.valor} * coalesce(${oportunidade.probabilidade},0) / 100.0), 0)`,
        diasMedios: sql<string | null>`avg(extract(epoch from (now() - ${oportunidade.criadoEm})) / 86400)`,
      })
      .from(oportunidade)
      .where(isNull(oportunidade.fechadaEm));

    const [fechadas] = await tx
      .select({
        ganho: sql<string>`coalesce(sum(${oportunidade.valor}) filter (where ${oportunidade.ganha}), 0)`,
        perdido: sql<string>`coalesce(sum(${oportunidade.valor}) filter (where ${oportunidade.ganha} = false), 0)`,
      })
      .from(oportunidade)
      .where(and(gte(oportunidade.fechadaEm, mes.inicio), lt(oportunidade.fechadaEm, mes.fim)));

    const [fechadasAntes] = await tx
      .select({
        ganho: sql<string>`coalesce(sum(${oportunidade.valor}) filter (where ${oportunidade.ganha}), 0)`,
      })
      .from(oportunidade)
      .where(
        and(
          gte(oportunidade.fechadaEm, mesAnterior.inicio),
          lt(oportunidade.fechadaEm, mesAnterior.fim),
        ),
      );

    const num = (v: unknown) => Number(v ?? 0) || 0;

    return {
      leadsNoMes: leads?.total ?? 0,
      leadsNoMesAnterior: leadsAntes?.total ?? 0,
      qualificadosNoMes: leads?.qualificados ?? 0,
      oportunidadesAbertas: abertas?.n ?? 0,
      diasMediosAbertas: abertas?.diasMedios ? num(abertas.diasMedios) : null,
      emNegociacao: num(abertas?.valor),
      valorPonderado: num(abertas?.ponderado),
      fechadoNoMes: num(fechadas?.ganho),
      fechadoNoMesAnterior: num(fechadasAntes?.ganho),
      perdidoNoMes: num(fechadas?.perdido),
    };
  });
}

/** Volume por origem no mês, que é a leitura que o gestor faz logo depois do total. */
export async function leadsPorOrigem(mes: Janela): Promise<{ origem: string; n: number }[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({ origem: lead.origem, n: sql<number>`count(*)::int` })
      .from(lead)
      .where(and(isNull(lead.excluidoEm), gte(lead.criadoEm, mes.inicio), lt(lead.criadoEm, mes.fim)))
      .groupBy(lead.origem)
      .orderBy(sql`count(*) desc`);
    return linhas.map((l) => ({ origem: l.origem ?? 'sem origem', n: l.n }));
  });
}

/** Leads por fase, com quantos estão parados há mais de 7 dias — o que custa dinheiro. */
export async function leadsPorFase(): Promise<{ fase: string; n: number; parados: number }[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        fase: lead.fase,
        n: sql<number>`count(*)::int`,
        parados: sql<number>`count(*) filter (where ${lead.faseDesde} < now() - interval '7 days')::int`,
      })
      .from(lead)
      .where(and(isNull(lead.excluidoEm), sql`${lead.status} not in ('convertido','desqualificado')`))
      .groupBy(lead.fase)
      .orderBy(sql`count(*) desc`);
    return linhas.map((l) => ({ fase: l.fase ?? 'sem fase', n: l.n, parados: l.parados }));
  });
}
