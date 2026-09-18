import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import type { MetricasDoAtendente } from '@pipe/contracts';
import { data } from './consultas.js';

/**
 * As métricas do atendente, para a tela de métricas do Desk — movidas de
 * `apps/desk/src/servidor/metricas.ts` com o SQL intacto; a forma da resposta
 * é `MetricasDoAtendente`, de `@pipe/contracts`.
 *
 * **É sempre do próprio atendente**, nunca de um colega e nunca de outro
 * cliente. O isolamento vem de dois lugares que se somam: a transação roda em
 * `noTenant`, com a RLS do banco valendo, e toda consulta daqui filtra por
 * `atendente_id` — que vem da sessão, não da URL. Não existe parâmetro para
 * olhar o número de outra pessoa, e é assim que tem de continuar: a visão da
 * operação é do Pipe Gestão, com permissão de supervisor.
 *
 * A anatomia é a da tela de referência (`docs/pesquisa/blip-desk-medidas.md`,
 * §10): seis contagens de situação, três tempos médios e uma série diária.
 *
 * Duas coisas que a referência faz e que aqui NÃO se copia, de propósito:
 *
 * 1. Lá as consultas são disparadas uma por robô, em paralelo, e **quando uma
 *    falha o total sai menor sem ninguém avisar**. Aqui é uma consulta só, na
 *    mesma transação: ou o número está certo, ou a tela quebra e a pessoa sabe.
 * 2. Lá a média de tempo é a média simples entre robôs, cada um pesando igual
 *    tenha ele 1 ou 500 atendimentos. Aqui a média é sobre os atendimentos, que
 *    é a única que responde "quanto o cliente esperou por mim".
 */

function inteiro(valor: string | number | null): number {
  return valor === null ? 0 : Number(valor);
}

function segundos(valor: string | number | null): number | null {
  return valor === null ? null : Math.round(Number(valor));
}

export async function carregarMetricas(
  tx: TransacaoPipe,
  atendenteId: string,
  inicio: Date,
  fim: Date,
): Promise<MetricasDoAtendente> {
  /*
   * Uma passada só sobre as conversas do atendente que TOCAM o período — ou
   * porque caíram nele, ou porque fecharam nele. Contar as duas coisas na
   * mesma varredura evita a segunda ida ao banco, e o `filter` do Postgres é
   * exatamente a ferramenta para isso.
   *
   * Cada tempo médio tem a sua própria população, e é por isso que cada um leva
   * o seu `filter`: uma conversa sem primeira resposta não pode puxar a média
   * de primeira resposta para baixo, ela simplesmente não entra na conta.
   */
  const { rows } = await tx.execute<{
    abertos: string | null;
    fechados: string | null;
    finalizados: string | null;
    abandonados: string | null;
    primeira_resposta: string | null;
    espera_fila: string | null;
    espera_total: string | null;
  }>(sql`
    select
      count(*) filter (where c.atribuida_em between ${inicio} and ${fim}) as abertos,
      count(*) filter (where c.encerrada_em between ${inicio} and ${fim}) as fechados,
      count(*) filter (
        where c.encerrada_em between ${inicio} and ${fim}
          and c.encerrada_por = ${atendenteId}
      ) as finalizados,
      count(*) filter (
        where c.encerrada_em between ${inicio} and ${fim}
          and c.encerrada_por is null
      ) as abandonados,
      avg(extract(epoch from (c.primeira_resposta_em - coalesce(c.atribuida_em, c.criada_em))))
        filter (
          where c.primeira_resposta_em is not null
            and c.primeira_resposta_em between ${inicio} and ${fim}
        ) as primeira_resposta,
      avg(extract(epoch from (c.atribuida_em - c.criada_em)))
        filter (where c.atribuida_em between ${inicio} and ${fim}) as espera_fila,
      avg(extract(epoch from (c.atribuida_em - c.criada_em)) + c.pausado_seg)
        filter (where c.atribuida_em between ${inicio} and ${fim}) as espera_total
      from conversa c
     where c.atendente_id = ${atendenteId}
       and (
         c.atribuida_em between ${inicio} and ${fim}
         or c.encerrada_em between ${inicio} and ${fim}
       )
  `);

  const t = rows[0];

  /*
   * A série diária. O `generate_series` garante que dia sem movimento apareça
   * como zero em vez de sumir do gráfico — sem ele, uma semana com dois dias
   * parados vira uma linha que mente sobre o ritmo.
   *
   * ponytail: duas subconsultas correlacionadas por dia, no máximo 90 dias e
   * sempre com o índice de atendente. Se um dia isto virar visão de operação,
   * troque por um `group by` sobre uma união das duas datas.
   */
  const serie = await tx.execute<{
    dia: Date | string;
    abertos: string | null;
    fechados: string | null;
  }>(sql`
    select
      d::date as dia,
      (select count(*) from conversa c
        where c.atendente_id = ${atendenteId}
          and c.atribuida_em >= d and c.atribuida_em < d + interval '1 day') as abertos,
      (select count(*) from conversa c
        where c.atendente_id = ${atendenteId}
          and c.encerrada_em >= d and c.encerrada_em < d + interval '1 day') as fechados
      from generate_series(date_trunc('day', ${inicio}::timestamptz), ${fim}, interval '1 day') d
     order by d
  `);

  return {
    situacoes: {
      abertos: inteiro(t?.abertos ?? null),
      fechados: inteiro(t?.fechados ?? null),
      finalizados: inteiro(t?.finalizados ?? null),
      abandonados: inteiro(t?.abandonados ?? null),
      // Transferência e perda não existem no nosso domínio: não há coluna que
      // diga que a conversa mudou de atendente nem que ela se perdeu. `null`
      // aqui vira um traço na tela, e não um zero — zero seria mentira.
      transferidos: null,
      perdidos: null,
    },
    tempos: {
      primeiraRespostaSeg: segundos(t?.primeira_resposta ?? null),
      esperaNaFilaSeg: segundos(t?.espera_fila ?? null),
      esperaTotalSeg: segundos(t?.espera_total ?? null),
    },
    serie: serie.rows.map((r) => ({
      dia: data(r.dia).toISOString().slice(0, 10),
      abertos: inteiro(r.abertos),
      fechados: inteiro(r.fechados),
    })),
  };
}
