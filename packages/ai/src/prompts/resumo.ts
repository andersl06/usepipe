/**
 * Two summary prompts serve different readers: opening summarizes prior events and pending work for the agent taking over now; closing summarizes the current outcome for someone reading the lead timeline months later.
 */

import type { Prompt } from './tipos.js';

export interface InboundSummary {
  transcription: string;
  truncada: boolean;
  messagesOmitidas: number;
  /** Teto de palavras do resumo. */
  maxPalavras?: number;
  /** Queue, product, or other context that helps the model situate the conversation. */
  context?: string | null;
}

const REGRAS_COMUNS = `
Regras que valem sempre:
- Escreva em português do Brasil, na terceira pessoa, em tom factual.
- Só afirme o que está na transcrição. Não deduza intenção, humor nem resultado.
- Onde a linha disser "NÃO TRANSCRITO", trate como conteúdo desconhecido: se algo
  importante aconteceu ali, diga que há áudio não transcrito no meio do atendimento.
- Nada de saudação, de meta-comentário ("neste atendimento o cliente...") nem de
  recomendação. O resumo é registro, não opinião.
- Sem markdown, sem lista, sem título. Texto corrido.
`.trim();

function avisoDeCorte(inbound: InboundSummary): string {
  return inbound.truncada
    ? `\n\nAviso: ${inbound.messagesOmitidas} mensagens do meio da conversa foram omitidas por tamanho. O início e o fim estão inteiros.`
    : '';
}

function block(inbound: InboundSummary): string {
  const context = inbound.context?.trim() ? `Contexto: ${inbound.context.trim()}\n\n` : '';
  return `${context}Transcrição:\n${inbound.transcription}${avisoDeCorte(inbound)}`;
}

/** Opening summary: prior events for the agent taking over. */
export const PROMPT_RESUMO_ABERTURA: Prompt<InboundSummary> = {
  nome: 'resumo-abertura',
  versao: 'v1',
  montar(inbound) {
    const max = inbound.maxPalavras ?? 80;
    return {
      sistema: `Você resume atendimentos para o atendente que está assumindo a conversa agora.

Ele não leu nada e vai responder ao cliente em seguida. Responda a três perguntas, nesta ordem, em no máximo ${max} palavras:
1. o que o cliente pediu;
2. o que já foi feito ou respondido;
3. o que ficou pendente ou combinado.

Se algum dos três não estiver na transcrição, omita — não invente e não escreva "não informado".

${REGRAS_COMUNS}`,
      user: block(inbound),
    };
  },
};

/** Closing summary: current events for the lead timeline. */
export const PROMPT_SUMMARY_CLOSURE: Prompt<InboundSummary> = {
  nome: 'resumo-encerramento',
  versao: 'v1',
  montar(inbound) {
    const max = inbound.maxPalavras ?? 60;
    return {
      sistema: `Você resume atendimentos encerrados para a linha do tempo do cliente no CRM.

Quem lê vai ver este texto meses depois, sem abrir a conversa. Em no máximo ${max} palavras, registre o motivo do contato e o desfecho: o que ficou resolvido, o que não ficou, e o que foi combinado.

O desfecho é a parte obrigatória. Se a conversa terminou sem desfecho claro, diga isso.

${REGRAS_COMUNS}`,
      user: block(inbound),
    };
  },
};
