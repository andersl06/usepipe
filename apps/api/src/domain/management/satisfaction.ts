import { and, count, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { compararIdentificador, mediaPonderadaDePares, taxaDeResposta } from '@pipe/core';
import { conversation, pesquisa, respostaPesquisa } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Relatório de satisfação — §6 da spec de métricas.
 *
 * A ESCALA VIAJA COM A NOTA. `resposta_pesquisa` guarda `escala_min` e
 * `escala_max` de propósito, porque um 4 de CSAT (1 a 5) e um 4 de NPS (0 a 10)
 * não significam a mesma coisa e não podem cair no mesmo gráfico. Por isso o
 * agrupamento é por tipo E escala: nota de escalas diferentes nunca entra na
 * mesma média, por construção, e não por disciplina de quem lê a tela.
 *
 * A população é a mesma dos dois lados da taxa de resposta: respostas de
 * conversas encerradas no período, sobre conversas encerradas no período.
 * Numerador e denominador contados sobre universos diferentes dariam uma taxa
 * que não quer dizer nada.
 */

export interface FatiaDeClasse {
  name: string;
  quantity: number;
  /** Participação na barra. Divisão de contagens, não é métrica da spec. */
  fraction: number;
}

export interface GroupSatisfaction {
  /** `csat` ou `nps`. */
  type: string;
  escalaMin: number;
  escalaMax: number;
  media: number | null;
  /** Respostas com nota — o "parcial" e o "completo" da Blip somados. */
  responses: number;
  /** Pesquisas geradas para conversas encerradas no período, respondidas ou não. */
  enviadas: number;
  /** Respostas ÷ conversas encerradas no período. Obrigatória ao lado da média. */
  taxa: number | null;
  classes: FatiaDeClasse[];
}

export interface ComentarioRecente {
  id: string;
  type: string;
  note: number | null;
  escalaMin: number;
  escalaMax: number;
  classe: string | null;
  texto: string;
  em: Date | null;
}

export interface ReportSatisfaction {
  /** Denominador da taxa de resposta: conversas encerradas no período. */
  encerradas: number;
  groups: GroupSatisfaction[];
  comentarios: ComentarioRecente[];
}

/** Teto dos comentários: é uma amostra recente, não a extração da pesquisa. */
export const LIMITE_COMENTARIOS = 20;

/**
 * Read stored classes from best to worst. `classe` has different vocabulary for CSAT (`satisfeito`/`insatisfeito`) and NPS (`promotor`/`neutro`/`detrator`). Show stored classification without recomputing historical scores, which could introduce new thresholds.
 */
const ORDER_CLASS = ['promotor', 'satisfeito', 'neutro', 'insatisfeito', 'detrator'];

function ordenarClasses(a: FatiaDeClasse, b: FatiaDeClasse): number {
  const ia = ORDER_CLASS.indexOf(a.name);
  const ib = ORDER_CLASS.indexOf(b.name);
  if (ia !== ib) return (ia < 0 ? ORDER_CLASS.length : ia) - (ib < 0 ? ORDER_CLASS.length : ib);
  return a.name < b.name ? -1 : 1;
}

export async function loadSatisfaction(
  tx: TransactionPipe,
  window: Window,
): Promise<ReportSatisfaction> {
  return consultar(tx, async (tx) => {
    const closedInPeriod = and(
      isNotNull(conversation.encerradaEm),
      gte(conversation.encerradaEm, window.start),
      lt(conversation.encerradaEm, window.end),
    );

    // Run serially, never in parallel: `Promise.all` inside the transaction can
    // silently clear `pipe.tenant_id`.
    const [totalRow] = await tx.select({ total: count() }).from(conversation).where(closedInPeriod);
    const encerradas = totalRow?.total ?? 0;

    const linhas = await tx
      .select({
        id: respostaPesquisa.id,
        pesquisaId: respostaPesquisa.pesquisaId,
        tipo: pesquisa.tipo,
        nota: respostaPesquisa.nota,
        escalaMin: respostaPesquisa.escalaMin,
        escalaMax: respostaPesquisa.escalaMax,
        classe: respostaPesquisa.classe,
        comentario: respostaPesquisa.comentario,
        respondidaEm: respostaPesquisa.respondidaEm,
      })
      .from(respostaPesquisa)
      .innerJoin(conversation, eq(conversation.id, respostaPesquisa.conversaId))
      .innerJoin(pesquisa, eq(pesquisa.id, respostaPesquisa.pesquisaId))
      .where(closedInPeriod);

    type Acumulador = {
      type: string;
      escalaMin: number;
      escalaMax: number;
      enviadas: number;
      responses: number;
      /** One pair per survey; group mean is sum divided by sum, never mean of means. */
      pares: Map<string, { soma: number; count: number }>;
      classes: Map<string, number>;
    };

    const groups = new Map<string, Acumulador>();
    for (const l of linhas) {
      const key = `${l.tipo}|${l.escalaMin}|${l.escalaMax}`;
      const g =
        groups.get(key) ??
        ({
          type: l.tipo,
          escalaMin: l.escalaMin,
          escalaMax: l.escalaMax,
          enviadas: 0,
          responses: 0,
          pares: new Map(),
          classes: new Map(),
        } satisfies Acumulador);
      g.enviadas += 1;
      if (l.nota !== null) {
        g.responses += 1;
        const par = g.pares.get(l.pesquisaId) ?? { soma: 0, count: 0 };
        par.soma += l.nota;
        par.count += 1;
        g.pares.set(l.pesquisaId, par);
        const classe = l.classe ?? 'sem classe';
        g.classes.set(classe, (g.classes.get(classe) ?? 0) + 1);
      }
      groups.set(key, g);
    }

    const comentarios: ComentarioRecente[] = linhas
      .filter((l) => l.comentario !== null && l.comentario.trim() !== '')
      .sort((a, b) => (b.respondidaEm?.getTime() ?? 0) - (a.respondidaEm?.getTime() ?? 0))
      .slice(0, LIMITE_COMENTARIOS)
      .map((l) => ({
        id: l.id,
        type: l.tipo,
        note: l.nota,
        escalaMin: l.escalaMin,
        escalaMax: l.escalaMax,
        classe: l.classe,
        texto: l.comentario as string,
        em: l.respondidaEm,
      }));

    return {
      encerradas,
      comentarios,
      groups: [...groups.values()]
        .map((g) => ({
          type: g.type,
          escalaMin: g.escalaMin,
          escalaMax: g.escalaMax,
          media: mediaPonderadaDePares([...g.pares.values()]),
          responses: g.responses,
          enviadas: g.enviadas,
          taxa: taxaDeResposta(g.responses, encerradas),
          classes: [...g.classes.entries()]
            .map(([nome, quantity]) => ({
              name: nome,
              quantity,
              fraction: g.responses > 0 ? quantity / g.responses : 0,
            }))
            .sort(ordenarClasses),
        }))
        // Order CSAT before NPS and smaller scales before larger ones for a
        // stable report every time.
        .sort((a, b) => compararIdentificador(a.type, b.type) || a.escalaMax - b.escalaMax),
    };
  });
}
