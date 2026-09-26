/**
 * Score calculation is deterministic here, never left to the model. The score is weighted by group and criterion weights on the `formulario_avaliacao.nota_maxima` scale. A `nao_se_aplica` criterion leaves the denominator; it is absent, not zero. A failed fatal criterion zeroes the total. Each response's `pontos` already uses the score scale: their sum is the score before the fatal rule, allowing the UI to show points lost per response without recalculation.
 */

import { FormatIaError } from '../cliente/errors.js';
import type { Criterio, Formulario, ResponseEvaluation, RespostaBruta } from './tipos.js';
import { TETO_ESCALA, TETO_NOTA, criteriosDoFormulario } from './tipos.js';

/** Fraction of the criterion met, from 0 to 1; `null` means not applicable. */
export function valueFraction(criterio: Criterio, value: string): number | null {
  const bruto = value.trim().toLowerCase();
  if (bruto === 'nao_se_aplica') return null;

  if (criterio.tipo === 'conforme') {
    if (bruto === 'conforme') return 1;
    if (bruto === 'nao_conforme') return 0;
    throw new FormatIaError(
      `Critério "${criterio.nome}" (${criterio.id}) é do tipo conforme e recebeu "${value}".`,
      value,
    );
  }

  const teto = criterio.tipo === 'escala' ? TETO_ESCALA : TETO_NOTA;
  const numero = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > teto) {
    throw new FormatIaError(
      `Critério "${criterio.nome}" (${criterio.id}) aceita 0 a ${teto} e recebeu "${value}".`,
      value,
    );
  }
  return numero / teto;
}

export interface NotaCalculada {
  nota: number;
  notaAntesDoFatal: number;
  fatalRejected: string[];
  respostas: ResponseEvaluation[];
}

/** Rounds to the two decimal places of `numeric(6,2)` without carrying floating-point error. */
export function duasCasas(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Applies weights, scale, and fatal criteria to validated responses. `respostas` must cover every form criterion; its builder (`avaliacao/avaliacao.ts`) already guarantees this, so a missing criterion is an error here.
 */
export function calcularNota(
  formulario: Formulario,
  respostas: readonly (RespostaBruta & { evidenceMessageId: string | null })[],
): NotaCalculada {
  const byCriterion = new Map(respostas.map((r) => [r.criterioId, r]));
  const pares = criteriosDoFormulario(formulario);

  let pesoTotal = 0;
  const partial: {
    criterio: Criterio;
    peso: number;
    fraction: number | null;
    resposta: RespostaBruta & { evidenceMessageId: string | null };
  }[] = [];

  for (const { grupo, criterio } of pares) {
    const resposta = byCriterion.get(criterio.id);
    if (!resposta) {
      throw new FormatIaError(
        `O critério "${criterio.nome}" (${criterio.id}) ficou sem resposta.`,
        [...byCriterion.keys()],
      );
    }
    const fraction = valueFraction(criterio, resposta.value);
    const peso = grupo.peso * criterio.peso;
    if (fraction !== null) pesoTotal += peso;
    partial.push({ criterio, peso, fraction, resposta });
  }

  const escala = pesoTotal > 0 ? formulario.notaMaxima / pesoTotal : 0;

  const saida: ResponseEvaluation[] = [];
  const fatalRejected: string[] = [];
  let soma = 0;

  for (const { criterio, peso, fraction, resposta } of partial) {
    const pontos = fraction === null ? 0 : duasCasas(peso * fraction * escala);
    soma += pontos;
    if (criterio.fatal && fraction !== null && fraction < 1) fatalRejected.push(criterio.id);
    saida.push({
      criterioId: criterio.id,
      value: resposta.value.trim().toLowerCase(),
      pontos,
      justificativa: resposta.justificativa,
      evidenceMessageId: resposta.evidenceMessageId,
    });
  }

  const notaAntesDoFatal = duasCasas(soma);
  return {
    nota: fatalRejected.length > 0 ? 0 : notaAntesDoFatal,
    notaAntesDoFatal,
    fatalRejected: fatalRejected,
    respostas: saida,
  };
}
