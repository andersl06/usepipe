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

export interface OpcaoTaxonomia {
  categoria: string;
  subcategoria?: string | null;
  descricao?: string | null;
  /** Quantas vezes um humano escolheu esta opção. É o que ordena e poda a lista. */
  usos?: number | null;
}

export interface Taxonomia {
  opcoes: readonly OpcaoTaxonomia[];
  /** Intenções aceitas. Vazio, o modelo responde livre. */
  intencoes?: readonly string[];
}

export interface EntradaClassificacao {
  transcricao: string;
  truncada: boolean;
  mensagensOmitidas: number;
  taxonomia: Taxonomia;
  /** Teto de opções apresentadas. Lista longa demais dilui a escolha. */
  maxOpcoes?: number;
  contexto?: string | null;
}

export const MAX_OPCOES_PADRAO = 40;

/** Chave textual de uma opção, do jeito que ela aparece na lista e volta na resposta. */
export function chaveDaOpcao(o: OpcaoTaxonomia): string {
  return o.subcategoria?.trim() ? `${o.categoria} > ${o.subcategoria}` : o.categoria;
}

/**
 * Ordena por uso real (desc) e poda ao teto, com desempate alfabético para a lista
 * ser estável entre execuções — prompt que muda sozinho não pode ser medido.
 */
export function prepararOpcoes(
  taxonomia: Taxonomia,
  maxOpcoes = MAX_OPCOES_PADRAO,
): OpcaoTaxonomia[] {
  return [...taxonomia.opcoes]
    .sort(
      (a, b) =>
        (b.usos ?? 0) - (a.usos ?? 0) || chaveDaOpcao(a).localeCompare(chaveDaOpcao(b), 'pt-BR'),
    )
    .slice(0, Math.max(1, maxOpcoes));
}

function listar(opcoes: readonly OpcaoTaxonomia[]): string {
  return opcoes
    .map((o) => {
      const descricao = o.descricao?.trim() ? ` — ${o.descricao.trim()}` : '';
      return `- ${chaveDaOpcao(o)}${descricao}`;
    })
    .join('\n');
}

export const PROMPT_CLASSIFICACAO: Prompt<EntradaClassificacao> = {
  nome: 'classificacao',
  versao: 'v1',
  montar(entrada) {
    const opcoes = prepararOpcoes(entrada.taxonomia, entrada.maxOpcoes);
    const intencoes = entrada.taxonomia.intencoes ?? [];
    const blocoIntencoes = intencoes.length
      ? `\n\nIntenções aceitas (escolha exatamente uma):\n${intencoes.map((i) => `- ${i}`).join('\n')}`
      : '\n\nIntenção: descreva em até quatro palavras o que o cliente queria.';

    const aviso = entrada.truncada
      ? `\n\nAviso: ${entrada.mensagensOmitidas} mensagens do meio foram omitidas por tamanho. Início e fim estão inteiros.`
      : '';
    const contexto = entrada.contexto?.trim() ? `Contexto: ${entrada.contexto.trim()}\n\n` : '';

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
${listar(opcoes)}${blocoIntencoes}`,
      usuario: `${contexto}Transcrição:\n${entrada.transcricao}${aviso}`,
    };
  },
};
