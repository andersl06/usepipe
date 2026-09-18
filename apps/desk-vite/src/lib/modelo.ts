/** `{{1}}`, `{{2}}`… de um modelo aprovado trocados pelos valores digitados, para a pré-visualização. */
export function aplicarParametros(corpo: string, valores: readonly string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => valores[Number(n) - 1] || `{{${n}}}`);
}
