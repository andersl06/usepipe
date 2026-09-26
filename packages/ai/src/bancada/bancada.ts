/**
 * The measurement bench, generalized from case-sync. There, measuring every change against human labels case by case raised classification accuracy from 26% to 64%; similarity examples, distilled definitions, and majority voting were discarded after measurement because they worsened results or cost 5× more without gains. Compare cases individually: a gain that breaks other cases is no gain, so results report deviation by criterion from worst to best as well as overall accuracy. A failed case must not improve the average: record it in `falhas` and exclude it from the denominator. The per-criterion output matches `calibracao_item.desvio_por_criterio`.
 */

import type { ResultEvaluation } from '../evaluation/index.js';
import { evaluateConversation, calcularNota, criteriosDoFormulario } from '../evaluation/index.js';
import type { Formulario } from '../evaluation/tipos.js';
import type { ChamadaEstruturada } from '../cliente/cliente.js';
import type { Consumo } from '../consumo/index.js';
import { somarConsumo } from '../consumo/index.js';
import type { MessageTranscription, OptionsTranscription } from '../transcription/index.js';
import { buildTranscription } from '../transcription/index.js';

/** A reference-set conversation with a human evaluation. */
export interface CasoReferencia {
  id: string;
  description?: string;
  context?: string | null;
  messages: MessageTranscription[];
  formulario: Formulario;
  /** Ground truth: the value assigned by a human to each criterion; the score follows from it. */
  gabarito: { criterioId: string; value: string }[];
}

export interface DesvioCriterio {
  criterioId: string;
  nome: string;
  /** Number of cases in which this criterion was measured. */
  n: number;
  acertos: number;
  /** `acertos / n`. */
  acuracia: number;
  /** Mean absolute difference between AI and human points, on the score scale. */
  desvioMedioPontos: number;
}

export interface CasoMedido {
  casoId: string;
  notaHumana: number;
  notaIa: number;
  desvioNota: number;
  criteriaEqual: number;
  criteriosTotal: number;
  confianca: number;
}

export interface FalhaBancada {
  casoId: string;
  error: string;
}

export interface ResultadoBancada {
  /** Casos medidos com sucesso. */
  casos: number;
  falhas: FalhaBancada[];
  /** Responses identical to ground truth divided by compared responses. */
  acuraciaGeral: number;
  /** Mean absolute difference between AI and human scores, on the form's scale. */
  desvioMedioNota: number;
  /** Criteria from worst to best; the prompt review list. */
  byCriterion: DesvioCriterio[];
  byCase: CasoMedido[];
  consumo: Consumo[];
}

/** How the bench obtains an AI evaluation; replaceable to measure another variant. */
export type AvaliadorBancada = (caso: CasoReferencia) => Promise<ResultEvaluation>;

export interface OptionsWorkbench {
  casos: readonly CasoReferencia[];
  /** By default, builds the transcript and calls `avaliarConversa`. */
  avaliar?: AvaliadorBancada;
  transcription?: OptionsTranscription;
  template?: string;
  chamar?: ChamadaEstruturada;
  /** Called after each case so the CLI can show progress. */
  aoTerminarCaso?: (casoId: string, medido: CasoMedido | null) => void;
}

function avaliadorPadrao(options: OptionsWorkbench): AvaliadorBancada {
  return (caso) =>
    evaluateConversation({
      formulario: caso.formulario,
      transcription: buildTranscription(caso.messages, options.transcription),
      context: caso.context,
      template: options.template,
      chamar: options.chamar,
    });
}

function media(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function arredondar(value: number, casas = 4): number {
  const f = 10 ** casas;
  return Math.round((value + Number.EPSILON) * f) / f;
}


export function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}


export async function rodarBancada(options: OptionsWorkbench): Promise<ResultadoBancada> {
  const avaliar = options.avaliar ?? avaliadorPadrao(options);

  const falhas: FalhaBancada[] = [];
  const byCase: CasoMedido[] = [];
  const consumos: Consumo[] = [];
  const acumulado = new Map<
    string,
    { nome: string; n: number; acertos: number; desvios: number[] }
  >();

  let comparadas = 0;
  let equal = 0;

  for (const caso of options.casos) {
    try {
      const ia = await avaliar(caso);
      const humano = calcularNota(
        caso.formulario,
        caso.gabarito.map((g) => ({
          criterioId: g.criterioId,
          value: g.value,
          justificativa: 'gabarito humano',
          evidenceMessageId: null,
        })),
      );

      const pontosIa = new Map(ia.respostas.map((r) => [r.criterioId, r]));
      const pontosHumano = new Map(humano.respostas.map((r) => [r.criterioId, r]));

      let equalInCase = 0;
      let totalNoCaso = 0;

      for (const { criterio } of criteriosDoFormulario(caso.formulario)) {
        const a = pontosIa.get(criterio.id);
        const h = pontosHumano.get(criterio.id);
        if (!a || !h) continue;

        const igual = sameValue(a.value, h.value);
        totalNoCaso++;
        comparadas++;
        if (igual) {
          equalInCase++;
          equal++;
        }

        const linha = acumulado.get(criterio.id) ?? {
          nome: criterio.nome,
          n: 0,
          acertos: 0,
          desvios: [],
        };
        linha.n++;
        if (igual) linha.acertos++;
        linha.desvios.push(Math.abs(a.pontos - h.pontos));
        acumulado.set(criterio.id, linha);
      }

      const medido: CasoMedido = {
        casoId: caso.id,
        notaHumana: humano.nota,
        notaIa: ia.nota,
        desvioNota: arredondar(Math.abs(ia.nota - humano.nota), 2),
        criteriaEqual: equalInCase,
        criteriosTotal: totalNoCaso,
        confianca: ia.confianca,
      };
      byCase.push(medido);
      consumos.push(ia.consumo);
      options.aoTerminarCaso?.(caso.id, medido);
    } catch (error) {
      falhas.push({ casoId: caso.id, error: error instanceof Error ? error.message : String(error) });
      options.aoTerminarCaso?.(caso.id, null);
    }
  }

  const byCriterion = [...acumulado.entries()]
    .map(([criterioId, l]) => ({
      criterioId,
      nome: l.nome,
      n: l.n,
      acertos: l.acertos,
      acuracia: arredondar(l.acertos / l.n),
      desvioMedioPontos: arredondar(media(l.desvios), 2),
    }))
    .sort((a, b) => a.acuracia - b.acuracia || b.desvioMedioPontos - a.desvioMedioPontos);

  return {
    casos: byCase.length,
    falhas,
    acuraciaGeral: comparadas > 0 ? arredondar(equal / comparadas) : 0,
    desvioMedioNota: arredondar(media(byCase.map((c) => c.desvioNota)), 2),
    byCriterion,
    byCase,
    consumo: somarConsumo(consumos),
  };
}
