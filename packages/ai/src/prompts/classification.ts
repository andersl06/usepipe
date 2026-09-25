/**
 * Prompt de classificação.
 *
 * Três coisas aqui vêm medidas do case-sync, onde a acurácia saiu de 26% para 64%:
 *
 * - **as opções vêm ordenadas por uso real e podadas** (+22,6pp lá). Lista
 *   alfabética completa é a pior forma de apresentar taxonomia a um modelo.
 * - **a resposta é em duas etapas**: primeiro o desfecho em uma frase, depois o
 *   rótulo (+4,3pp lá). Como o esquema de saída é gerado na ordem declarada,
 *   `desfecho` vem antes de `categoria` de propósito — é raciocínio barato e no
 *   formato certo.
 * - **nada de exemplos por similaridade e nada de definições destiladas.** Foram
 *   medidos: sozinhos davam pouco, juntos com o prior *derrubavam* a acurácia.
 *
 * A taxonomia é parâmetro, nunca constante de código.
 */

import type { Prompt } from './tipos.js';

export interface OptionTaxonomia {
  categoria: string;
  subcategoria?: string | null;
  description?: string | null;
  /** Quantas vezes um humano escolheu esta opção. É o que ordena e poda a lista. */
  usos?: number | null;
}

export interface Taxonomia {
  options: readonly OptionTaxonomia[];
  /** Intenções aceitas. Vazio, o modelo responde livre. */
  intents?: readonly string[];
}

export interface InboundClassification {
  transcription: string;
  truncada: boolean;
  messagesOmitidas: number;
  taxonomia: Taxonomia;
  /** Teto de opções apresentadas. Lista longa demais dilui a escolha. */
  maxOptions?: number;
  context?: string | null;
}

export const MAX_OPTIONS_DEFAULT = 40;

/** Chave textual de uma opção, do jeito que ela aparece na lista e volta na resposta. */
export function optionKey(o: OptionTaxonomia): string {
  return o.subcategoria?.trim() ? `${o.categoria} > ${o.subcategoria}` : o.categoria;
}

/**
 * Ordena por uso real (desc) e poda ao teto, com desempate alfabético para a lista
 * ser estável entre execuções — prompt que muda sozinho não pode ser medido.
 */
export function prepararOptions(
  taxonomia: Taxonomia,
  maxOptions = MAX_OPTIONS_DEFAULT,
): OptionTaxonomia[] {
  return [...taxonomia.options]
    .sort(
      (a, b) =>
        (b.usos ?? 0) - (a.usos ?? 0) || optionKey(a).localeCompare(optionKey(b), 'pt-BR'),
    )
    .slice(0, Math.max(1, maxOptions));
}

function listar(options: readonly OptionTaxonomia[]): string {
  return options
    .map((o) => {
      const description = o.description?.trim() ? ` — ${o.description.trim()}` : '';
      return `- ${optionKey(o)}${description}`;
    })
    .join('\n');
}

export const PROMPT_CLASSIFICATION: Prompt<InboundClassification> = {
  nome: 'classificacao',
  versao: 'v1',
  montar(inbound) {
    const options = prepararOptions(inbound.taxonomia, inbound.maxOptions);
    const intents = inbound.taxonomia.intents ?? [];
    const blockIntents = intents.length
      ? `\n\nIntenções aceitas (escolha exatamente uma):\n${intents.map((i) => `- ${i}`).join('\n')}`
      : '\n\nIntenção: descreva em até quatro palavras o que o cliente queria.';

    const aviso = inbound.truncada
      ? `\n\nAviso: ${inbound.messagesOmitidas} mensagens do meio foram omitidas por tamanho. Início e fim estão inteiros.`
      : '';
    const context = inbound.context?.trim() ? `Contexto: ${inbound.context.trim()}\n\n` : '';

    return {
      sistema: `Você classifica atendimentos encerrados de uma central de relacionamento brasileira.

Responda nesta ordem, e nesta ordem importa:

1. \`desfecho\`: uma frase dizendo o que o cliente pediu e o que o atendente fez a respeito. Só o que está na transcrição.
2. \`categoria\` e \`subcategoria\`: a opção da lista que melhor descreve **o desfecho que você acabou de escrever**, não o assunto mencionado de passagem.
3. \`intencao\` e \`sentimento\`.
4. \`confianca\`: entre 0 e 1. Use abaixo de 0,6 quando mais de uma opção couber — várias conversas têm mais de uma resposta defensável, e admitir isso vale mais do que fingir certeza.

Regras:
- \`categoria\` e \`subcategoria\` têm que sair **exatamente** como escritas na lista, sem reescrever, traduzir ou juntar. Opção fora da lista é resposta inválida.
- A opção sem subcategoria na lista responde com \`subcategoria\` nula.
- \`sentimento\` é o do cliente ao final: \`positivo\`, \`neutro\` ou \`negativo\`.
- Não classifique pelo canal, pelo produto citado ou pela saudação. Classifique pelo que ficou resolvido.

Opções válidas, das mais usadas para as menos usadas:
${listar(options)}${blockIntents}`,
      user: `${context}Transcrição:\n${inbound.transcription}${aviso}`,
    };
  },
};
