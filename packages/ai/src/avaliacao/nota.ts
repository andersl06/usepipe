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

import { ErroFormatoIa } from '../cliente/erros.js';
import type { Criterio, Formulario, RespostaAvaliacao, RespostaBruta } from './tipos.js';
import { TETO_ESCALA, TETO_NOTA, criteriosDoFormulario } from './tipos.js';

/** Quanto do critério foi cumprido, de 0 a 1. `null` quando não se aplica. */
export function fracaoDoValor(criterio: Criterio, valor: string): number | null {
  const bruto = valor.trim().toLowerCase();
  if (bruto === 'nao_se_aplica') return null;

  if (criterio.tipo === 'conforme') {
    if (bruto === 'conforme') return 1;
    if (bruto === 'nao_conforme') return 0;
    throw new ErroFormatoIa(
      `Critério "${criterio.nome}" (${criterio.id}) é do tipo conforme e recebeu "${valor}".`,
      valor,
    );
  }

  const teto = criterio.tipo === 'escala' ? TETO_ESCALA : TETO_NOTA;
  const numero = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > teto) {
    throw new ErroFormatoIa(
      `Critério "${criterio.nome}" (${criterio.id}) aceita 0 a ${teto} e recebeu "${valor}".`,
      valor,
    );
  }
  return numero / teto;
}

export interface NotaCalculada {
  nota: number;
  notaAntesDoFatal: number;
  fataisReprovados: string[];
  respostas: RespostaAvaliacao[];
}

/** Arredonda para as duas casas de `numeric(6,2)`, sem herdar erro de ponto flutuante. */
export function duasCasas(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Aplica pesos, escala e critério fatal sobre as respostas já validadas.
 *
 * `respostas` precisa cobrir todos os critérios do formulário — quem monta essa
 * lista (`avaliacao/avaliacao.ts`) já garantiu isso. Aqui, faltar critério é erro.
 */
export function calcularNota(
  formulario: Formulario,
  respostas: readonly (RespostaBruta & { evidenciaMensagemId: string | null })[],
): NotaCalculada {
  const porCriterio = new Map(respostas.map((r) => [r.criterioId, r]));
  const pares = criteriosDoFormulario(formulario);

  let pesoTotal = 0;
  const parciais: {
    criterio: Criterio;
    peso: number;
    fracao: number | null;
    resposta: RespostaBruta & { evidenciaMensagemId: string | null };
  }[] = [];

  for (const { grupo, criterio } of pares) {
    const resposta = porCriterio.get(criterio.id);
    if (!resposta) {
      throw new ErroFormatoIa(
        `O critério "${criterio.nome}" (${criterio.id}) ficou sem resposta.`,
        [...porCriterio.keys()],
      );
    }
    const fracao = fracaoDoValor(criterio, resposta.valor);
    const peso = grupo.peso * criterio.peso;
    if (fracao !== null) pesoTotal += peso;
    parciais.push({ criterio, peso, fracao, resposta });
  }

  const escala = pesoTotal > 0 ? formulario.notaMaxima / pesoTotal : 0;

  const saida: RespostaAvaliacao[] = [];
  const fataisReprovados: string[] = [];
  let soma = 0;

  for (const { criterio, peso, fracao, resposta } of parciais) {
    const pontos = fracao === null ? 0 : duasCasas(peso * fracao * escala);
    soma += pontos;
    if (criterio.fatal && fracao !== null && fracao < 1) fataisReprovados.push(criterio.id);
    saida.push({
      criterioId: criterio.id,
      valor: resposta.valor.trim().toLowerCase(),
      pontos,
      justificativa: resposta.justificativa,
      evidenciaMensagemId: resposta.evidenciaMensagemId,
    });
  }

  const notaAntesDoFatal = duasCasas(soma);
  return {
    nota: fataisReprovados.length > 0 ? 0 : notaAntesDoFatal,
    notaAntesDoFatal,
    fataisReprovados,
    respostas: saida,
  };
}
