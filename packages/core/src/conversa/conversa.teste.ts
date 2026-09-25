import { describe, expect, it } from 'vitest';

import {
  STATES_CONVERSATION,
  TransitionDeliveryInvalidError,
  TransitionInvalidError,
  aplicarEvento,
  eventStateAlvo,
  reproduzirEventos,
  tentarAplicarEvento,
  tentarTransitar,
  transitionDeliveryAllowed,
  transitionAllowed,
  transitar,
  transitarDelivery,
  type StateConversation,
  type StateDelivery,
} from './index.js';
import type { TipoEvento } from '../metricas/eventos.js';

/**
 * Tabela completa das 25 combinações do diagrama da §8.
 * `true` = aresta que existe no desenho; todo o resto tem de ser recusado.
 */
const PERMITIDAS: [StateConversation, StateConversation][] = [
  ['na_fila', 'atribuida'],
  ['na_fila', 'encerrada'],
  ['atribuida', 'em_atendimento'],
  ['atribuida', 'encerrada'],
  ['em_atendimento', 'em_espera'],
  ['em_atendimento', 'encerrada'],
  ['em_espera', 'em_atendimento'],
  ['em_espera', 'encerrada'],
  ['encerrada', 'na_fila'],
];

function ehPermitida(de: StateConversation, para: StateConversation): boolean {
  return PERMITIDAS.some(([d, p]) => d === de && p === para);
}

describe('conversation transition table', () => {
  for (const de of STATES_CONVERSATION) {
    for (const para of STATES_CONVERSATION) {
      const esperado = ehPermitida(de, para);
      it(`${de} → ${para} ${esperado ? 'é permitida' : 'é recusada'}`, () => {
        expect(transitionAllowed(de, para)).toBe(esperado);
      });
    }
  }

  it('no state transitions to itself', () => {
    for (const state of STATES_CONVERSATION) {
      expect(transitionAllowed(state, state)).toBe(false);
    }
  });

  it('transfer is not an edge: it exits through closed and opens a new conversation', () => {
    expect(transitionAllowed('atribuida', 'na_fila')).toBe(false);
    expect(transitionAllowed('em_atendimento', 'na_fila')).toBe(false);
    expect(transitionAllowed('atribuida', 'encerrada')).toBe(true);
  });
});

describe('transitar', () => {
  it('returns the new state when the transition exists', () => {
    expect(transitar('na_fila', 'atribuida')).toBe('atribuida');
  });

  it('throws a typed error when it does not exist', () => {
    expect(() => transitar('encerrada', 'em_atendimento')).toThrow(TransitionInvalidError);
    try {
      transitar('encerrada', 'em_atendimento');
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionInvalidError);
      const tipado = error as TransitionInvalidError;
      expect(tipado.codigo).toBe('transition_invalid');
      expect(tipado.de).toBe('encerrada');
      expect(tipado.para).toBe('em_atendimento');
      expect(tipado.message).toContain('encerrada');
    }
  });

  it('the no-exception version returns the error in the result', () => {
    expect(tentarTransitar('na_fila', 'atribuida')).toEqual({ ok: true, estado: 'atribuida' });
    const recusa = tentarTransitar('na_fila', 'em_espera');
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.error).toBeInstanceOf(TransitionInvalidError);
  });
});

describe('target state of each event', () => {
  const casos: [TipoEvento, StateConversation | null][] = [
    ['criada', 'na_fila'],
    ['enfileirada', 'na_fila'],
    ['atribuida', 'atribuida'],
    ['reatribuida', 'atribuida'],
    ['primeira_resposta', 'em_atendimento'],
    ['espera_iniciada', 'em_espera'],
    ['espera_encerrada', 'em_atendimento'],
    ['encerrada', 'encerrada'],
    ['reaberta', 'na_fila'],
    ['mensagem_entrada', null],
    ['mensagem_saida', null],
    ['transferida_fila', null],
    ['sla_alertado', null],
    ['sla_estourado', null],
    ['avaliada', null],
    ['pesquisa_respondida', null],
  ];

  for (const [tipo, esperado] of casos) {
    it(`${tipo} → ${esperado ?? 'não mexe no estado'}`, () => {
      expect(eventStateAlvo(tipo)).toBe(esperado);
    });
  }
});

describe('aplicar evento', () => {
  const caminhoFeliz: { de: StateConversation; tipo: TipoEvento; para: StateConversation }[] = [
    { de: 'na_fila', tipo: 'atribuida', para: 'atribuida' },
    { de: 'atribuida', tipo: 'primeira_resposta', para: 'em_atendimento' },
    { de: 'em_atendimento', tipo: 'espera_iniciada', para: 'em_espera' },
    { de: 'em_espera', tipo: 'espera_encerrada', para: 'em_atendimento' },
    { de: 'em_atendimento', tipo: 'encerrada', para: 'encerrada' },
    { de: 'encerrada', tipo: 'reaberta', para: 'na_fila' },
    { de: 'na_fila', tipo: 'encerrada', para: 'encerrada' },
  ];

  for (const caso of caminhoFeliz) {
    it(`${caso.de} + ${caso.tipo} = ${caso.para}`, () => {
      expect(aplicarEvento(caso.de, { tipo: caso.tipo })).toEqual({ estado: caso.para, mudou: true });
    });
  }

  it('an event that maps to no state never changes state', () => {
    for (const state of STATES_CONVERSATION) {
      expect(aplicarEvento(state, { tipo: 'mensagem_entrada' })).toEqual({ state, mudou: false });
      expect(aplicarEvento(state, { tipo: 'sla_alertado' })).toEqual({ state, mudou: false });
    }
  });

  it('webhook redelivery is idempotent, it does not turn into an exception', () => {
    expect(aplicarEvento('encerrada', { tipo: 'encerrada' })).toEqual({
      estado: 'encerrada',
      mudou: false,
    });
    expect(aplicarEvento('em_espera', { tipo: 'espera_iniciada' })).toEqual({
      estado: 'em_espera',
      mudou: false,
    });
  });

  describe('a customer event never takes the conversation to an invalid state', () => {
    const recusas: { nome: string; de: StateConversation; tipo: TipoEvento }[] = [
      { nome: 'fluxo tenta pôr em espera uma conversa já encerrada', de: 'encerrada', tipo: 'espera_iniciada' },
      { nome: 'resposta em conversa que ainda está na fila', de: 'na_fila', tipo: 'primeira_resposta' },
      { nome: 'fim de espera em conversa que nunca esteve em atendimento', de: 'na_fila', tipo: 'espera_encerrada' },
      { nome: 'atribuição de conversa já encerrada', de: 'encerrada', tipo: 'atribuida' },
      { nome: 'conversa encerrada não volta a atender sem reabrir', de: 'encerrada', tipo: 'espera_encerrada' },
      { nome: 'reabertura de conversa que está em atendimento', de: 'em_atendimento', tipo: 'reaberta' },
    ];

    for (const caso of recusas) {
      it(caso.nome, () => {
        expect(() => aplicarEvento(caso.de, { tipo: caso.tipo })).toThrow(TransitionInvalidError);
        const tentativa = tentarAplicarEvento(caso.de, { tipo: caso.tipo });
        expect(tentativa.ok).toBe(false);
        if (!tentativa.ok) {
          expect(tentativa.error.de).toBe(caso.de);
          expect(tentativa.error.evento).toBe(caso.tipo);
        }
      });
    }
  });

  it('reproduces an entire lifecycle', () => {
    const ciclo: TipoEvento[] = [
      'criada',
      'mensagem_entrada',
      'atribuida',
      'primeira_resposta',
      'mensagem_entrada',
      'espera_iniciada',
      'espera_encerrada',
      'sla_alertado',
      'encerrada',
      'pesquisa_respondida',
    ];
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('encerrada');
  });

  it('reopened goes back to the queue and the cycle restarts', () => {
    const ciclo: TipoEvento[] = ['criada', 'atribuida', 'encerrada', 'reaberta', 'atribuida'];
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('atribuida');
  });
});

describe('outbound message state machine', () => {
  const permitidas: [StateDelivery, StateDelivery][] = [
    ['pending', 'enviando'],
    ['enviando', 'enviada'],
    ['enviando', 'falhou'],
    ['enviada', 'entregue'],
    ['enviada', 'lida'],
    ['enviada', 'falhou'],
    ['entregue', 'lida'],
    ['falhou', 'pending'],
  ];

  const todos: StateDelivery[] = ['pending', 'enviando', 'enviada', 'entregue', 'lida', 'falhou'];

  for (const de of todos) {
    for (const para of todos) {
      const esperado = permitidas.some(([d, p]) => d === de && p === para);
      it(`${de} → ${para} ${esperado ? 'é permitida' : 'é recusada'}`, () => {
        expect(transitionDeliveryAllowed(de, para)).toBe(esperado);
      });
    }
  }

  it('resending takes it out of failed and returns it to the outbound queue', () => {
    expect(transitarDelivery('falhou', 'pending')).toBe('pendente');
  });

  it('lida é terminal', () => {
    expect(() => transitarDelivery('lida', 'entregue')).toThrow(TransitionDeliveryInvalidError);
  });
});
