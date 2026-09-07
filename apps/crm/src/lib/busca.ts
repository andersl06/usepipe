import { ilike, or, sql } from 'drizzle-orm';
import { conta, contato, lead, oportunidade } from '@pipe/db/schema';
import { consultar } from './banco';
import type { Resultado } from './busca-tipos';

export * from './busca-tipos';

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

export const POR_OBJETO = 5;

export async function buscar(termo: string): Promise<Resultado[]> {
  const limpo = termo.trim();
  // Uma letra casa com meio banco e não ajuda ninguém a chegar em lugar nenhum.
  if (limpo.length < 2) return [];

  const padrao = `%${limpo}%`;

  return consultar(async (tx) => {
    const leads = await tx
      .select({
        id: lead.id,
        nome: contato.nome,
        email: contato.email,
        fase: lead.fase,
      })
      .from(lead)
      .innerJoin(contato, sql`${contato.id} = ${lead.contatoId}`)
      .where(
        and0(
          sql`${lead.excluidoEm} is null`,
          or(ilike(contato.nome, padrao), ilike(contato.email, padrao)),
        ),
      )
      .limit(POR_OBJETO);

    const oportunidades = await tx
      .select({ id: oportunidade.id, nome: oportunidade.nome, fase: oportunidade.fase })
      .from(oportunidade)
      .where(ilike(oportunidade.nome, padrao))
      .limit(POR_OBJETO);

    const contas = await tx
      .select({ id: conta.id, nome: conta.nome, dominio: conta.dominio })
      .from(conta)
      .where(or(ilike(conta.nome, padrao), ilike(conta.dominio, padrao)))
      .limit(POR_OBJETO);

    const contatos = await tx
      .select({ id: contato.id, nome: contato.nome, email: contato.email })
      .from(contato)
      .where(or(ilike(contato.nome, padrao), ilike(contato.email, padrao)))
      .limit(POR_OBJETO);

    return [
      ...leads.map((l) => ({
        tipo: 'lead' as const,
        id: l.id,
        titulo: l.nome ?? 'Sem nome',
        detalhe: l.email ?? l.fase,
        href: `/leads/${l.id}`,
      })),
      ...oportunidades.map((o) => ({
        tipo: 'oportunidade' as const,
        id: o.id,
        titulo: o.nome,
        detalhe: o.fase,
        href: `/oportunidades`,
      })),
      ...contas.map((c) => ({
        tipo: 'conta' as const,
        id: c.id,
        titulo: c.nome,
        detalhe: c.dominio,
        href: `/contas/${c.id}`,
      })),
      ...contatos.map((c) => ({
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
