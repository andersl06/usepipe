'use server';

import { revalidatePath } from 'next/cache';
import {
  atribuirProprietario,
  desqualificarLeads,
  listarProprietarios,
} from '../../lib/leads';

/**
 * As ações em massa da listagem.
 *
 * Toda entrada vem do navegador e é tratada como tal: os ids passam por um
 * filtro de UUID antes de virar `in (...)`, e o proprietário é conferido contra
 * a lista de usuários ativos do tenant. Não é paranoia — é a mesma regra que
 * `moverOportunidade` já segue para a fase: **entrada de cliente não define
 * valor de escrita**.
 *
 * O teto de 200 é o mesmo da listagem. Ninguém seleciona mais do que a tela
 * mostra, então um pedido com 5.000 ids não veio da tela.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TETO = 200;

export interface ResultadoEmMassa {
  /** Quantas linhas o banco realmente mudou. */
  mudadas: number;
  /** Quantas foram pedidas. Diferente de `mudadas` quando alguma foi recusada. */
  pedidas: number;
}

function idsLimpos(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, TETO);
}

function recarregar() {
  revalidatePath('/leads');
  revalidatePath('/');
}

export async function atribuirEmMassa(
  ids: string[],
  proprietarioId: string,
): Promise<ResultadoEmMassa> {
  const limpos = idsLimpos(ids);
  const donos = await listarProprietarios();
  if (!donos.some((d) => d.id === proprietarioId)) {
    throw new Error('proprietário desconhecido');
  }
  const mudadas = await atribuirProprietario(limpos, proprietarioId);
  recarregar();
  return { mudadas, pedidas: limpos.length };
}

export async function desqualificarEmMassa(ids: string[]): Promise<ResultadoEmMassa> {
  const limpos = idsLimpos(ids);
  const mudadas = await desqualificarLeads(limpos);
  recarregar();
  return { mudadas, pedidas: limpos.length };
}
