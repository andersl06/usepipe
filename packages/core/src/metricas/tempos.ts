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
import { segundosEntre } from '../comum/tempo.js';
import {
  derivarMarcos,
  intervalosDeResposta,
  type ConversaEventos,
  type Marcos,
} from './eventos.js';

/** Tempo de resposta expõe também quantas conversas sustentaram os intervalos. */
export interface ResultadoTempoDeResposta extends ResultadoMetrica {
  /** Conversas com pelo menos uma troca completa — a população da spec §2. */
  conversasConsideradas: number;
}

function acumular(
  conversas: readonly ConversaEventos[],
  medir: (marcos: Marcos) => number | null,
): ResultadoMetrica {
  let soma = 0;
  let populacao = 0;
  let excluidas = 0;

  for (const conversa of conversas) {
    const medida = medir(derivarMarcos(conversa));
    if (medida === null || Number.isNaN(medida) || medida < 0) {
      excluidas += 1;
      continue;
    }
    soma += medida;
    populacao += 1;
  }

  return resultado(soma, populacao, excluidas);
}

/**
 * Tempo na fila = `atribuida_em − criada_em`.
 * População: conversas que chegaram a ser atribuídas.
 */
export function tempoNaFila(conversas: readonly ConversaEventos[]): ResultadoMetrica {
  return acumular(conversas, (m) =>
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
export function tempoAtePrimeiraResposta(conversas: readonly ConversaEventos[]): ResultadoMetrica {
  return acumular(conversas, (m) =>
    m.atribuidaEm && m.primeiraRespostaEm ? segundosEntre(m.atribuidaEm, m.primeiraRespostaEm) : null,
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
export function tempoTotalDeEsperaDoCliente(
  conversas: readonly ConversaEventos[],
): ResultadoMetrica {
  return acumular(conversas, (m) => {
    if (!m.criadaEm) return null;
    if (m.primeiraRespostaEm) return segundosEntre(m.criadaEm, m.primeiraRespostaEm);
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
export function tempoDeResposta(conversas: readonly ConversaEventos[]): ResultadoTempoDeResposta {
  let soma = 0;
  let intervalos = 0;
  let conversasConsideradas = 0;
  let excluidas = 0;

  for (const conversa of conversas) {
    const medidas = intervalosDeResposta(conversa).filter((s) => s >= 0);
    if (medidas.length === 0) {
      excluidas += 1;
      continue;
    }
    conversasConsideradas += 1;
    for (const medida of medidas) {
      soma += medida;
      intervalos += 1;
    }
  }

  return { ...resultado(soma, intervalos, excluidas), conversasConsideradas };
}

/**
 * Tempo de atendimento = `encerrada_em − primeira_resposta_em`.
 * População: conversas que tiveram 1ª resposta (e já encerraram).
 *
 * É a métrica que a Blip embeleza descartando as conversas nunca respondidas.
 * Aqui a fórmula é a mesma para ser comparável, mas `excluidas` sai junto e é
 * obrigatória na tela.
 */
export function tempoDeAtendimento(conversas: readonly ConversaEventos[]): ResultadoMetrica {
  return acumular(conversas, (m) =>
    m.primeiraRespostaEm && m.encerradaEm ? segundosEntre(m.primeiraRespostaEm, m.encerradaEm) : null,
  );
}
