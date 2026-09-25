/** `{{1}}`, `{{2}}`… de um modelo aprovado trocados pelos valores digitados, para a pré-visualização. */
export function aplicarParametros(corpo: string, values: readonly string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] || `{{${n}}}`);
}
