import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { account, lead, opportunity, user } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './database';
import { timeLoadRow, type TimeItemRow } from './leads';

/**
 * Opportunity funnel.
 *
 * Stages are the product's catalog, not a database column (`oportunidade.fase`
 * is text): reordering or renaming a stage is tenant configuration, not a
 * migration. While the settings screen doesn't exist yet, the catalog lives
 * here.
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
  closingExpected: Date | null;
}

export interface ColumnFunnel {
  fase: string;
  cards: CardOpportunity[];
  total: number;
  quantity: number;
}

export interface Funil {
  colunas: ColumnFunnel[];
  totalGeral: number;
  quantityGeneral: number;
  ponderadoGeral: number;
}

export async function carregarFunil(): Promise<Funil> {
  const linhas = await consultar(async (tx) =>
    tx
      .select({
        id: opportunity.id,
        nome: opportunity.name,
        valor: opportunity.value,
        probabilidade: opportunity.probability,
        fase: opportunity.fase,
        fechamentoPrevisto: opportunity.closingExpected,
        proprietario: user.nome,
        contaNome: account.name,
        leadId: opportunity.leadId,
        score: lead.scoreAtual,
      })
      .from(opportunity)
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .leftJoin(account, eq(account.id, opportunity.accountId))
      .leftJoin(lead, eq(lead.id, opportunity.leadId))
      .where(isNull(opportunity.fechadaEm))
      .orderBy(asc(opportunity.name)),
  );

  const colunas: ColumnFunnel[] = FASES.map((fase) => ({
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
      closingExpected: paraData(l.fechamentoPrevisto),
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
 * Dragging between stages. Probability follows the stage because that's what
 * the dashboard's weighted value comes from — leaving probability unchanged
 * would make the dashboard disagree with the board the salesperson just moved.
 */
const PROBABILITY_BY_STAGE: Record<Fase, number> = {
  Novo: 10,
  Qualificado: 25,
  Reunião: 45,
  Proposta: 65,
  Fechamento: 85,
};

/*
 * ======================================================= listing and record
 *
 * The board answers "how is the funnel doing"; the listing answers "which ones
 * are there", which is a different question and needed a different screen.
 * It's the same split Twenty makes between a kanban view and a table view of
 * the same object — the data is the same, what changes is the shape. That's
 * why the two live at the same address, with `?vista=`: a screen view doesn't
 * deserve its own route.
 *
 * The difference that matters: the board only shows OPEN opportunities,
 * because dragging a closed one makes no sense. The listing shows the closed
 * ones too — it's the one that answers "what did we win this month".
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

/** The listing is a work screen, not an export screen. Same cap as the others. */
export const LIMITE_LISTA = 200;

export interface OpportunityRow {
  id: string;
  nome: string;
  accountId: string | null;
  accountName: string | null;
  leadId: string | null;
  fase: string;
  value: number | null;
  probability: number | null;
  proprietario: string | null;
  closingExpected: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

function situationSlice(situation: Situation) {
  if (situation === 'abertas') return isNull(opportunity.fechadaEm);
  if (situation === 'ganhas') return and(isNotNull(opportunity.fechadaEm), eq(opportunity.ganha, true));
  if (situation === 'perdidas')
    return and(isNotNull(opportunity.fechadaEm), eq(opportunity.ganha, false));
  return undefined;
}

export async function listOpportunities(
  situation: Situation = 'abertas',
  search = '',
): Promise<OpportunityRow[]> {
  return consultar(async (tx) => {
    const termo = search.trim();
    const filter = termo
      ? sql`(${opportunity.name} ilike ${'%' + termo + '%'}
             or ${account.name} ilike ${'%' + termo + '%'})`
      : undefined;

    const linhas = await tx
      .select({
        id: opportunity.id,
        nome: opportunity.name,
        accountId: opportunity.accountId,
        accountName: account.name,
        leadId: opportunity.leadId,
        fase: opportunity.fase,
        value: opportunity.value,
        probability: opportunity.probability,
        proprietario: user.nome,
        closingExpected: opportunity.closingExpected,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
      })
      .from(opportunity)
      .leftJoin(account, eq(account.id, opportunity.accountId))
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .where(situationSlice(situation) ? and(situationSlice(situation), filter) : filter)
      // Open first, and within that the highest value: it's what can still
      // mexer, na ordem em que se mexe.
      .orderBy(asc(opportunity.fechadaEm), desc(opportunity.value))
      .limit(LIMITE_LISTA);

    return linhas.map((o) => ({
      ...o,
      value: paraNumero(o.value),
      closingExpected: paraData(o.closingExpected),
      fechadaEm: paraData(o.fechadaEm),
    }));
  });
}

export interface OpportunityRecord extends OpportunityRow {
  moeda: string;
  motivoPerda: string | null;
  criadoEm: Date | null;
  /** The score of the lead that originated the deal, when one exists. */
  score: number | null;
  faixa: string | null;
  /** The account's other deals: the commercial context for whoever is already negotiating. */
  irmas: OpportunityRow[];
  /** The lead's history, which is the deal's history. */
  timeRow: TimeItemRow[];
}

export async function loadOpportunity(id: string): Promise<OpportunityRecord | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: opportunity.id,
        nome: opportunity.name,
        accountId: opportunity.accountId,
        accountName: account.name,
        leadId: opportunity.leadId,
        contatoId: lead.contactId,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        fase: opportunity.fase,
        value: opportunity.value,
        moeda: opportunity.moeda,
        probability: opportunity.probability,
        proprietario: user.nome,
        closingExpected: opportunity.closingExpected,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
        motivoPerda: opportunity.motivoPerda,
        criadoEm: opportunity.criadoEm,
      })
      .from(opportunity)
      .leftJoin(account, eq(account.id, opportunity.accountId))
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .leftJoin(lead, and(eq(lead.id, opportunity.leadId), isNull(lead.excluidoEm)))
      .where(eq(opportunity.id, id))
      .limit(1);

    if (!cabeca) return null;

    // Sequentially, never in parallel: `Promise.all` in here drops the
    // transaction's `pipe.tenant_id` (README).
    const irmas = cabeca.accountId
      ? await tx
          .select({
            id: opportunity.id,
            nome: opportunity.name,
            accountId: opportunity.accountId,
            accountName: account.name,
            leadId: opportunity.leadId,
            fase: opportunity.fase,
            value: opportunity.value,
            probability: opportunity.probability,
            proprietario: user.nome,
            closingExpected: opportunity.closingExpected,
            fechadaEm: opportunity.fechadaEm,
            ganha: opportunity.ganha,
          })
          .from(opportunity)
          .leftJoin(account, eq(account.id, opportunity.accountId))
          .leftJoin(user, eq(user.id, opportunity.proprietarioId))
          .where(and(eq(opportunity.accountId, cabeca.accountId), sql`${opportunity.id} <> ${id}`))
          .orderBy(asc(opportunity.fechadaEm), desc(opportunity.value))
      : [];

    const timeRow = cabeca.leadId
      ? await timeLoadRow(tx, cabeca.leadId, cabeca.contatoId)
      : [];

    return {
      ...cabeca,
      value: paraNumero(cabeca.value),
      closingExpected: paraData(cabeca.closingExpected),
      fechadaEm: paraData(cabeca.fechadaEm),
      criadoEm: paraData(cabeca.criadoEm),
      irmas: irmas.map((o) => ({
        ...o,
        value: paraNumero(o.value),
        closingExpected: paraData(o.closingExpected),
        fechadaEm: paraData(o.fechadaEm),
      })),
      timeRow,
    };
  });
}

export async function moverParaFase(opportunityId: string, fase: Fase): Promise<void> {
  await consultar(async (tx) => {
    await tx
      .update(opportunity)
      .set({
        fase,
        probability: PROBABILITY_BY_STAGE[fase],
        atualizadoEm: sql`now()`,
      })
      .where(and(eq(opportunity.id, opportunityId), isNull(opportunity.fechadaEm)));
  });
}
