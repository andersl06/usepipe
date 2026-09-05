/**
 * Máquina de estados da conversa — §8 do modelo de dados.
 *
 *         ┌──────────────── reaberta ─────────────────┐
 *         ▼                                           │
 *     na_fila ──► atribuida ──► em_atendimento ──► encerrada
 *         │            │              │  ▲
 *         │            │              ▼  │
 *         │            │           em_espera
 *         │            │
 *         └────────────┴──────────► encerrada (perdida / abandonada)
 *
 * Transferência **não** é transição: ela encerra a conversa com
 * `encerrada_por = transferencia` e abre outra no destino (regras da Blip §2.6,
 * medido em produção). Por isso não existe aresta de volta para `na_fila` a
 * partir de `atribuida`.
 *
 * Evento vindo do cliente não pode levar a conversa a estado inválido — é
 * exatamente o bug "ticket encerrado pelo usuário em fluxo humano" que a
 * comunidade da Blip reclama.
 */

import type { EventoAtendimento, TipoEvento } from '../metricas/eventos.js';

export type EstadoConversa =
  | 'na_fila'
  | 'atribuida'
  | 'em_atendimento'
  | 'em_espera'
  | 'encerrada';

export const ESTADOS_CONVERSA: readonly EstadoConversa[] = [
  'na_fila',
  'atribuida',
  'em_atendimento',
  'em_espera',
  'encerrada',
];

/** Transições permitidas, exatamente as do diagrama da §8. */
export const TRANSICOES: Readonly<Record<EstadoConversa, readonly EstadoConversa[]>> = {
  na_fila: ['atribuida', 'encerrada'],
  atribuida: ['em_atendimento', 'encerrada'],
  em_atendimento: ['em_espera', 'encerrada'],
  em_espera: ['em_atendimento', 'encerrada'],
  encerrada: ['na_fila'],
};

/** Erro tipado de transição inválida. Nada de `throw new Error('opa')`. */
export class TransicaoInvalidaError extends Error {
  readonly codigo = 'transicao_invalida' as const;
  readonly de: EstadoConversa;
  readonly para: EstadoConversa;
  readonly evento?: TipoEvento;

  constructor(de: EstadoConversa, para: EstadoConversa, evento?: TipoEvento) {
    const porCausaDe = evento ? ` (evento ${evento})` : '';
    super(`Transição inválida de ${de} para ${para}${porCausaDe}`);
    this.name = 'TransicaoInvalidaError';
    this.de = de;
    this.para = para;
    if (evento) this.evento = evento;
  }
}

export function transicaoPermitida(de: EstadoConversa, para: EstadoConversa): boolean {
  return TRANSICOES[de].includes(para);
}

/** Transita ou lança `TransicaoInvalidaError`. */
export function transitar(de: EstadoConversa, para: EstadoConversa): EstadoConversa {
  if (!transicaoPermitida(de, para)) throw new TransicaoInvalidaError(de, para);
  return para;
}

export type Tentativa<T> =
  | { ok: true; estado: T }
  | { ok: false; erro: TransicaoInvalidaError };

/** Versão sem exceção, para o caminho quente do consumidor de eventos. */
export function tentarTransitar(
  de: EstadoConversa,
  para: EstadoConversa,
): Tentativa<EstadoConversa> {
  if (!transicaoPermitida(de, para)) {
    return { ok: false, erro: new TransicaoInvalidaError(de, para) };
  }
  return { ok: true, estado: para };
}

/**
 * Estado de destino de cada tipo de evento. `null` = evento que não mexe no
 * estado (mensagem do cliente, alerta de SLA, avaliação, transferência de fila
 * registrada como histórico).
 */
export function estadoAlvoDoEvento(tipo: TipoEvento): EstadoConversa | null {
  switch (tipo) {
    case 'criada':
    case 'enfileirada':
      return 'na_fila';
    case 'atribuida':
    case 'reatribuida':
      return 'atribuida';
    case 'primeira_resposta':
      return 'em_atendimento';
    case 'espera_iniciada':
      return 'em_espera';
    case 'espera_encerrada':
      return 'em_atendimento';
    case 'encerrada':
      return 'encerrada';
    case 'reaberta':
      return 'na_fila';
    default:
      return null;
  }
}

export interface ResultadoAplicacao {
  estado: EstadoConversa;
  mudou: boolean;
}

/**
 * Aplica um evento ao estado corrente.
 *
 * Regras que sustentam a garantia da §4.3 do desenho do produto:
 * - evento que não mapeia estado nunca muda estado, seja de quem for;
 * - evento que mapeia o **mesmo** estado corrente é idempotente e não erra —
 *   reentrega de webhook é normal e não pode virar exceção;
 * - qualquer outro destino passa pela tabela de transições e, se não for
 *   permitido, lança `TransicaoInvalidaError`.
 */
export function aplicarEvento(
  estadoAtual: EstadoConversa,
  evento: Pick<EventoAtendimento, 'tipo'>,
): ResultadoAplicacao {
  const alvo = estadoAlvoDoEvento(evento.tipo);
  if (alvo === null) return { estado: estadoAtual, mudou: false };
  if (alvo === estadoAtual) return { estado: estadoAtual, mudou: false };
  if (!transicaoPermitida(estadoAtual, alvo)) {
    throw new TransicaoInvalidaError(estadoAtual, alvo, evento.tipo);
  }
  return { estado: alvo, mudou: true };
}

/** Versão sem exceção de `aplicarEvento`. */
export function tentarAplicarEvento(
  estadoAtual: EstadoConversa,
  evento: Pick<EventoAtendimento, 'tipo'>,
): Tentativa<ResultadoAplicacao> {
  try {
    return { ok: true, estado: aplicarEvento(estadoAtual, evento) };
  } catch (erro) {
    if (erro instanceof TransicaoInvalidaError) return { ok: false, erro };
    throw erro;
  }
}

/**
 * Reproduz uma sequência de eventos a partir de um estado inicial.
 * Serve para recalcular o passado — a razão de os eventos serem imutáveis.
 */
export function reproduzirEventos(
  eventos: readonly Pick<EventoAtendimento, 'tipo'>[],
  estadoInicial: EstadoConversa = 'na_fila',
): EstadoConversa {
  let estado = estadoInicial;
  for (const evento of eventos) {
    estado = aplicarEvento(estado, evento).estado;
  }
  return estado;
}

// --- Máquina da mensagem de saída (§8, segundo diagrama) ---

export type EstadoEntrega = 'pendente' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export const TRANSICOES_ENTREGA: Readonly<Record<EstadoEntrega, readonly EstadoEntrega[]>> = {
  pendente: ['enviando'],
  enviando: ['enviada', 'falhou'],
  enviada: ['entregue', 'lida', 'falhou'],
  entregue: ['lida'],
  lida: [],
  // Reenviar volta para a fila de saída — nunca falha em silêncio.
  falhou: ['pendente'],
};

export class TransicaoEntregaInvalidaError extends Error {
  readonly codigo = 'transicao_entrega_invalida' as const;
  readonly de: EstadoEntrega;
  readonly para: EstadoEntrega;

  constructor(de: EstadoEntrega, para: EstadoEntrega) {
    super(`Transição de entrega inválida de ${de} para ${para}`);
    this.name = 'TransicaoEntregaInvalidaError';
    this.de = de;
    this.para = para;
  }
}

export function transicaoEntregaPermitida(de: EstadoEntrega, para: EstadoEntrega): boolean {
  return TRANSICOES_ENTREGA[de].includes(para);
}

export function transitarEntrega(de: EstadoEntrega, para: EstadoEntrega): EstadoEntrega {
  if (!transicaoEntregaPermitida(de, para)) throw new TransicaoEntregaInvalidaError(de, para);
  return para;
}
