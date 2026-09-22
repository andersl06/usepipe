import type { ItemDaConversa } from '@pipe/contracts';

const INTERVALO_NORMAL_MS = 15_000;
const INTERVALO_EM_TRANSITO_MS = 1_000;

export function intervaloDaEntrega(itens: ItemDaConversa[] | undefined): number {
  return itens?.some(
    (item) =>
      item.genero === 'mensagem' &&
      (item.estadoEntrega === 'pendente' || item.estadoEntrega === 'enviando'),
  )
    ? INTERVALO_EM_TRANSITO_MS
    : INTERVALO_NORMAL_MS;
}
