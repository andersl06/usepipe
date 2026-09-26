import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Expressao } from '@pipe/core';
import { faixaScore, queue, regraScore, scoreLead } from '@pipe/db/schema';
import { consultar } from './database';

/**
 * Score rules, read-only.
 *
 * Editing is for the next phase; reading can't be missing, because it's what
 * turns the number into a rule someone wrote — not an inherited mystery.
 */

export interface LinhaRegra {
  id: string;
  nome: string;
  versao: number;
  pontos: number;
  active: boolean;
  condition: Expressao;
  /** How many leads this rule affected, counting each one's most recent calculation. */
  leadsAfetados: number;
}

export interface LinhaFaixa {
  nome: string;
  versao: number;
  minimo: number;
  maximo: number;
  queue: string | null;
  estrategiaProprietario: string;
  leads: number;
}

export async function listarRegras(): Promise<LinhaRegra[]> {
  return consultar(async (tx) => {
    const regras = await tx
      .select({
        id: regraScore.id,
        nome: regraScore.name,
        versao: regraScore.version,
        pontos: regraScore.pontos,
        active: regraScore.active,
        condition: regraScore.condition,
      })
      .from(regraScore)
      .orderBy(desc(regraScore.version), desc(regraScore.pontos), asc(regraScore.name));

    /**
     * "How many leads this rule affected" only makes sense over each lead's current
     * calculation: summing every `score_lead` would count a lead recalculated three
     * times three times over. Hence `distinct on (lead_id)` before opening the
     * explanation.
     */
    const count = await tx.execute<{ regra: string; n: number }>(sql`
      with vigente as (
        select distinct on (${scoreLead.leadId}) ${scoreLead.leadId}, ${scoreLead.explanation}
          from ${scoreLead}
         order by ${scoreLead.leadId}, ${scoreLead.calculadoEm} desc
      )
      select item->>'regra' as regra, count(*)::int as n
        from vigente, jsonb_array_elements(vigente.explicacao) as item
       group by 1
    `);

    const afetados = new Map<string, number>();
    for (const linha of count.rows) {
      if (linha.regra) afetados.set(linha.regra, Number(linha.n));
    }

    return regras.map((r) => ({
      ...r,
      condition: r.condition as Expressao,
      leadsAfetados: afetados.get(r.id) ?? 0,
    }));
  });
}

export async function listarFaixas(): Promise<LinhaFaixa[]> {
  return consultar(async (tx) => {
    const faixas = await tx
      .select({
        nome: faixaScore.name,
        versao: faixaScore.version,
        minimo: faixaScore.minimo,
        maximo: faixaScore.maximo,
        queue: queue.nome,
        estrategiaProprietario: faixaScore.estrategiaProprietario,
      })
      .from(faixaScore)
      .leftJoin(queue, eq(queue.id, faixaScore.queueId))
      .orderBy(desc(faixaScore.version), desc(faixaScore.minimo));

    const byTier = await tx
      .select({ faixa: scoreLead.faixa, n: sql<number>`count(distinct ${scoreLead.leadId})::int` })
      .from(scoreLead)
      .groupBy(scoreLead.faixa);

    const count = new Map<string, number>();
    for (const l of byTier) if (l.faixa) count.set(l.faixa, l.n);

    return faixas.map((f) => ({ ...f, leads: count.get(f.nome) ?? 0 }));
  });
}

const ROTULO_OPERADOR: Record<string, string> = {
  igual: 'é',
  diferente: 'não é',
  contem: 'contém',
  nao_contem: 'não contém',
  maior: '>',
  maior_igual: '≥',
  menor: '<',
  menor_igual: '≤',
  em: 'está em',
  nao_em: 'não está em',
  existe: 'está preenchido',
  nao_existe: 'está vazio',
};

/** The condition in Portuguese, so the manager can read the rule without opening the JSON. */
export function conditionInText(expressao: Expressao): string {
  if ('combinador' in expressao) {
    const junction = expressao.combinador === 'e' ? ' e ' : ' ou ';
    const partes = expressao.condicoes.map(conditionInText);
    return partes.length > 1 ? `(${partes.join(junction)})` : (partes[0] ?? '—');
  }
  const operador = ROTULO_OPERADOR[expressao.operador] ?? expressao.operador;
  if (expressao.operador === 'existe' || expressao.operador === 'nao_existe') {
    return `${expressao.campo} ${operador}`;
  }
  const value = Array.isArray(expressao.valor)
    ? expressao.valor.join(', ')
    : String(expressao.valor);
  return `${expressao.campo} ${operador} ${value}`;
}
