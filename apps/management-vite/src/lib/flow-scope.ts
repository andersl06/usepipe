/** Anexa o fluxo aberto à URL de uma rota de gestão que exige `flowId`. */
export function withFlow(path: string, flowId: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}flowId=${encodeURIComponent(flowId)}`;
}
