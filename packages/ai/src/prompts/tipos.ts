/**
 * Todo prompt do pacote vive num arquivo próprio, tem nome e tem **versão**.
 *
 * A versão não é enfeite: a bancada (`bancada/`) compara versões de prompt contra
 * o mesmo conjunto de referência. Sem versão, "melhorou" é opinião — que é
 * exatamente o que a bancada do case-sync existe para impedir.
 *
 * Convenção da versão: `v<n>` incrementada a cada mudança de texto que possa
 * alterar a saída. Trocar vírgula conta.
 */

export interface TextoPrompt {
  sistema: string;
  usuario: string;
}

export interface Prompt<E> {
  nome: string;
  versao: string;
  montar(entrada: E): TextoPrompt;
}

/** Identificador que vai para o registro: `resumo-encerramento@v1`. */
export function identificador(prompt: Prompt<unknown>): string {
  return `${prompt.nome}@${prompt.versao}`;
}
