import { and, gte, isNull, lt, sql } from 'drizzle-orm';
import { lead, opportunity } from '@pipe/db/schema';
import { consultar, type Window } from './database';

/**
 * Dashboard indicators — the same five cards from the approved mockup.
 *
 * Every average shows its denominator: a qualification rate with no total lead
 * count is the number that improves exactly when fewer leads come in.
 */
export interface Indicadores {
  leadsNoMes: number;
  leadsNoMesAnterior: number;
  qualificadosNoMes: number;
  opportunitiesOpen: number;
  diasMediosAbertas: number | null;
  inNegotiation: number;
  valueWeighted: number;
  fechadoNoMes: number;
  fechadoNoMesAnterior: number;
  perdidoNoMes: number;
}

export async function carregarIndicadores(mes: Window, mesAnterior: Window): Promise<Indicadores> {
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
        valor: sql<string>`coalesce(sum(${opportunity.valor}), 0)`,
        ponderado: sql<string>`coalesce(sum(${opportunity.valor} * coalesce(${opportunity.probabilidade},0) / 100.0), 0)`,
        diasMedios: sql<string | null>`avg(extract(epoch from (now() - ${opportunity.criadoEm})) / 86400)`,
      })
      .from(opportunity)
      .where(isNull(opportunity.fechadaEm));

    const [fechadas] = await tx
      .select({
        ganho: sql<string>`coalesce(sum(${opportunity.valor}) filter (where ${opportunity.ganha}), 0)`,
        perdido: sql<string>`coalesce(sum(${opportunity.valor}) filter (where ${opportunity.ganha} = false), 0)`,
      })
      .from(opportunity)
      .where(and(gte(opportunity.fechadaEm, mes.inicio), lt(opportunity.fechadaEm, mes.fim)));

    const [fechadasAntes] = await tx
      .select({
        ganho: sql<string>`coalesce(sum(${opportunity.valor}) filter (where ${opportunity.ganha}), 0)`,
      })
      .from(opportunity)
      .where(
        and(
          gte(opportunity.fechadaEm, mesAnterior.inicio),
          lt(opportunity.fechadaEm, mesAnterior.fim),
        ),
      );

    const num = (v: unknown) => Number(v ?? 0) || 0;

    return {
      leadsNoMes: leads?.total ?? 0,
      leadsNoMesAnterior: leadsAntes?.total ?? 0,
      qualificadosNoMes: leads?.qualificados ?? 0,
      opportunitiesOpen: abertas?.n ?? 0,
      diasMediosAbertas: abertas?.diasMedios ? num(abertas.diasMedios) : null,
      inNegotiation: num(abertas?.valor),
      valueWeighted: num(abertas?.ponderado),
      fechadoNoMes: num(fechadas?.ganho),
      fechadoNoMesAnterior: num(fechadasAntes?.ganho),
      perdidoNoMes: num(fechadas?.perdido),
    };
  });
}

/** Volume by source for the month, which is the reading a manager does right after the total. */
export async function leadsByOrigin(mes: Window): Promise<{ origem: string; n: number }[]> {
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

/** Leads by stage, with how many have been stalled for more than 7 days — which costs money. */
export async function leadsByStage(): Promise<{ fase: string; n: number; parados: number }[]> {
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
