/**
 * A bancada de medição, generalizada do case-sync.
 *
 * Lá ela é o que separou "melhorou" de opinião: a acurácia da classificação saiu
 * de 26% para 64% porque cada mudança foi medida contra gabarito humano, caso a
 * caso, e três das ideias mais promissoras foram **descartadas por medição** —
 * exemplos por similaridade, definições destiladas e voto majoritário pioraram ou
 * custaram 5× sem ganho.
 *
 * Duas regras de método herdadas de lá, que este arquivo respeita:
 *
 * - **compare caso a caso, não só o total.** Um ganho que quebra outros casos não
 *   é ganho. Por isso o resultado traz o desvio por critério, ordenado do pior
 *   para o melhor, e não só a acurácia geral.
 * - **falha em caso não pode virar média melhor.** Caso que estourou entra em
 *   `falhas` e fica fora do denominador, dito em voz alta.
 *
 * A saída por critério tem o mesmo formato de `calibracao_item.desvio_por_criterio`.
 */

import type { ResultEvaluation } from '../evaluation/index.js';
import { avaliarConversation, calcularNota, criteriosDoFormulario } from '../evaluation/index.js';
import type { Formulario } from '../evaluation/tipos.js';
import type { ChamadaEstruturada } from '../cliente/cliente.js';
import type { Consumo } from '../consumo/index.js';
import { somarConsumo } from '../consumo/index.js';
import type { MessageTranscription, OptionsTranscription } from '../transcription/index.js';
import { montarTranscription } from '../transcription/index.js';

/** Uma conversa do conjunto de referência, com a avaliação feita por humano. */
export interface CasoReferencia {
  id: string;
  description?: string;
  context?: string | null;
  messages: MessageTranscription[];
  formulario: Formulario;
  /** Gabarito: o valor que o humano deu a cada critério. A nota sai daqui. */
  gabarito: { criterioId: string; value: string }[];
}

export interface DesvioCriterio {
  criterioId: string;
  nome: string;
  /** Casos em que este critério foi medido. */
  n: number;
  acertos: number;
  /** `acertos / n`. */
  acuracia: number;
  /** Média de |pontos da IA − pontos do humano|, na escala da nota. */
  desvioMedioPontos: number;
}

export interface CasoMedido {
  casoId: string;
  notaHumana: number;
  notaIa: number;
  desvioNota: number;
  criteriosEqual: number;
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
  /** Respostas idênticas ao gabarito ÷ respostas comparadas. */
  acuraciaGeral: number;
  /** Média de |nota da IA − nota humana|, na escala do formulário. */
  desvioMedioNota: number;
  /** Do pior critério para o melhor: é a lista de prompts a revisar. */
  byCriterio: DesvioCriterio[];
  byCaso: CasoMedido[];
  consumo: Consumo[];
}

/** Como a bancada obtém a avaliação da IA. Trocável para medir outra variação. */
export type AvaliadorBancada = (caso: CasoReferencia) => Promise<ResultEvaluation>;

export interface OptionsWorkbench {
  casos: readonly CasoReferencia[];
  /** Por padrão: monta a transcrição e chama `avaliarConversa`. */
  avaliar?: AvaliadorBancada;
  transcription?: OptionsTranscription;
  template?: string;
  chamar?: ChamadaEstruturada;
  /** Chamado a cada caso, para a linha de comando mostrar progresso. */
  aoTerminarCaso?: (casoId: string, medido: CasoMedido | null) => void;
}

function avaliadorPadrao(options: OptionsWorkbench): AvaliadorBancada {
  return (caso) =>
    avaliarConversation({
      formulario: caso.formulario,
      transcription: montarTranscription(caso.messages, options.transcription),
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

/** Compara duas respostas de critério do jeito que o banco as guardaria. */
export function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Roda a avaliação por IA contra o conjunto de referência e devolve acurácia geral
 * e desvio por critério.
 */
export async function rodarBancada(options: OptionsWorkbench): Promise<ResultadoBancada> {
  const avaliar = options.avaliar ?? avaliadorPadrao(options);

  const falhas: FalhaBancada[] = [];
  const byCaso: CasoMedido[] = [];
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
          evidenciaMessageId: null,
        })),
      );

      const pontosIa = new Map(ia.respostas.map((r) => [r.criterioId, r]));
      const pontosHumano = new Map(humano.respostas.map((r) => [r.criterioId, r]));

      let equalInCaso = 0;
      let totalNoCaso = 0;

      for (const { criterio } of criteriosDoFormulario(caso.formulario)) {
        const a = pontosIa.get(criterio.id);
        const h = pontosHumano.get(criterio.id);
        if (!a || !h) continue;

        const igual = sameValue(a.value, h.value);
        totalNoCaso++;
        comparadas++;
        if (igual) {
          equalInCaso++;
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
        criteriosEqual: equalInCaso,
        criteriosTotal: totalNoCaso,
        confianca: ia.confianca,
      };
      byCaso.push(medido);
      consumos.push(ia.consumo);
      options.aoTerminarCaso?.(caso.id, medido);
    } catch (error) {
      falhas.push({ casoId: caso.id, error: error instanceof Error ? error.message : String(error) });
      options.aoTerminarCaso?.(caso.id, null);
    }
  }

  const byCriterio = [...acumulado.entries()]
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
    casos: byCaso.length,
    falhas,
    acuraciaGeral: comparadas > 0 ? arredondar(equal / comparadas) : 0,
    desvioMedioNota: arredondar(media(byCaso.map((c) => c.desvioNota)), 2),
    byCriterio,
    byCaso,
    consumo: somarConsumo(consumos),
  };
}
