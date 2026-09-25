import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { account, contact, lead, opportunity, user } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './database';

/**
 * Contas.
 *
 * A conta estava fora do menu porque não tinha tela, e não tinha tela porque
 * ninguém tinha decidido o que ela mostra. Mostra duas coisas, e é o que a
 * empresa pergunta quando abre uma: **quem eu conheço lá dentro** e **quanto
 * dinheiro está em jogo**. Contatos e oportunidades, nessa ordem.
 *
 * Tudo em série dentro do `consultar` — `Promise.all` dentro da transação
 * derruba o `pipe.tenant_id` e a consulta passa a rodar sem tenant (README).
 */

/** A listagem é tela de trabalho, não de exportação. Mesmo teto da de leads. */
export const LIMITE_LISTA = 200;

export interface LinhaAccount {
  id: string;
  nome: string;
  document: string | null;
  domain: string | null;
  proprietario: string | null;
  contacts: number;
  leads: number;
  opportunities: number;
  valueAberto: number;
}

export async function listAccounts(search = ''): Promise<LinhaAccount[]> {
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
        documento: account.documento,
        dominio: account.dominio,
        proprietario: user.nome,
      })
      .from(account)
      .leftJoin(user, eq(user.id, account.proprietarioId))
      .where(and(isNull(account.excluidoEm), filter))
      .orderBy(asc(account.nome))
      .limit(LIMITE_LISTA);

    // Três agregações separadas em vez de subconsulta por linha: o banco lê
    // cada tabela uma vez, e a junção acontece aqui, sobre catorze contas.
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
        contatos: contacts.get(c.id) ?? 0,
        leads: leads.get(c.id) ?? 0,
        oportunidades: o?.n ?? 0,
        valorAberto: paraNumero(o?.valor) ?? 0,
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
  closingPrevisto: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

export interface FichaAccount {
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
  valueAberto: number;
  valueGanho: number;
}

export async function loadAccount(id: string): Promise<FichaAccount | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: account.id,
        nome: account.nome,
        documento: account.documento,
        dominio: account.dominio,
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
     * O contato traz o lead dele junto: quem abre a conta quer saber com quem
     * falar E o quanto esse alguém já avançou. Duas telas para responder isso
     * seriam uma a mais.
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
        valor: opportunity.valor,
        fase: opportunity.fase,
        probabilidade: opportunity.probabilidade,
        proprietario: user.nome,
        fechamentoPrevisto: opportunity.fechamentoPrevisto,
        fechadaEm: opportunity.fechadaEm,
        ganha: opportunity.ganha,
      })
      .from(opportunity)
      .leftJoin(user, eq(user.id, opportunity.proprietarioId))
      .where(eq(opportunity.contaId, id))
      // Aberta primeiro: é o que ainda dá para mexer.
      .orderBy(asc(opportunity.fechadaEm), desc(opportunity.valor));

    const linhas: AccountOpportunity[] = opportunities.map((o) => ({
      id: o.id,
      nome: o.nome,
      valor: paraNumero(o.valor),
      fase: o.fase,
      probabilidade: o.probabilidade,
      proprietario: o.proprietario,
      fechamentoPrevisto: paraData(o.fechamentoPrevisto),
      fechadaEm: paraData(o.fechadaEm),
      ganha: o.ganha,
    }));

    return {
      id: cabeca.id,
      nome: cabeca.nome,
      documento: cabeca.documento,
      dominio: cabeca.dominio,
      proprietario: cabeca.proprietario,
      criadoEm: paraData(cabeca.criadoEm),
      atributos: (cabeca.atributos ?? {}) as Record<string, unknown>,
      contatos: contacts.map((c) => ({ ...c, nome: c.nome ?? 'Contato sem nome' })),
      oportunidades: linhas,
      valorAberto: linhas
        .filter((o) => o.fechadaEm === null)
        .reduce((s, o) => s + (o.value ?? 0), 0),
      valorGanho: linhas.filter((o) => o.ganha).reduce((s, o) => s + (o.value ?? 0), 0),
    };
  });
}
