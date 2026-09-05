/** Utilidades de tempo. Tudo em segundos; nada de milissegundos vazando para fora. */

export const SEGUNDO = 1;
export const MINUTO = 60;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;

/** Segundos entre dois instantes. Pode ser negativo — quem chama decide o que fazer com isso. */
export function segundosEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / 1000;
}

/** Soma segundos a um instante. */
export function somarSegundos(instante: Date, segundos: number): Date {
  return new Date(instante.getTime() + segundos * 1000);
}

/** Ordena instantes em ordem crescente, sem mutar a lista recebida. */
export function ordenarInstantes(instantes: readonly Date[]): Date[] {
  return [...instantes].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Comparação estável de identificador, por ponto de código.
 *
 * `localeCompare` depende de locale e ICU e por isso não serve como desempate
 * final de distribuição — o resultado precisa ser o mesmo em qualquer máquina.
 */
export function compararIdentificador(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
