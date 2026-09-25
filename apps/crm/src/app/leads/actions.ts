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

export async function desqualificarInBulk(ids: string[]): Promise<ResultInBulk> {
  const limpos = idsLimpos(ids);
  const mudadas = await desqualificarLeads(limpos);
  recarregar();
  return { mudadas, pedidas: limpos.length };
}

/* ------------------------------------------------ edição de campo na ficha */

export interface ResultadoCampo {
  ok: boolean;
  /** O valor que **ficou gravado**. A tela mostra este, nunca o que foi digitado. */
  value: string | null;
  /** Só quando `ok` é falso, e sempre em português: vai direto para a tela. */
  error?: string;
}

/**
 * Gravar um campo da ficha a partir da célula inline.
 *
 * A célula já recusou o e-mail sem arroba antes de chegar aqui, e aqui recusa
 * de novo — a validação do navegador é conveniência, a do servidor é a que
 * conta, porque esta função é um endereço HTTP e qualquer um alcança.
 *
 * O `proprietario` é conferido contra a lista de usuários ativos pelo mesmo
 * motivo de `atribuirEmMassa`: **entrada de cliente não define valor de
 * escrita**. Vazio é apagar o proprietário, que é uma operação legítima.
 *
 * Devolve sempre o valor que ficou no banco. Quando não deu, devolve o valor
 * anterior junto com a queixa, e é isso que faz a tela voltar ao que era em vez
 * de ficar mostrando um dado que não existe.
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
