'use server';

import { revalidatePath } from 'next/cache';
import { faseValida, moverParaFase } from '../../lib/funil';

/**
 * Move the opportunity to a stage by dragging.
 *
 * The stage comes from the browser, so it's validated against the catalog before
 * becoming a write: client input never determines a column value, not even as
 * free text.
 */
export async function moveOpportunity(id: string, fase: string): Promise<void> {
  if (!faseValida(fase)) throw new Error(`fase desconhecida: ${fase}`);
  await moverParaFase(id, fase);
  revalidatePath('/opportunities');
  revalidatePath('/');
}
