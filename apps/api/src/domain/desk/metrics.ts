import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type { MetricsOfAgent } from '@pipe/contracts';
import { data } from './consultas.js';

/**
 * Agent metrics for the Desk screen, moved from `apps/desk/src/servidor/metricas.ts` with SQL unchanged; return `MetricasDoAtendente` from `@pipe/contracts`. Always show the current agent, never a colleague or another client. Isolation combines `noTenant` RLS with an `atendente_id` filter taken from the session, not the URL. There is no parameter to inspect another agent; supervisor operations belong in Pipe Management. The source screen (`referencias-blip/pesquisa/blip-desk-medidas.md` §10) has six state counts, three averages, and a daily series. Two intentional differences: source queries run in parallel per bot and silently undercount when one fails; this implementation runs one query in one transaction, so failure is visible. The source averages bot averages equally whether a bot handled one or 500 tickets; this implementation averages across tickets to answer how long clients waited for this agent.
 */

function integer(value: string | number | null): number {
  return value === null ? 0 : Number(value);
}

function segundos(valor: string | number | null): number | null {
  return valor === null ? null : Math.round(Number(valor));
}

export async function loadMetrics(
  tx: TransactionPipe,
  agentId: string,
  inicio: Date,
  fim: Date,
): Promise<MetricsOfAgent> {
  /*
   * Scan once over this agent's conversations touching the period through arrival or closure. Counting both in one pass avoids a second database query; Postgres `filter` supports it. Each average has its own population and `filter`: a conversation without a first response must not lower the first-response average; it is excluded.
   */
  const { rows } = await tx.execute<{
    abertos: string | null;
    fechados: string | null;
    finalizados: string | null;
    abandonados: string | null;
    firstResponse: string | null;
    waitQueue: string | null;
    espera_total: string | null;
  }>(sql`
    select
      count(*) filter (where c.atribuida_em between ${inicio} and ${fim}) as abertos,
      count(*) filter (where c.encerrada_em between ${inicio} and ${fim}) as fechados,
      count(*) filter (
        where c.encerrada_em between ${inicio} and ${fim}
          and c.encerrada_por = ${agentId}
      ) as finalizados,
      count(*) filter (
        where c.encerrada_em between ${inicio} and ${fim}
          and c.encerrada_por is null
      ) as abandonados,
      avg(extract(epoch from (c.primeira_resposta_em - coalesce(c.atribuida_em, c.criada_em))))
        filter (
          where c.primeira_resposta_em is not null
            and c.primeira_resposta_em between ${inicio} and ${fim}
        ) as "firstResponse",
      avg(extract(epoch from (c.atribuida_em - c.criada_em)))
        filter (where c.atribuida_em between ${inicio} and ${fim}) as "waitQueue",
      avg(extract(epoch from (c.atribuida_em - c.criada_em)) + c.pausado_seg)
        filter (where c.atribuida_em between ${inicio} and ${fim}) as espera_total
      from conversa c
     where c.atendente_id = ${agentId}
       and (
         c.atribuida_em between ${inicio} and ${fim}
         or c.encerrada_em between ${inicio} and ${fim}
       )
  `);

  const t = rows[0];

  /*
   * Daily series uses `generate_series` so inactive days appear as zero rather than disappearing from the chart. It currently uses two correlated subqueries per day for at most 90 indexed days; if this becomes an operations view, replace them with a `group by` over both date sets.
   */
  const serie = await tx.execute<{
    dia: Date | string;
    abertos: string | null;
    fechados: string | null;
  }>(sql`
    select
      d::date as dia,
      (select count(*) from conversa c
        where c.atendente_id = ${agentId}
          and c.atribuida_em >= d and c.atribuida_em < d + interval '1 day') as abertos,
      (select count(*) from conversa c
        where c.atendente_id = ${agentId}
          and c.encerrada_em >= d and c.encerrada_em < d + interval '1 day') as fechados
      from generate_series(date_trunc('day', ${inicio}::timestamptz), ${fim}, interval '1 day') d
     order by d
  `);

  return {
    situations: {
      abertos: integer(t?.abertos ?? null),
      fechados: integer(t?.fechados ?? null),
      finalizados: integer(t?.finalizados ?? null),
      abandonados: integer(t?.abandonados ?? null),
      // Transfers are supported in the domain, but this Desk response does not compute per-agent transfer or loss counters. Return `null` for both so the screen shows a dash instead of an invented zero.
      transferidos: null,
      perdidos: null,
    },
    tempos: {
      firstResponseSeg: segundos(t?.firstResponse ?? null),
      waitInQueueSeg: segundos(t?.waitQueue ?? null),
      esperaTotalSeg: segundos(t?.espera_total ?? null),
    },
    serie: serie.rows.map((r) => ({
      dia: data(r.dia).toISOString().slice(0, 10),
      abertos: integer(r.abertos),
      fechados: integer(r.fechados),
    })),
  };
}
