/**
 * The global search contract, separate from the query.
 *
 * It exists because `menu-de-comando.tsx` is a CLIENT component and needs these
 * types: importing them from `busca.ts` would drag `banco.ts` and `pg` into the
 * browser bundle, and Next fails with "module not found: fs".
 *
 * When the front end moves to Vite this migrates to `packages/contracts` — that's
 * exactly its job.
 */

export type TipoDeResultado = 'lead' | 'oportunidade' | 'conta' | 'contato';

export interface Resultado {
  tipo: TipoDeResultado;
  id: string;
  titulo: string;
  /** The bottom line: what distinguishes two records with similar names. */
  detalhe: string | null;
  href: string;
}

/** Each group's label, in the order the menu shows them. */
export const ROTULO_DO_TIPO: Record<TipoDeResultado, string> = {
  lead: 'Leads',
  oportunidade: 'Oportunidades',
  conta: 'Contas',
  contato: 'Contatos',
};
