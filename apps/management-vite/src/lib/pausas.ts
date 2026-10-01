/** Limites do modal "Criar nova pausa personalizada": os mesmos que o servidor aplica. */
export const NOME_DA_PAUSA_MAX = 30;
export const DURACAO_DA_PAUSA_MAX = 999;

/** Duração em minutos digitada, ou `null` se vazia, fracionada ou fora de 1 a 999. */
export function duracaoDaPausa(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 && n <= DURACAO_DA_PAUSA_MAX ? n : null;
}
