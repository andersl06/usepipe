import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { account, lead, opportunity, user } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './database';
import { timeCarregarLinha, type TimeItemLinha } from './leads';

/**
 * Funil de oportunidades.
 *
 * As fases são catálogo do produto e não coluna do banco (`oportunidade.fase` é
 * texto): trocar a ordem ou o nome de uma fase é configuração de tenant, não
 * migration. Enquanto a tela de configuração não existe, o catálogo vive aqui.
 */
export const FASES = ['Novo', 'Qualificado', 'Reunião', 'Proposta', 'Fechamento'] as const;
export type Fase = (typeof FASES)[number];

export function faseValida(value: string): value is Fase {
  return (FASES as readonly string[]).includes(value);
}

export interface CardOpportunity {
  id: string;
  nome: string;
  value: number | null;
  probability: number | null;
  proprietario: string | null;
  accountName: string | null;
  leadId: string | null;
  score: number | null;
  closingPrevisto: Date | null;
}

export interface ColumnFunil {
  fase: string;
  cards: CardOpportunity[];
  total: number;
  quantity: number;
}

export interface Funil {
  colunas: ColumnFunil[];
  totalGeral: number;
  quantityGeneral: number;
  ponderadoGeral: number;
}

export async function carregarFunil(): Promise<Funil> {
  const linhas = await consultar(async (tx) =>
    tx
      .select({
        id: opportunity.id,
        nome: opportunity.nome,
        valor: opportunity.valor,
        probabilidade: opportunity.probabilidade,
        fase: opportunity.fase,
        fechamentoPrevisto: opportunity.fechamentoPrevisto,
        proprietario: user.nome,
        contaNome: account.nome,
        leadId: opportunity.leadId,
        score: lead.scoreAtual,
      })
      .from(opportunity)
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .leftJoin(account, eq(account.id, opportunity.contaId))
      .leftJoin(lead, eq(lead.id, opportunity.leadId))
      .where(isNull(opportunity.fechadaEm))
      .orderBy(asc(opportunity.nome)),
  );

  const colunas: ColumnFunil[] = FASES.map((fase) => ({
    fase,
    cards: [],
    total: 0,
    quantity: 0,
  }));
  let ponderadoGeral = 0;

  for (const l of linhas) {
    const column = colunas.find((c) => c.fase === l.fase);
    if (!column) continue; // Fase fora do catálogo: some do quadro em vez de criar coluna órfã.
    const value = paraNumero(l.valor);
    column.cards.push({
      id: l.id,
      nome: l.nome,
      value,
      probability: l.probabilidade,
      proprietario: l.proprietario,
      accountName: l.contaNome,
      leadId: l.leadId,
      score: l.score,
      closingPrevisto: paraData(l.fechamentoPrevisto),
    });
    column.total += value ?? 0;
    column.quantity += 1;
    ponderadoGeral += ((value ?? 0) * (l.probabilidade ?? 0)) / 100;
  }

  return {
    colunas,
    totalGeral: colunas.reduce((s, c) => s + c.total, 0),
    quantityGeneral: colunas.reduce((s, c) => s + c.quantity, 0),
    ponderadoGeral,
  };
}

/**
 * Arrastar entre fases. A probabilidade acompanha a fase porque é dela que sai o
 * valor ponderado do painel — deixar a probabilidade parada faria o painel discordar
 * do quadro que o vendedor acabou de mexer.
 */
const PROBABILITY_BY_FASE: Record<Fase, number> = {
  Novo: 10,
  Qualificado: 25,
  Reunião: 45,
  Proposta: 65,
  Fechamento: 85,
};

/* ======================================================= listagem e ficha
 *
 * O quadro responde "como está o funil"; a listagem responde "quais são", que é
 * outra pergunta e precisava de outra tela. É a mesma divisão do Twenty entre
 * visão kanban e visão tabela do mesmo objeto — os dados são os mesmos, e o que
 * muda é a forma. Por isso as duas moram no mesmo endereço, com `?vista=`: uma
 * visão de tela não merece uma rota.
 *
 * A diferença que importa: o quadro só mostra oportunidade ABERTA, porque
 * arrastar uma fechada não faz sentido. A listagem mostra as fechadas também —
 * é ela que responde "o que ganhamos este mês".
 */

export const SITUATIONS = [
  { chave: 'abertas', rotulo: 'Abertas' },
  { chave: 'ganhas', rotulo: 'Ganhas' },
  { chave: 'perdidas', rotulo: 'Perdidas' },
  { chave: 'todas', rotulo: 'Todas' },
] as const;

export type Situation = (typeof SITUATIONS)[number]['chave'];

export function situationValid(value: string | undefined): Situation {
  return (SITUATIONS.find((s) => s.chave === value)?.chave ?? 'abertas') as Situation;
}

/** A listagem é tela de trabalho, não de exportação. Mesmo teto das outras. */
export const LIMITE_LISTA = 200;

export interface LinhaOpportunity {
  id: string;
  nome: string;
  accountId: string | null;
  accountName: string | null;
  leadId: string | null;
  fase: string;
  value: number | null;
  probability: number | null;
  proprietario: string | null;
  closingPrevisto: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

function situationRecorte(situation: Situation) {
  if (situation === 'abertas') return isNull(opportunity.fechadaEm);
  if (situation === 'ganhas') return and(isNotNull(opportunity.fechadaEm), eq(opportunity.ganha, true));
  if (situation === 'perdidas')
    return and(isNotNull(opportunity.fechadaEm), eq(opportunity.ganha, false));
  return undefined;
}

export async function listOpportunities(
  situation: Situation = 'abertas',
  search = '',
): Promise<LinhaOpportunity[]> {
  return consultar(async (tx) => {
    const termo = search.trim();
    const filter = termo
      ? sql`(${opportunity.nome} ilike ${'%' + termo + '%'}
             or ${account.nome} ilike ${'%' + termo + '%'})`
      : undefined;

    const linhas = await tx
      .select({
        id: opportunity.id,
        nome: opportunity.nome,
        accountId: opportunity.contaId,
        accountName: account.nome,
        leadId: opportunity.leadId,
        fase: opportunity.fase,
        value: opportunity.valor,
        probability: opportunity.probabilidade,
        proprietario: user.nome,
        closingPrevisto: opportunity.fechamentoPrevisto,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
      })
      .from(opportunity)
      .leftJoin(account, eq(account.id, opportunity.contaId))
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .where(situationRecorte(situation) ? and(situationRecorte(situation), filter) : filter)
      // Aberta primeiro, e dentro disso a de maior valor: é o que ainda dá para
      // mexer, na ordem em que se mexe.
      .orderBy(asc(opportunity.fechadaEm), desc(opportunity.valor))
      .limit(LIMITE_LISTA);

    return linhas.map((o) => ({
      ...o,
      value: paraNumero(o.value),
      closingPrevisto: paraData(o.closingPrevisto),
      fechadaEm: paraData(o.fechadaEm),
    }));
  });
}

export interface FichaOpportunity extends LinhaOpportunity {
  moeda: string;
  motivoPerda: string | null;
  criadoEm: Date | null;
  /** O score do lead que originou a negociação, quando ele existe. */
  score: number | null;
  faixa: string | null;
  /** As outras da mesma conta: o contexto comercial de quem já está negociando. */
  irmas: LinhaOpportunity[];
  /** O histórico do lead, que é o histórico da negociação. */
  timeLinha: TimeItemLinha[];
}

export async function loadOpportunity(id: string): Promise<FichaOpportunity | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: opportunity.id,
        nome: opportunity.nome,
        accountId: opportunity.contaId,
        accountName: account.nome,
        leadId: opportunity.leadId,
        contatoId: lead.contatoId,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        fase: opportunity.fase,
        value: opportunity.valor,
        moeda: opportunity.moeda,
        probability: opportunity.probabilidade,
        proprietario: user.nome,
        closingPrevisto: opportunity.fechamentoPrevisto,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
        motivoPerda: opportunity.motivoPerda,
        criadoEm: opportunity.criadoEm,
      })
      .from(opportunity)
      .leftJoin(account, eq(account.id, opportunity.contaId))
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .leftJoin(lead, and(eq(lead.id, opportunity.leadId), isNull(lead.excluidoEm)))
      .where(eq(opportunity.id, id))
      .limit(1);

    if (!cabeca) return null;

    // Em série, nunca em paralelo: `Promise.all` aqui dentro derruba o
    // `pipe.tenant_id` da transação (README).
    const irmas = cabeca.accountId
      ? await tx
          .select({
            id: opportunity.id,
            nome: opportunity.nome,
            accountId: opportunity.contaId,
            accountName: account.nome,
            leadId: opportunity.leadId,
            fase: opportunity.fase,
            value: opportunity.valor,
            probability: opportunity.probabilidade,
            proprietario: user.nome,
            closingPrevisto: opportunity.fechamentoPrevisto,
            fechadaEm: opportunity.fechadaEm,
            ganha: opportunity.ganha,
          })
          .from(opportunity)
          .leftJoin(account, eq(account.id, opportunity.contaId))
          .leftJoin(user, eq(user.id, opportunity.proprietarioId))
          .where(and(eq(opportunity.contaId, cabeca.accountId), sql`${opportunity.id} <> ${id}`))
          .orderBy(asc(opportunity.fechadaEm), desc(opportunity.valor))
      : [];

    const timeLinha = cabeca.leadId
      ? await timeCarregarLinha(tx, cabeca.leadId, cabeca.contatoId)
      : [];

    return {
      ...cabeca,
      value: paraNumero(cabeca.value),
      closingPrevisto: paraData(cabeca.closingPrevisto),
      fechadaEm: paraData(cabeca.fechadaEm),
      criadoEm: paraData(cabeca.criadoEm),
      irmas: irmas.map((o) => ({
        ...o,
        value: paraNumero(o.value),
        closingPrevisto: paraData(o.closingPrevisto),
        fechadaEm: paraData(o.fechadaEm),
      })),
      timeLinha,
    };
  });
}

export async function moverParaFase(opportunityId: string, fase: Fase): Promise<void> {
  await consultar(async (tx) => {
    await tx
      .update(opportunity)
      .set({
        fase,
        probabilidade: PROBABILITY_BY_FASE[fase],
        atualizadoEm: sql`now()`,
      })
      .where(and(eq(opportunity.id, opportunityId), isNull(opportunity.fechadaEm)));
  });
}
