import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Expressao } from '@pipe/core';
import { faixaScore, fila, regraScore, scoreLead } from '@pipe/db/schema';
import { consultar } from './banco';

/**
 * Regras de score, em leitura.
 *
 * A edição fica para a fase seguinte; a leitura não pode faltar, porque é ela que
 * transforma o número numa regra que alguém escreveu — e não num mistério herdado.
 */

export interface LinhaRegra {
  id: string;
  nome: string;
  versao: number;
  pontos: number;
  ativa: boolean;
  condicao: Expressao;
  /** Quantos leads esta regra afetou, contando o cálculo mais recente de cada um. */
  leadsAfetados: number;
}

export interface LinhaFaixa {
  nome: string;
  versao: number;
  minimo: number;
  maximo: number;
  fila: string | null;
  estrategiaProprietario: string;
  leads: number;
}

export async function listarRegras(): Promise<LinhaRegra[]> {
  return consultar(async (tx) => {
    const regras = await tx
      .select({
        id: regraScore.id,
        nome: regraScore.nome,
        versao: regraScore.versao,
        pontos: regraScore.pontos,
        ativa: regraScore.ativa,
        condicao: regraScore.condicao,
      })
      .from(regraScore)
      .orderBy(desc(regraScore.versao), desc(regraScore.pontos), asc(regraScore.nome));

    /**
     * "Quantos leads esta regra afetou" só faz sentido sobre o cálculo vigente de
     * cada lead: somar todos os `score_lead` contaria três vezes o lead recalculado
     * três vezes. Daí o `distinct on (lead_id)` antes de abrir a explicação.
     */
    const contagem = await tx.execute<{ regra: string; n: number }>(sql`
      with vigente as (
        select distinct on (${scoreLead.leadId}) ${scoreLead.leadId}, ${scoreLead.explicacao}
          from ${scoreLead}
         order by ${scoreLead.leadId}, ${scoreLead.calculadoEm} desc
      )
      select item->>'regra' as regra, count(*)::int as n
        from vigente, jsonb_array_elements(vigente.explicacao) as item
       group by 1
    `);

    const afetados = new Map<string, number>();
    for (const linha of contagem.rows) {
      if (linha.regra) afetados.set(linha.regra, Number(linha.n));
    }

    return regras.map((r) => ({
      ...r,
      condicao: r.condicao as Expressao,
      leadsAfetados: afetados.get(r.id) ?? 0,
    }));
  });
}

export async function listarFaixas(): Promise<LinhaFaixa[]> {
  return consultar(async (tx) => {
    const faixas = await tx
      .select({
        nome: faixaScore.nome,
        versao: faixaScore.versao,
        minimo: faixaScore.minimo,
        maximo: faixaScore.maximo,
        fila: fila.nome,
        estrategiaProprietario: faixaScore.estrategiaProprietario,
      })
      .from(faixaScore)
      .leftJoin(fila, eq(fila.id, faixaScore.filaId))
      .orderBy(desc(faixaScore.versao), desc(faixaScore.minimo));

    const porFaixa = await tx
      .select({ faixa: scoreLead.faixa, n: sql<number>`count(distinct ${scoreLead.leadId})::int` })
      .from(scoreLead)
      .groupBy(scoreLead.faixa);

    const contagem = new Map<string, number>();
    for (const l of porFaixa) if (l.faixa) contagem.set(l.faixa, l.n);

    return faixas.map((f) => ({ ...f, leads: contagem.get(f.nome) ?? 0 }));
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

/** A condição em português, para o gestor ler a regra sem abrir o JSON. */
export function condicaoEmTexto(expressao: Expressao): string {
  if ('combinador' in expressao) {
    const juncao = expressao.combinador === 'e' ? ' e ' : ' ou ';
    const partes = expressao.condicoes.map(condicaoEmTexto);
    return partes.length > 1 ? `(${partes.join(juncao)})` : (partes[0] ?? '—');
  }
  const operador = ROTULO_OPERADOR[expressao.operador] ?? expressao.operador;
  if (expressao.operador === 'existe' || expressao.operador === 'nao_existe') {
    return `${expressao.campo} ${operador}`;
  }
  const valor = Array.isArray(expressao.valor)
    ? expressao.valor.join(', ')
    : String(expressao.valor);
  return `${expressao.campo} ${operador} ${valor}`;
}
