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

import type { ResultadoAvaliacao } from '../avaliacao/index.js';
import { avaliarConversa, calcularNota, criteriosDoFormulario } from '../avaliacao/index.js';
import type { Formulario } from '../avaliacao/tipos.js';
import type { ChamadaEstruturada } from '../cliente/cliente.js';
import type { Consumo } from '../consumo/index.js';
import { somarConsumo } from '../consumo/index.js';
import type { MensagemTranscricao, OpcoesTranscricao } from '../transcricao/index.js';
import { montarTranscricao } from '../transcricao/index.js';

/** Uma conversa do conjunto de referência, com a avaliação feita por humano. */
export interface CasoReferencia {
  id: string;
  descricao?: string;
  contexto?: string | null;
  mensagens: MensagemTranscricao[];
  formulario: Formulario;
  /** Gabarito: o valor que o humano deu a cada critério. A nota sai daqui. */
  gabarito: { criterioId: string; valor: string }[];
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
  criteriosIguais: number;
  criteriosTotal: number;
  confianca: number;
}

export interface FalhaBancada {
  casoId: string;
  erro: string;
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
  porCriterio: DesvioCriterio[];
  porCaso: CasoMedido[];
  consumo: Consumo[];
}

/** Como a bancada obtém a avaliação da IA. Trocável para medir outra variação. */
export type AvaliadorBancada = (caso: CasoReferencia) => Promise<ResultadoAvaliacao>;

export interface OpcoesBancada {
  casos: readonly CasoReferencia[];
  /** Por padrão: monta a transcrição e chama `avaliarConversa`. */
  avaliar?: AvaliadorBancada;
  transcricao?: OpcoesTranscricao;
  modelo?: string;
  chamar?: ChamadaEstruturada;
  /** Chamado a cada caso, para a linha de comando mostrar progresso. */
  aoTerminarCaso?: (casoId: string, medido: CasoMedido | null) => void;
}

function avaliadorPadrao(opcoes: OpcoesBancada): AvaliadorBancada {
  return (caso) =>
    avaliarConversa({
      formulario: caso.formulario,
      transcricao: montarTranscricao(caso.mensagens, opcoes.transcricao),
      contexto: caso.contexto,
      modelo: opcoes.modelo,
      chamar: opcoes.chamar,
    });
}

function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function arredondar(valor: number, casas = 4): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

/** Compara duas respostas de critério do jeito que o banco as guardaria. */
export function mesmoValor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Roda a avaliação por IA contra o conjunto de referência e devolve acurácia geral
 * e desvio por critério.
 */
export async function rodarBancada(opcoes: OpcoesBancada): Promise<ResultadoBancada> {
  const avaliar = opcoes.avaliar ?? avaliadorPadrao(opcoes);

  const falhas: FalhaBancada[] = [];
  const porCaso: CasoMedido[] = [];
  const consumos: Consumo[] = [];
  const acumulado = new Map<
    string,
    { nome: string; n: number; acertos: number; desvios: number[] }
  >();

  let comparadas = 0;
  let iguais = 0;

  for (const caso of opcoes.casos) {
    try {
      const ia = await avaliar(caso);
      const humano = calcularNota(
        caso.formulario,
        caso.gabarito.map((g) => ({
          criterioId: g.criterioId,
          valor: g.valor,
          justificativa: 'gabarito humano',
          evidenciaMensagemId: null,
        })),
      );

      const pontosIa = new Map(ia.respostas.map((r) => [r.criterioId, r]));
      const pontosHumano = new Map(humano.respostas.map((r) => [r.criterioId, r]));

      let iguaisNoCaso = 0;
      let totalNoCaso = 0;

      for (const { criterio } of criteriosDoFormulario(caso.formulario)) {
        const a = pontosIa.get(criterio.id);
        const h = pontosHumano.get(criterio.id);
        if (!a || !h) continue;

        const igual = mesmoValor(a.valor, h.valor);
        totalNoCaso++;
        comparadas++;
        if (igual) {
          iguaisNoCaso++;
          iguais++;
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
        criteriosIguais: iguaisNoCaso,
        criteriosTotal: totalNoCaso,
        confianca: ia.confianca,
      };
      porCaso.push(medido);
      consumos.push(ia.consumo);
      opcoes.aoTerminarCaso?.(caso.id, medido);
    } catch (erro) {
      falhas.push({ casoId: caso.id, erro: erro instanceof Error ? erro.message : String(erro) });
      opcoes.aoTerminarCaso?.(caso.id, null);
    }
  }

  const porCriterio = [...acumulado.entries()]
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
    casos: porCaso.length,
    falhas,
    acuraciaGeral: comparadas > 0 ? arredondar(iguais / comparadas) : 0,
    desvioMedioNota: arredondar(media(porCaso.map((c) => c.desvioNota)), 2),
    porCriterio,
    porCaso,
    consumo: somarConsumo(consumos),
  };
}
