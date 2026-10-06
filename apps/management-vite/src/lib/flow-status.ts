/**
 * Whether a bot shows as "no ar" (no red dot): a published flow, or a router with an active channel linked. A router has no publish step of its own, so a connected channel is what puts it on the air.
 */
export function isOnline(flow: { estado: string; tipo: string; canalAtivo?: boolean | null }): boolean {
  return flow.estado === 'publicado' || (flow.tipo === 'roteador' && flow.canalAtivo === true);
}
