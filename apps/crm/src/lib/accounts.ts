import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { account, contact, lead, opportunity, user } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './database';

/**
 * Accounts.
 *
 * The account was out of the menu because it had no screen, and it had no
 * screen because nobody had decided what it shows. It shows two things, and
 * that's what a company asks when you open one: **who do I know inside it**
 * and **how much money is at stake**. Contacts and opportunities, in that
 * order.
 *
 * Everything sequential inside `consultar` — `Promise.all` inside the
 * transaction drops `pipe.tenant_id` and the query ends up running with no
 * tenant (README).
 */

/** The listing is a work screen, not an export screen. Same cap as the leads one. */
export const LIMITE_LISTA = 200;

export interface AccountRow {
  id: string;
  nome: string;
  document: string | null;
  domain: string | null;
  proprietario: string | null;
  contacts: number;
  leads: number;
  opportunities: number;
  valueOpen: number;
}

export async function listAccounts(search = ''): Promise<AccountRow[]> {
  return consultar(async (tx) => {
    const termo = search.trim();
    const filter = termo
      ? sql`(${account.nome} ilike ${'%' + termo + '%'}
             or ${account.documento} ilike ${'%' + termo + '%'}
             or ${account.dominio} ilike ${'%' + termo + '%'})`
      : undefined;

    const accounts = await tx
      .select({
        id: account.id,
        nome: account.nome,
        document: account.documento,
        domain: account.dominio,
        proprietario: user.nome,
      })
      .from(account)
      .leftJoin(user, eq(user.id, account.proprietarioId))
      .where(and(isNull(account.excluidoEm), filter))
      .orderBy(asc(account.nome))
      .limit(LIMITE_LISTA);

    // Three separate aggregations instead of a per-row subquery: the database reads
    // each table once, and the join happens here, over fourteen accounts.
    const byContact = await tx
      .select({ contaId: contact.accountId, n: sql<number>`count(*)::int` })
      .from(contact)
      .where(isNull(contact.excluidoEm))
      .groupBy(contact.accountId);

    const byLead = await tx
      .select({ contaId: lead.contaId, n: sql<number>`count(*)::int` })
      .from(lead)
      .where(isNull(lead.excluidoEm))
      .groupBy(lead.contaId);

    const byOpportunity = await tx
      .select({
        contaId: opportunity.contaId,
        n: sql<number>`count(*)::int`,
        valor: sql<string>`coalesce(sum(${opportunity.valor}), 0)`,
      })
      .from(opportunity)
      .where(isNull(opportunity.fechadaEm))
      .groupBy(opportunity.contaId);

    const contacts = new Map(byContact.map((l) => [l.contaId, l.n]));
    const leads = new Map(byLead.map((l) => [l.contaId, l.n]));
    const abertas = new Map(byOpportunity.map((l) => [l.contaId, l]));

    return accounts.map((c) => {
      const o = abertas.get(c.id);
      return {
        ...c,
        contacts: contacts.get(c.id) ?? 0,
        leads: leads.get(c.id) ?? 0,
        opportunities: o?.n ?? 0,
        valueOpen: paraNumero(o?.valor) ?? 0,
      };
    });
  });
}

/* -------------------------------------------------------------- a ficha */

export interface AccountContact {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  leadId: string | null;
  score: number | null;
  faixa: string | null;
}

export interface AccountOpportunity {
  id: string;
  nome: string;
  value: number | null;
  fase: string;
  probability: number | null;
  proprietario: string | null;
  closingExpected: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

export interface AccountRecord {
  id: string;
  nome: string;
  document: string | null;
  domain: string | null;
  proprietario: string | null;
  criadoEm: Date | null;
  /** Campo customizado por tenant, em JSONB. A ficha o mostra na lateral. */
  atributos: Record<string, unknown>;
  contacts: AccountContact[];
  opportunities: AccountOpportunity[];
  valueOpen: number;
  valueWon: number;
}

export async function loadAccount(id: string): Promise<AccountRecord | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: account.id,
        nome: account.nome,
        document: account.documento,
        domain: account.dominio,
        proprietario: user.nome,
        criadoEm: account.criadoEm,
        atributos: account.atributos,
      })
      .from(account)
      .leftJoin(user, eq(user.id, account.proprietarioId))
      .where(and(eq(account.id, id), isNull(account.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    /*
     * The contact brings its lead along: whoever opens the account wants to know
     * who to talk to AND how far that person has gotten. Two screens to answer
     * that would be one too many.
     */
    const contacts = await tx
      .select({
        id: contact.id,
        nome: contact.nome,
        email: contact.email,
        telefone: contact.telefoneE164,
        leadId: lead.id,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
      })
      .from(contact)
      .leftJoin(lead, and(eq(lead.contatoId, contact.id), isNull(lead.excluidoEm)))
      .where(and(eq(contact.accountId, id), isNull(contact.excluidoEm)))
      .orderBy(asc(contact.nome));

    const opportunities = await tx
      .select({
        id: opportunity.id,
        nome: opportunity.nome,
        value: opportunity.valor,
        fase: opportunity.fase,
        probability: opportunity.probabilidade,
        proprietario: user.nome,
        closingExpected: opportunity.fechamentoPrevisto,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
      })
      .from(opportunity)
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .where(eq(opportunity.contaId, id))
      // Open first: it's what can still be acted on.
      .orderBy(asc(opportunity.fechadaEm), desc(opportunity.valor));

    const linhas: AccountOpportunity[] = opportunities.map((o) => ({
      id: o.id,
      nome: o.nome,
      value: paraNumero(o.value),
      fase: o.fase,
      probability: o.probability,
      proprietario: o.proprietario,
      closingExpected: paraData(o.closingExpected),
      fechadaEm: paraData(o.fechadaEm),
      ganha: o.ganha,
    }));

    return {
      id: cabeca.id,
      nome: cabeca.nome,
      document: cabeca.document,
      domain: cabeca.domain,
      proprietario: cabeca.proprietario,
      criadoEm: paraData(cabeca.criadoEm),
      atributos: (cabeca.atributos ?? {}) as Record<string, unknown>,
      contacts: contacts.map((c) => ({ ...c, nome: c.nome ?? 'Contato sem nome' })),
      opportunities: linhas,
      valueOpen: linhas
        .filter((o) => o.fechadaEm === null)
        .reduce((s, o) => s + (o.value ?? 0), 0),
      valueWon: linhas.filter((o) => o.ganha).reduce((s, o) => s + (o.value ?? 0), 0),
    };
  });
}
