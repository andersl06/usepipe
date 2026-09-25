import { ilike, or, sql } from 'drizzle-orm';
import { account, contact, lead, opportunity } from '@pipe/db/schema';
import { consultar } from './database';
import type { Resultado } from './search-tipos';

export * from './search-tipos';

/**
 * Busca global, a que alimenta o menu de comando.
 *
 * O Twenty resolve navegação por busca, não por menu: você aperta Ctrl+K,
 * escreve o nome e chega no registro. É a diferença entre uma lista com filtro
 * e um produto que se opera pelo teclado — e é o motivo de a lateral deles
 * poder ser curta.
 *
 * **Uma consulta por objeto, em série.** Não é `Promise.all`: dentro do
 * `consultar` a transação é uma conexão só, e paralelizar derruba o
 * `pipe.tenant_id` da sessão (README). O custo é irrelevante — são quatro
 * consultas com `limit 5` e índice.
 *
 * O teto de 5 por objeto é do Twenty (`MaxSearchResults`), e existe pelo mesmo
 * motivo: quem busca quer chegar, não navegar. Vinte resultados numa lista de
 * comando é uma segunda lista para percorrer.
 */

export const BY_OBJETO = 5;

export async function buscar(termo: string): Promise<Resultado[]> {
  const limpo = termo.trim();
  // Uma letra casa com meio banco e não ajuda ninguém a chegar em lugar nenhum.
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
        href: `/oportunidades`,
      })),
      ...accounts.map((c) => ({
        tipo: 'conta' as const,
        id: c.id,
        titulo: c.nome,
        detalhe: c.dominio,
        href: `/contas/${c.id}`,
      })),
      ...contacts.map((c) => ({
        tipo: 'contato' as const,
        id: c.id,
        titulo: c.nome ?? 'Sem nome',
        detalhe: c.email,
        href: `/contatos/${c.id}`,
      })),
    ];
  });
}

/** `and` que aceita indefinido sem reclamar, para condição opcional. */
function and0(...partes: (ReturnType<typeof sql> | undefined)[]) {
  const vivas = partes.filter(Boolean);
  return vivas.length === 1 ? vivas[0] : sql`${sql.join(vivas, sql` and `)}`;
}
