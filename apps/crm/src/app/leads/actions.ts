'use server';

import { revalidatePath } from 'next/cache';
import {
  atribuirProprietario,
  atualizarCampoDoLead,
  desqualificarLeads,
  listarProprietarios,
} from '../../lib/leads';
import { campoValido, normalizar, recusar } from '../../lib/campos-editaveis';

/**
 * The listing's bulk actions.
 *
 * All input comes from the browser and is treated as such: ids pass through a UUID
 * filter before becoming an `in (...)`, and the owner is checked against the
 * tenant's list of active users. It's not paranoia — it's the same rule
 * `moverOportunidade` already follows for stage: **client input never determines a
 * write value**.
 *
 * The cap of 200 matches the listing. Nobody selects more than the screen shows, so
 * a request with 5,000 ids didn't come from the screen.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TETO = 200;

export interface ResultInBulk {
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

export async function assignInBulk(
  ids: string[],
  proprietarioId: string,
): Promise<ResultInBulk> {
  const limpos = idsLimpos(ids);
  const donos = await listarProprietarios();
  if (!donos.some((d) => d.id === proprietarioId)) {
    throw new Error('proprietário desconhecido');
  }
  const mudadas = await atribuirProprietario(limpos, proprietarioId);
  recarregar();
  return { mudadas, pedidas: limpos.length };
}

export async function disqualifyInBulk(ids: string[]): Promise<ResultInBulk> {
  const limpos = idsLimpos(ids);
  const mudadas = await desqualificarLeads(limpos);
  recarregar();
  return { mudadas, pedidas: limpos.length };
}

/* ------------------------------------------------ record field editing */

export interface ResultadoCampo {
  ok: boolean;
  /** The value that **actually got saved**. The screen shows this one, never what was typed. */
  value: string | null;
  /** Only when `ok` is false, and always in Portuguese: it goes straight to the screen. */
  error?: string;
}

/**
 * Save a record field from the inline cell.
 *
 * The cell already rejected an email without an @ before this was reached, and it's
 * rejected again here — browser validation is a convenience, server validation is
 * what counts, because this function is an HTTP address and anyone can reach it.
 *
 * The `proprietario` is checked against the tenant's list of active users for the
 * same reason as `assignInBulk`: **client input never determines a write
 * value**. Empty means clearing the owner, which is a legitimate operation.
 *
 * Always returns the value that ended up in the database. When it fails, it
 * returns the previous value along with the complaint, and that's what makes the
 * screen go back to how it was instead of showing data that doesn't exist.
 */
export async function salvarCampoDoLead(
  leadId: string,
  campo: string,
  bruto: string,
  anterior: string | null,
): Promise<ResultadoCampo> {
  if (!UUID.test(leadId)) return { ok: false, value: anterior, error: 'Lead desconhecido.' };
  if (!campoValido(campo)) {
    return { ok: false, value: anterior, error: 'Este campo não é editável.' };
  }

  const value = normalizar(bruto);
  const queixa = recusar(campo, value);
  if (queixa) return { ok: false, value: anterior, error: queixa };

  if (campo === 'proprietario' && value !== null) {
    const donos = await listarProprietarios();
    if (!donos.some((d) => d.id === value)) {
      return { ok: false, value: anterior, error: 'Proprietário desconhecido.' };
    }
  }

  const gravou = await atualizarCampoDoLead(leadId, campo, value);
  if (!gravou) {
    return {
      ok: false,
      value: anterior,
      error:
        campo === 'email' || campo === 'telefone'
          ? 'Este lead não tem contato: não há onde guardar e-mail nem telefone.'
          : 'O banco recusou: o lead pode ter sido excluído.',
    };
  }

  revalidatePath(`/leads/${leadId}`);
  recarregar();
  return { ok: true, value };
}
