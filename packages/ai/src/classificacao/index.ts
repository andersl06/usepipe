/**
 * Classificação de atendimento: categoria, subcategoria, intenção e sentimento a
 * partir de uma taxonomia que vem por parâmetro.
 *
 * O rótulo devolvido é conferido contra a taxonomia apresentada, com a mesma
 * normalização que o case-sync precisou aprender na marra — espaço duplo e aspas
 * em HTML fizeram Cases nascerem em branco porque a comparação era literal.
 *
 * Sobre o teto da tarefa: no case-sync, 84% dos casos tinham mais de uma resposta
 * defensável e a própria atendente repetia o próprio rótulo só 53% das vezes.
 * Por isso `confianca` é parte da resposta, não um detalhe: é ela que decide se a
 * classificação entra sozinha ou vai para revisão.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Esforco } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import { ErroFormatoIa } from '../cliente/erros.js';
import type { Consumo } from '../consumo/index.js';
import type { OpcaoTaxonomia, Taxonomia } from '../prompts/classificacao.js';
import { PROMPT_CLASSIFICACAO, chaveDaOpcao, prepararOpcoes } from '../prompts/classificacao.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcricao } from '../transcricao/transcricao.js';

export const SENTIMENTOS = ['positivo', 'neutro', 'negativo'] as const;
export type Sentimento = (typeof SENTIMENTOS)[number];

/**
 * `desfecho` vem primeiro de propósito: o modelo escreve o que aconteceu antes de
 * escolher o rótulo. Foram +4,3pp de acurácia no case-sync.
 */
const EsquemaClassificacao = z.object({
  desfecho: z.string().min(1),
  categoria: z.string().min(1),
  subcategoria: z.string().nullable(),
  intencao: z.string().nullable(),
  sentimento: z.enum(SENTIMENTOS),
  confianca: z.number().min(0).max(1),
});

export interface OpcoesClassificacao {
  transcricao: Transcricao;
  taxonomia: Taxonomia;
  maxOpcoes?: number;
  contexto?: string | null;
  modelo?: string;
  esforco?: Esforco;
  chamar?: ChamadaEstruturada;
}

export interface ResultadoClassificacao {
  /** Uma frase do que o cliente pediu e do que o atendente fez. */
  desfecho: string;
  categoria: string;
  subcategoria: string | null;
  intencao: string | null;
  sentimento: Sentimento;
  confianca: number;
  consumo: Consumo;
  modelo: string;
  prompt: string;
}

/**
 * Normaliza para comparar rótulo: sem acento, sem caixa, espaço colapsado e sem
 * entidade HTML. Cada uma dessas quatro já custou retrabalho no case-sync.
 */
export function normalizarRotulo(texto: string): string {
  return texto
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Acha na taxonomia a opção que o modelo escolheu, ou `undefined`. */
export function casarOpcao(
  opcoes: readonly OpcaoTaxonomia[],
  categoria: string,
  subcategoria: string | null,
): OpcaoTaxonomia | undefined {
  const alvo = normalizarRotulo(
    subcategoria?.trim() ? `${categoria} > ${subcategoria}` : categoria,
  );
  return opcoes.find((o) => normalizarRotulo(chaveDaOpcao(o)) === alvo);
}

export async function classificarConversa(
  opcoes: OpcoesClassificacao,
): Promise<ResultadoClassificacao> {
  const chamar = opcoes.chamar ?? chamadaPadrao;
  const apresentadas = prepararOpcoes(opcoes.taxonomia, opcoes.maxOpcoes);
  const texto = PROMPT_CLASSIFICACAO.montar({
    transcricao: opcoes.transcricao.texto,
    truncada: opcoes.transcricao.truncada,
    mensagensOmitidas: opcoes.transcricao.mensagensOmitidas,
    taxonomia: opcoes.taxonomia,
    maxOpcoes: opcoes.maxOpcoes,
    contexto: opcoes.contexto,
  });

  const { dados, consumo, modelo } = await chamar({
    sistema: texto.sistema,
    usuario: texto.usuario,
    esquema: EsquemaClassificacao,
    funcionalidade: 'classificacao',
    modelo: opcoes.modelo,
    esforco: opcoes.esforco,
    maxTokens: 2_000,
  });

  const escolhida = casarOpcao(apresentadas, dados.categoria, dados.subcategoria);
  if (!escolhida) {
    throw new ErroFormatoIa(
      `"${chaveDaOpcao({ categoria: dados.categoria, subcategoria: dados.subcategoria })}" não está entre as ${apresentadas.length} opções apresentadas.`,
      dados,
    );
  }

  return {
    desfecho: dados.desfecho.trim(),
    // O rótulo gravado é o **da taxonomia**, não o que o modelo digitou: é ele que
    // vai casar com o filtro da tela e com a agregação de `insight`.
    categoria: escolhida.categoria,
    subcategoria: escolhida.subcategoria?.trim() || null,
    intencao: dados.intencao?.trim() || null,
    sentimento: dados.sentimento,
    confianca: dados.confianca,
    consumo,
    modelo,
    prompt: identificador(PROMPT_CLASSIFICACAO),
  };
}
