import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  classificationConversation,
  account,
  contact,
  conversation,
  queue,
  lead,
  user,
} from '@pipe/db/schema';
import { consultar, paraData } from './database';

/**
 * Contacts.
 *
 * A contact is the person; a lead is their intent to buy. They're different
 * things and Pipe keeps them separate — the same contact can become a lead
 * twice, and their conversation stays a single one.
 *
 * That's why the contact record shows **the conversations** and **the lead**:
 * it's what the leads list can't show, because there each row is an intent and
 * here each row is a person.
 *
 * Everything sequential inside `consultar` (README).
 */

export const LIMITE_LISTA = 200;

export interface ContactRow {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  accountId: string | null;
  accountName: string | null;
  leadId: string | null;
  faixa: string | null;
  conversations: number;
  lastConversation: Date | null;
}

export async function listContacts(search = ''): Promise<ContactRow[]> {
  return consultar(async (tx) => {
    const termo = search.trim();
    const filter = termo
      ? sql`(${contact.nome} ilike ${'%' + termo + '%'}
             or ${contact.document} ilike ${'%' + termo + '%'}
             or ${contact.telefoneE164} ilike ${'%' + termo + '%'}
             or ${contact.email} ilike ${'%' + termo + '%'})`
      : undefined;

    const linhas = await tx
      .select({
        id: contact.id,
        nome: contact.nome,
        email: contact.email,
        telefone: contact.telefoneE164,
        accountId: contact.accountId,
        accountName: account.name,
        leadId: lead.id,
        faixa: lead.faixaAtual,
      })
      .from(contact)
      .leftJoin(account, eq(account.id, contact.accountId))
      .leftJoin(lead, and(eq(lead.contactId, contact.id), isNull(lead.excluidoEm)))
      .where(and(isNull(contact.excluidoEm), filter))
      .orderBy(asc(contact.nome))
      .limit(LIMITE_LISTA);

    const ids = linhas.map((l) => l.id);
    const conversations =
      ids.length === 0
        ? []
        : await tx
            .select({
              contatoId: conversation.contatoId,
              n: sql<number>`count(*)::int`,
              ultima: sql<string | null>`max(coalesce(${conversation.lastMessageAt}, ${conversation.criadaEm}))`,
            })
            .from(conversation)
            .where(inArray(conversation.contatoId, ids))
            .groupBy(conversation.contatoId);

    const byContact = new Map(conversations.map((c) => [c.contatoId, c]));

    return linhas.map((l) => {
      const c = byContact.get(l.id);
      return {
        ...l,
        nome: l.nome ?? 'Contato sem nome',
        conversations: c?.n ?? 0,
        lastConversation: paraData(c?.ultima),
      };
    });
  });
}

/* -------------------------------------------------------------- a ficha */

export interface ContactConversation {
  id: string;
  queue: string | null;
  agent: string | null;
  state: string;
  standby: boolean;
  categoria: string | null;
  resumo: string | null;
  criadaEm: Date | null;
  encerradaEm: Date | null;
}

export interface ContactRecord {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  document: string | null;
  accountId: string | null;
  accountName: string | null;
  criadoEm: Date | null;
  /** Campo customizado por tenant, em JSONB. A ficha o mostra na lateral. */
  atributos: Record<string, unknown>;
  leadId: string | null;
  leadStatus: string | null;
  leadFase: string | null;
  score: number | null;
  faixa: string | null;
  origem: string | null;
  proprietario: string | null;
  conversations: ContactConversation[];
}

export async function loadContact(id: string): Promise<ContactRecord | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: contact.id,
        nome: contact.nome,
        email: contact.email,
        telefone: contact.telefoneE164,
        document: contact.document,
        accountId: contact.accountId,
        accountName: account.name,
        criadoEm: contact.criadoEm,
        atributos: contact.atributos,
        leadId: lead.id,
        leadStatus: lead.status,
        leadFase: lead.fase,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        origem: lead.origin,
        proprietario: user.nome,
      })
      .from(contact)
      .leftJoin(account, eq(account.id, contact.accountId))
      .leftJoin(lead, and(eq(lead.contactId, contact.id), isNull(lead.excluidoEm)))
      .leftJoin(user, eq(user.id, lead.proprietarioId))
      .where(and(eq(contact.id, id), isNull(contact.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    const conversations = await tx
      .select({
        id: conversation.id,
        queue: queue.nome,
        agent: user.nome,
        state: conversation.state,
        emEsperaDesde: conversation.emEsperaDesde,
        categoria: classificationConversation.categoria,
        resumo: classificationConversation.resumo,
        criadaEm: conversation.criadaEm,
        encerradaEm: conversation.encerradaEm,
      })
      .from(conversation)
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, conversation.agentId))
      .leftJoin(classificationConversation, eq(classificationConversation.conversaId, conversation.id))
      .where(eq(conversation.contatoId, id))
      .orderBy(desc(conversation.criadaEm))
      .limit(40);

    return {
      ...cabeca,
      nome: cabeca.nome ?? 'Contato sem nome',
      criadoEm: paraData(cabeca.criadoEm),
      atributos: (cabeca.atributos ?? {}) as Record<string, unknown>,
      conversations: conversations.map(({ emEsperaDesde, ...c }) => ({
        standby: c.state === 'Open' && emEsperaDesde !== null,
        ...c,
        criadaEm: paraData(c.criadaEm),
        encerradaEm: paraData(c.encerradaEm),
      })),
    };
  });
}
