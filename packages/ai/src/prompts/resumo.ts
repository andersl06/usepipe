/**
 * Prompts de resumo. Dois, porque são duas perguntas diferentes:
 *
 * - **abertura**: o atendente que assume a conversa agora precisa saber o que já
 *   aconteceu e o que ficou pendente. Escreve-se para quem vai responder em seguida.
 * - **encerramento**: sobe para a linha do tempo do lead. Escreve-se para quem vai
 *   ler daqui a três meses sem abrir a conversa.
 */

import type { Prompt } from './tipos.js';

export interface EntradaResumo {
  transcricao: string;
  truncada: boolean;
  mensagensOmitidas: number;
  /** Teto de palavras do resumo. */
  maxPalavras?: number;
  /** Fila, produto, ou o que mais ajude o modelo a situar a conversa. */
  contexto?: string | null;
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

function avisoDeCorte(entrada: EntradaResumo): string {
  return entrada.truncada
    ? `\n\nAviso: ${entrada.mensagensOmitidas} mensagens do meio da conversa foram omitidas por tamanho. O início e o fim estão inteiros.`
    : '';
}

function bloco(entrada: EntradaResumo): string {
  const contexto = entrada.contexto?.trim() ? `Contexto: ${entrada.contexto.trim()}\n\n` : '';
  return `${contexto}Transcrição:\n${entrada.transcricao}${avisoDeCorte(entrada)}`;
}

/** Resumo de abertura: o que aconteceu antes, para quem está assumindo. */
export const PROMPT_RESUMO_ABERTURA: Prompt<EntradaResumo> = {
  nome: 'resumo-abertura',
  versao: 'v1',
  montar(entrada) {
    const max = entrada.maxPalavras ?? 80;
    return {
      sistema: `Você resume atendimentos para o atendente que está assumindo a conversa agora.

Ele não leu nada e vai responder ao cliente em seguida. Responda a três perguntas, nesta ordem, em no máximo ${max} palavras:
1. o que o cliente pediu;
2. o que já foi feito ou respondido;
3. o que ficou pendente ou combinado.

Se algum dos três não estiver na transcrição, omita — não invente e não escreva "não informado".

${REGRAS_COMUNS}`,
      usuario: bloco(entrada),
    };
  },
};

/** Resumo de encerramento: o que aconteceu agora, para a linha do tempo do lead. */
export const PROMPT_RESUMO_ENCERRAMENTO: Prompt<EntradaResumo> = {
  nome: 'resumo-encerramento',
  versao: 'v1',
  montar(entrada) {
    const max = entrada.maxPalavras ?? 60;
    return {
      sistema: `Você resume atendimentos encerrados para a linha do tempo do cliente no CRM.

Quem lê vai ver este texto meses depois, sem abrir a conversa. Em no máximo ${max} palavras, registre o motivo do contato e o desfecho: o que ficou resolvido, o que não ficou, e o que foi combinado.

O desfecho é a parte obrigatória. Se a conversa terminou sem desfecho claro, diga isso.

${REGRAS_COMUNS}`,
      usuario: bloco(entrada),
    };
  },
};
