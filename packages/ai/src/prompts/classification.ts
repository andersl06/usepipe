/**
 * Classification prompt choices follow case-sync measurements that raised accuracy from 26% to 64%: order and prune options by observed use (+22.6 percentage points); ask for a one-sentence `desfecho` before a label (+4.3 points), preserving schema property order; omit similarity examples and distilled definitions, which reduced accuracy when combined with the prior. Taxonomy is supplied as a parameter, never hard-coded.
 */

import type { Prompt } from './tipos.js';

export interface OptionTaxonomy {
  categoria: string;
  subcategoria?: string | null;
  description?: string | null;
  /** How often a human chose this option; used to order and prune the list. */
  usos?: number | null;
}

export interface Taxonomia {
  options: readonly OptionTaxonomy[];
  /** Accepted intents; when empty, the model answers freely. */
  intents?: readonly string[];
}

export interface InboundClassification {
  transcription: string;
  truncada: boolean;
  messagesOmitted: number;
  taxonomia: Taxonomia;
  /** Maximum options shown; an overly long list dilutes the choice. */
  maxOptions?: number;
  context?: string | null;
}

export const MAX_OPTIONS_DEFAULT = 40;

/** Option's text key, as shown in the list and returned in the answer. */
export function optionKey(o: OptionTaxonomy): string {
  return o.subcategoria?.trim() ? `${o.categoria} > ${o.subcategoria}` : o.categoria;
}

/**
 * Sorts by observed use descending and prunes to the limit, breaking ties alphabetically for stable runs; a prompt that changes by itself cannot be measured.
 */
export function prepareOptions(
  taxonomia: Taxonomia,
  maxOptions = MAX_OPTIONS_DEFAULT,
): OptionTaxonomy[] {
  return [...taxonomia.options]
    .sort(
      (a, b) =>
        (b.usos ?? 0) - (a.usos ?? 0) || optionKey(a).localeCompare(optionKey(b), 'pt-BR'),
    )
    .slice(0, Math.max(1, maxOptions));
}

function listar(options: readonly OptionTaxonomy[]): string {
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
    const options = prepareOptions(inbound.taxonomia, inbound.maxOptions);
    const intents = inbound.taxonomia.intents ?? [];
    const blockIntents = intents.length
      ? `\n\nIntenções aceitas (escolha exatamente uma):\n${intents.map((i) => `- ${i}`).join('\n')}`
      : '\n\nIntenção: descreva em até quatro palavras o que o cliente queria.';

    const aviso = inbound.truncada
      ? `\n\nAviso: ${inbound.messagesOmitted} mensagens do meio foram omitidas por tamanho. Início e fim estão inteiros.`
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
