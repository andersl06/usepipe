/**
 * Each package prompt has its own file, name, and version. The bench (`bancada/`) compares prompt versions against the same reference set; without versions, improvement is only opinion, the failure case-sync's bench was built to prevent. Increment `v<n>` for every text change that could affect output, including punctuation.
 */

export interface TextoPrompt {
  sistema: string;
  user: string;
}

export interface Prompt<E> {
  nome: string;
  versao: string;
  montar(inbound: E): TextoPrompt;
}

/** Identifier written to the record, such as `resumo-encerramento@v1`. */
export function identificador(prompt: Prompt<unknown>): string {
  return `${prompt.nome}@${prompt.versao}`;
}
