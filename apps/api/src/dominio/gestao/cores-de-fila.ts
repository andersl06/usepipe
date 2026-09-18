/**
 * As cores que uma fila pode ter.
 *
 * `fila.cor` é DADO do cliente — a etiqueta que ele reconhece no Desk —, não
 * estilo desta tela. Mesmo assim não é campo livre de hex: o seletor de cor
 * aberto é o que enche a interface de matiz que ninguém do design system
 * escolheu, e foi assim que a `etiqueta` acabou com nove hex diferentes na
 * semente.
 *
 * Então o conjunto é fechado e vem da paleta estendida do `@pipe/ui`
 * (`TEMA.grafico.serie`), a única que pode carregar matiz sem significar
 * estado. O banco guarda o NOME do token, nunca o hex: trocar a paleta no
 * `@pipe/ui` passa a valer para as filas já cadastradas, e nenhum literal de
 * cor entra no código da Gestão.
 */

export const CORES_DE_FILA = [
  { valor: 'grafico-1', rotulo: 'Sage' },
  { valor: 'grafico-2', rotulo: 'Azul profundo' },
  { valor: 'grafico-3', rotulo: 'Ocre' },
  { valor: 'grafico-4', rotulo: 'Terracota' },
  { valor: 'grafico-5', rotulo: 'Verde escuro' },
] as const;

export function corValida(valor: string): boolean {
  return CORES_DE_FILA.some((c) => c.valor === valor);
}

/**
 * O `var()` da cor guardada, ou `null` quando o valor não é da paleta.
 *
 * A semente antiga gravou hex direto em `fila.cor`. Esses valores continuam
 * legíveis, mas não viram bolinha: pintar com hex de dado seria a mesma cor
 * fora do token que a régua proíbe. Eles aparecem como texto, e o próximo
 * cadastro os substitui.
 */
export function corDaFila(valor: string | null): string | null {
  return valor !== null && corValida(valor) ? `var(--p-${valor})` : null;
}

export function rotuloDaCor(valor: string | null): string {
  if (valor === null) return 'Sem cor';
  return CORES_DE_FILA.find((c) => c.valor === valor)?.rotulo ?? `Fora da paleta (${valor})`;
}
