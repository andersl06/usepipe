import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';

export const MIN_CONTACT_SEARCH = 2;
export const MAX_CONTACT_SEARCH = 20;

export type ContactOfSearch = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

/** Escapa com `!` (e `escape '!'` na consulta): a barra invertida não chega intacta ao Postgres por este driver. */
const likeLiteral = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

/**
 * Autocomplete do filtro de Contato: nome, e-mail ou telefone (só dígitos) com texto parcial.
 * O tenant vem da transação (RLS) e a busca nunca devolve contato excluído; no máximo 20 linhas.
 */
export async function searchContacts(tx: TransactionPipe, text: string): Promise<ContactOfSearch[]> {
  const termo = text.trim().slice(0, 100);
  if (termo.length < MIN_CONTACT_SEARCH) return [];
  const padrao = `%${likeLiteral(termo)}%`;
  const digitos = termo.replace(/\D/g, '');
  const porTelefone = digitos.length >= MIN_CONTACT_SEARCH
    ? sql`or regexp_replace(coalesce(ct.telefone_e164, ''), '[^0-9]', '', 'g') like ${`%${digitos}%`}`
    : sql``;
  const { rows } = await tx.execute<ContactOfSearch>(sql`
    select ct.id, ct.nome as name, ct.telefone_e164 as phone, ct.email
      from contato ct
     where ct.excluido_em is null
       and (coalesce(ct.nome, '') ilike ${padrao} escape '!'
            or coalesce(ct.email, '') ilike ${padrao} escape '!'
            ${porTelefone})
     order by ct.nome nulls last, ct.telefone_e164
     limit ${MAX_CONTACT_SEARCH}
  `);
  return rows;
}
