import type { ConversationOfHistory, PassagemDoBot } from '@pipe/contracts';

/** Uma linha do histórico do contato: ticket ou passagem pelo bot que nunca virou ticket. */
export type EntradaDoHistorico =
  | { tipo: 'ticket'; chave: string; em: string; ticket: ConversationOfHistory }
  | { tipo: 'bot'; chave: string; em: string; passagem: PassagemDoBot };

/** Tickets e passagens pelo bot numa lista só, da mais recente para a mais antiga. */
export function entradasDoHistorico(
  history: readonly ConversationOfHistory[],
  botPassages: readonly PassagemDoBot[],
): EntradaDoHistorico[] {
  const entradas: EntradaDoHistorico[] = [
    ...history.map((ticket) => ({ tipo: 'ticket' as const, chave: `t-${ticket.id}`, em: ticket.criadaEm, ticket })),
    ...botPassages.map((passagem) => ({ tipo: 'bot' as const, chave: `b-${passagem.id}`, em: passagem.iniciadaEm, passagem })),
  ];
  return entradas.sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime());
}

/** Caminho que lê as mensagens de uma passagem pelo bot. */
export function caminhoDaPassagem(contactId: string, passagem: PassagemDoBot): string {
  const q = new URLSearchParams({ inicio: passagem.iniciadaEm, fim: passagem.encerradaEm });
  return `/v1/desk/contacts/${encodeURIComponent(contactId)}/bot-passages/${encodeURIComponent(passagem.executionId)}?${q}`;
}

/** Resumo de uma linha: quantas mensagens e onde o bot parou. */
export function resumoDaPassagem(passagem: PassagemDoBot): string {
  const n = passagem.mensagens;
  const mensagens = `${n} ${n === 1 ? 'mensagem' : 'mensagens'}`;
  return passagem.ultimoBlocoNome ? `${mensagens} · parou em ${passagem.ultimoBlocoNome}` : mensagens;
}
