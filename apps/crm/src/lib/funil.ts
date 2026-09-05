import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { conta, lead, oportunidade, usuario } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './banco';

/**
 * Funil de oportunidades.
 *
 * As fases são catálogo do produto e não coluna do banco (`oportunidade.fase` é
 * texto): trocar a ordem ou o nome de uma fase é configuração de tenant, não
 * migration. Enquanto a tela de configuração não existe, o catálogo vive aqui.
 */
export const FASES = ['Novo', 'Qualificado', 'Reunião', 'Proposta', 'Fechamento'] as const;
export type Fase = (typeof FASES)[number];

export function faseValida(valor: string): valor is Fase {
  return (FASES as readonly string[]).includes(valor);
}

export interface CartaoOportunidade {
  id: string;
  nome: string;
  valor: number | null;
  probabilidade: number | null;
  proprietario: string | null;
  contaNome: string | null;
  leadId: string | null;
  score: number | null;
  fechamentoPrevisto: Date | null;
}

export interface ColunaFunil {
  fase: string;
  cartoes: CartaoOportunidade[];
  total: number;
  quantidade: number;
}

export interface Funil {
  colunas: ColunaFunil[];
  totalGeral: number;
  quantidadeGeral: number;
  ponderadoGeral: number;
}

export async function carregarFunil(): Promise<Funil> {
  const linhas = await consultar(async (tx) =>
    tx
      .select({
        id: oportunidade.id,
        nome: oportunidade.nome,
        valor: oportunidade.valor,
        probabilidade: oportunidade.probabilidade,
        fase: oportunidade.fase,
        fechamentoPrevisto: oportunidade.fechamentoPrevisto,
        proprietario: usuario.nome,
        contaNome: conta.nome,
        leadId: oportunidade.leadId,
        score: lead.scoreAtual,
      })
      .from(oportunidade)
      .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
      .leftJoin(conta, eq(conta.id, oportunidade.contaId))
      .leftJoin(lead, eq(lead.id, oportunidade.leadId))
      .where(isNull(oportunidade.fechadaEm))
      .orderBy(asc(oportunidade.nome)),
  );

  const colunas: ColunaFunil[] = FASES.map((fase) => ({
    fase,
    cartoes: [],
    total: 0,
    quantidade: 0,
  }));
  let ponderadoGeral = 0;

  for (const l of linhas) {
    const coluna = colunas.find((c) => c.fase === l.fase);
    if (!coluna) continue; // Fase fora do catálogo: some do quadro em vez de criar coluna órfã.
    const valor = paraNumero(l.valor);
    coluna.cartoes.push({
      id: l.id,
      nome: l.nome,
      valor,
      probabilidade: l.probabilidade,
      proprietario: l.proprietario,
      contaNome: l.contaNome,
      leadId: l.leadId,
      score: l.score,
      fechamentoPrevisto: paraData(l.fechamentoPrevisto),
    });
    coluna.total += valor ?? 0;
    coluna.quantidade += 1;
    ponderadoGeral += ((valor ?? 0) * (l.probabilidade ?? 0)) / 100;
  }

  return {
    colunas,
    totalGeral: colunas.reduce((s, c) => s + c.total, 0),
    quantidadeGeral: colunas.reduce((s, c) => s + c.quantidade, 0),
    ponderadoGeral,
  };
}

/**
 * Arrastar entre fases. A probabilidade acompanha a fase porque é dela que sai o
 * valor ponderado do painel — deixar a probabilidade parada faria o painel discordar
 * do quadro que o vendedor acabou de mexer.
 */
const PROBABILIDADE_POR_FASE: Record<Fase, number> = {
  Novo: 10,
  Qualificado: 25,
  Reunião: 45,
  Proposta: 65,
  Fechamento: 85,
};

export async function moverParaFase(oportunidadeId: string, fase: Fase): Promise<void> {
  await consultar(async (tx) => {
    await tx
      .update(oportunidade)
      .set({
        fase,
        probabilidade: PROBABILIDADE_POR_FASE[fase],
        atualizadoEm: sql`now()`,
      })
      .where(and(eq(oportunidade.id, oportunidadeId), isNull(oportunidade.fechadaEm)));
  });
}
