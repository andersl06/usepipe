/**
 * As cinco métricas de tempo da §2 da spec de métricas.
 *
 * Todas devolvem `{ valor, populacao, excluidas, soma }`: o denominador viaja
 * junto do número, sempre.
 *
 * Regra comum a todas: intervalo negativo é dado inconsistente (evento fora de
 * ordem), a conversa sai do denominador e entra em `excluidas`. Preferimos
 * encolher a população a publicar tempo negativo ou zerado à força.
 */

import { resultado, type ResultadoMetrica } from '../comum/tipos.js';
import { segundosEntre } from '../comum/time.js';
import {
  derivarMarcos,
  intervalosDeResposta,
  type ConversationEvents,
  type Marcos,
} from './eventos.js';

/** Tempo de resposta expõe também quantas conversas sustentaram os intervalos. */
export interface ResponseTimeResult extends ResultadoMetrica {
  /** Conversas com pelo menos uma troca completa — a população da spec §2. */
  conversationsConsideradas: number;
}

function acumular(
  conversations: readonly ConversationEvents[],
  medir: (marcos: Marcos) => number | null,
): ResultadoMetrica {
  let soma = 0;
  let population = 0;
  let excluidas = 0;

  for (const conversation of conversations) {
    const medida = medir(derivarMarcos(conversation));
    if (medida === null || Number.isNaN(medida) || medida < 0) {
      excluidas += 1;
      continue;
    }
    soma += medida;
    population += 1;
  }

  return resultado(soma, population, excluidas);
}

/**
 * Tempo na fila = `atribuida_em − criada_em`.
 * População: conversas que chegaram a ser atribuídas.
 */
export function timeInQueue(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.criadaEm && m.atribuidaEm ? segundosEntre(m.criadaEm, m.atribuidaEm) : null,
  );
}

/**
 * Tempo até a 1ª resposta = `primeira_resposta_em − atribuida_em`.
 * População: conversas que tiveram resposta do atendente.
 *
 * Conversa respondida sem nenhuma atribuição registrada não tem como entrar
 * nesta fórmula e conta como excluída — o número fica ao lado da média,
 * conforme a divergência declarada em §2.
 */
export function timeAteFirstResposta(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.atribuidaEm && m.firstRespostaIn ? segundosEntre(m.atribuidaEm, m.firstRespostaIn) : null,
  );
}

/**
 * Tempo total de espera do cliente.
 * Com resposta: `primeira_resposta_em − criada_em`.
 * Sem resposta: `encerrada_em − criada_em`.
 * População: todas as conversas encerradas no período.
 *
 * Conversa ainda aberta e sem resposta não tem fim de espera e fica de fora.
 */
export function timeTotalOfEsperaOfCliente(
  conversations: readonly ConversationEvents[],
): ResultadoMetrica {
  return acumular(conversations, (m) => {
    if (!m.criadaEm) return null;
    if (m.firstRespostaIn) return segundosEntre(m.criadaEm, m.firstRespostaIn);
    if (m.encerradaEm) return segundosEntre(m.criadaEm, m.encerradaEm);
    return null;
  });
}

/**
 * Tempo de resposta = média dos intervalos "mensagem do cliente → próxima
 * mensagem do atendente".
 *
 * Ambiguidade resolvida: a spec chama de população "conversas com pelo menos uma
 * troca completa", mas a fórmula é média **de intervalos**. Para não quebrar a
 * regra de §5 (soma ÷ contagem, nunca média de médias), o denominador de `valor`
 * é a quantidade de intervalos, e a contagem de conversas viaja em
 * `conversasConsideradas`. `excluidas` conta conversas sem troca completa.
 */
export function respostaTime(conversations: readonly ConversationEvents[]): ResponseTimeResult {
  let soma = 0;
  let intervalos = 0;
  let conversationsConsidered = 0;
  let excluidas = 0;

  for (const conversation of conversations) {
    const medidas = intervalosDeResposta(conversation).filter((s) => s >= 0);
    if (medidas.length === 0) {
      excluidas += 1;
      continue;
    }
    conversationsConsidered += 1;
    for (const medida of medidas) {
      soma += medida;
      intervalos += 1;
    }
  }

  return { ...resultado(soma, intervalos, excluidas), conversationsConsideradas: conversationsConsidered };
}

/**
 * Tempo de atendimento = `encerrada_em − primeira_resposta_em`.
 * População: conversas que tiveram 1ª resposta (e já encerraram).
 *
 * É a métrica que a Blip embeleza descartando as conversas nunca respondidas.
 * Aqui a fórmula é a mesma para ser comparável, mas `excluidas` sai junto e é
 * obrigatória na tela.
 */
export function attendanceTime(conversations: readonly ConversationEvents[]): ResultadoMetrica {
  return acumular(conversations, (m) =>
    m.firstRespostaIn && m.encerradaEm ? segundosEntre(m.firstRespostaIn, m.encerradaEm) : null,
  );
}
