import { ilike, or, sql } from 'drizzle-orm';
import { account, contact, lead, opportunity } from '@pipe/db/schema';
import { consultar } from './database';
import type { Resultado } from './search-tipos';

export * from './search-tipos';

/**
 * Global search, the one that feeds the command menu.
 *
 * Twenty solves navigation through search, not menus: you press Ctrl+K, type
 * the name, and land on the record. It's the difference between a filtered
 * list and a product operated by keyboard — and it's why their sidebar can be
 * short.
 *
 * **One query per object, sequential.** Not `Promise.all`: inside `consultar`
 * the transaction is a single connection, and parallelizing drops the
 * session's `pipe.tenant_id` (README). The cost is irrelevant — it's four
 * queries with `limit 5` and an index.
 *
 * The cap of 5 per object is Twenty's (`MaxSearchResults`), and it exists for
 * the same reason: whoever searches wants to arrive, not browse. Twenty
 * results in a command list is a second list to scroll through.
 */

export const BY_OBJETO = 5;

export async function buscar(termo: string): Promise<Resultado[]> {
  const limpo = termo.trim();
  // A single letter matches half the database and doesn't help anyone get anywhere.
  if (limpo.length < 2) return [];

  const padrao = `%${limpo}%`;

  return consultar(async (tx) => {
    const leads = await tx
      .select({
        id: lead.id,
        nome: contact.nome,
        email: contact.email,
        fase: lead.fase,
      })
      .from(lead)
      .innerJoin(contact, sql`${contact.id} = ${lead.contatoId}`)
      .where(
        and0(
          sql`${lead.excluidoEm} is null`,
          or(ilike(contact.nome, padrao), ilike(contact.email, padrao)),
        ),
      )
      .limit(BY_OBJETO);

    const opportunities = await tx
      .select({ id: opportunity.id, nome: opportunity.nome, fase: opportunity.fase })
      .from(opportunity)
      .where(ilike(opportunity.nome, padrao))
      .limit(BY_OBJETO);

    const accounts = await tx
      .select({ id: account.id, nome: account.nome, dominio: account.dominio })
      .from(account)
      .where(or(ilike(account.nome, padrao), ilike(account.dominio, padrao)))
      .limit(BY_OBJETO);

    const contacts = await tx
      .select({ id: contact.id, nome: contact.nome, email: contact.email })
      .from(contact)
      .where(or(ilike(contact.nome, padrao), ilike(contact.email, padrao)))
      .limit(BY_OBJETO);

    return [
      ...leads.map((l) => ({
        tipo: 'lead' as const,
        id: l.id,
        titulo: l.nome ?? 'Sem nome',
        detalhe: l.email ?? l.fase,
        href: `/leads/${l.id}`,
      })),
      ...opportunities.map((o) => ({
        tipo: 'oportunidade' as const,
        id: o.id,
        titulo: o.nome,
        detalhe: o.fase,
        href: `/opportunities`,
      })),
      ...accounts.map((c) => ({
        tipo: 'conta' as const,
        id: c.id,
        titulo: c.nome,
        detalhe: c.dominio,
        href: `/accounts/${c.id}`,
      })),
      ...contacts.map((c) => ({
        tipo: 'contato' as const,
        id: c.id,
        titulo: c.nome ?? 'Sem nome',
        detalhe: c.email,
        href: `/contacts/${c.id}`,
      })),
    ];
  });
}

/** `and` that accepts undefined without complaining, for an optional condition. */
function and0(...partes: (ReturnType<typeof sql> | undefined)[]) {
  const vivas = partes.filter(Boolean);
  return vivas.length === 1 ? vivas[0] : sql`${sql.join(vivas, sql` and `)}`;
}
