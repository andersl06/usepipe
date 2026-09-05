'use server';

import { revalidatePath } from 'next/cache';
import { faseValida, moverParaFase } from '../../lib/funil';

/**
 * Mover a oportunidade de fase pelo arraste.
 *
 * A fase chega do navegador, então é validada contra o catálogo antes de virar
 * escrita: entrada de cliente não define valor de coluna, nem sendo texto livre.
 */
export async function moverOportunidade(id: string, fase: string): Promise<void> {
  if (!faseValida(fase)) throw new Error(`fase desconhecida: ${fase}`);
  await moverParaFase(id, fase);
  revalidatePath('/oportunidades');
  revalidatePath('/');
}
