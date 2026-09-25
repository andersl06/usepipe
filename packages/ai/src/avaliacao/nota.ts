/**
 * Cálculo da nota. Determinístico e feito aqui, nunca pelo modelo.
 *
 * A nota é média ponderada pelo peso do grupo vezes o peso do critério, na escala
 * de `formulario_avaliacao.nota_maxima`. Critério `nao_se_aplica` sai do
 * denominador — não é zero, é ausência. Critério fatal reprovado zera o total.
 *
 * `pontos` de cada resposta já vem na escala da nota: a soma dos pontos é a nota
 * antes do fatal. É essa propriedade que faz a tela conseguir mostrar "perdeu 12
 * pontos aqui" sem recalcular nada.
 */

import { FormatIaError } from '../cliente/erros.js';
import type { Criterio, Formulario, RespostaEvaluation, RespostaBruta } from './tipos.js';
import { TETO_ESCALA, TETO_NOTA, criteriosDoFormulario } from './tipos.js';

/** Quanto do critério foi cumprido, de 0 a 1. `null` quando não se aplica. */
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
  fatalReprovados: string[];
  respostas: RespostaEvaluation[];
}

/** Arredonda para as duas casas de `numeric(6,2)`, sem herdar erro de ponto flutuante. */
export function duasCasas(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Aplica pesos, escala e critério fatal sobre as respostas já validadas.
 *
 * `respostas` precisa cobrir todos os critérios do formulário — quem monta essa
 * lista (`avaliacao/avaliacao.ts`) já garantiu isso. Aqui, faltar critério é erro.
 */
export function calcularNota(
  formulario: Formulario,
  respostas: readonly (RespostaBruta & { evidenciaMessageId: string | null })[],
): NotaCalculada {
  const byCriterio = new Map(respostas.map((r) => [r.criterioId, r]));
  const pares = criteriosDoFormulario(formulario);

  let pesoTotal = 0;
  const partial: {
    criterio: Criterio;
    peso: number;
    fraction: number | null;
    resposta: RespostaBruta & { evidenciaMessageId: string | null };
  }[] = [];

  for (const { grupo, criterio } of pares) {
    const resposta = byCriterio.get(criterio.id);
    if (!resposta) {
      throw new FormatIaError(
        `O critério "${criterio.nome}" (${criterio.id}) ficou sem resposta.`,
        [...byCriterio.keys()],
      );
    }
    const fraction = valueFraction(criterio, resposta.value);
    const peso = grupo.peso * criterio.peso;
    if (fraction !== null) pesoTotal += peso;
    partial.push({ criterio, peso, fraction, resposta });
  }

  const escala = pesoTotal > 0 ? formulario.notaMaxima / pesoTotal : 0;

  const saida: RespostaEvaluation[] = [];
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
      evidenciaMessageId: resposta.evidenciaMessageId,
    });
  }

  const notaAntesDoFatal = duasCasas(soma);
  return {
    nota: fatalRejected.length > 0 ? 0 : notaAntesDoFatal,
    notaAntesDoFatal,
    fatalRejected,
    respostas: saida,
  };
}
