import { describe, expect, it } from 'vitest';

import {
  SQL_STATES_ACTIVE,
  SQL_STATES_CLOSED,
  STATES_ACTIVE,
  STATES_CONVERSATION,
  TRANSITIONS,
  TransitionDeliveryInvalidError,
  TransitionInvalidError,
  aplicarEvento,
  closedStateOf,
  eventStateTarget,
  isClosedState,
  reproduzirEventos,
  tentarAplicarEvento,
  tentarTransitar,
  transitionDeliveryAllowed,
  transitionAllowed,
  transitar,
  transitionDelivery,
  type StateConversation,
  type StateDelivery,
} from './index.js';
import type { EventAttendance, TipoEvento } from '../metrics/eventos.js';

const FECHADOS: StateConversation[] = [
  'ClosedAttendant',
  'ClosedClient',
  'ClosedClientInactivity',
  'Transferred',
];

/** Arestas do diagrama; qualquer outra combinação deve ser recusada. */
const PERMITIDAS: [StateConversation, StateConversation][] = [
  ['Waiting', 'Assigned'],
  ['Assigned', 'Open'],
  ...(['Waiting', 'Assigned', 'Open'] as const).flatMap((de) =>
    FECHADOS.map((para) => [de, para] as [StateConversation, StateConversation]),
  ),
  ['ClosedAttendant', 'Waiting'],
  ['ClosedClient', 'Waiting'],
  ['ClosedClientInactivity', 'Waiting'],
];

function ehPermitida(de: StateConversation, para: StateConversation): boolean {
  return PERMITIDAS.some(([d, p]) => d === de && p === para);
}

describe('conversation transition table', () => {
  it('has the seven Blip states in order', () => {
    expect(STATES_CONVERSATION).toEqual([
      'Waiting',
      'Assigned',
      'Open',
      'ClosedAttendant',
      'ClosedClient',
      'ClosedClientInactivity',
      'Transferred',
    ]);
  });

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

  it('the removed bot state does not exist: no transition leaves from or leads to it', () => {
    const removido = ['com', 'bot'].join('_') as StateConversation;
    expect(STATES_CONVERSATION).not.toContain(removido);
    for (const state of STATES_CONVERSATION) expect(transitionAllowed(state, removido)).toBe(false);
  });

  it('standby is not an edge and Transferred never reopens', () => {
    expect(transitionAllowed('Open', 'Waiting')).toBe(false);
    expect(transitionAllowed('Assigned', 'Waiting')).toBe(false);
    expect(TRANSITIONS.Transferred).toEqual([]);
    expect(transitionAllowed('Transferred', 'Waiting')).toBe(false);
    expect(transitionAllowed('ClosedClient', 'Waiting')).toBe(true);
  });
});

describe('closed state helpers', () => {
  it('closedStateOf maps who closed to the Blip state', () => {
    expect(closedStateOf('atendente')).toBe('ClosedAttendant');
    expect(closedStateOf('cliente')).toBe('ClosedClient');
    expect(closedStateOf('inatividade')).toBe('ClosedClientInactivity');
    expect(closedStateOf('transferencia')).toBe('Transferred');
  });

  it('isClosedState and the SQL lists come from the same constants', () => {
    expect(isClosedState('Transferred')).toBe(true);
    expect(isClosedState('Open')).toBe(false);
    expect(STATES_ACTIVE).toEqual(['Waiting', 'Assigned', 'Open']);
    expect(SQL_STATES_CLOSED).toBe(
      "('ClosedAttendant', 'ClosedClient', 'ClosedClientInactivity', 'Transferred')",
    );
    expect(SQL_STATES_ACTIVE).toBe("('Waiting', 'Assigned', 'Open')");
  });
});

describe('transitar', () => {
  it('returns the new state when the transition exists', () => {
    expect(transitar('Waiting', 'Assigned')).toBe('Assigned');
  });

  it('throws a typed error when it does not exist', () => {
    expect(() => transitar('ClosedClient', 'Open')).toThrow(TransitionInvalidError);
    try {
      transitar('ClosedClient', 'Open');
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionInvalidError);
      const tipado = error as TransitionInvalidError;
      expect(tipado.codigo).toBe('transicao_invalida');
      expect(tipado.de).toBe('ClosedClient');
      expect(tipado.para).toBe('Open');
      expect(tipado.message).toContain('ClosedClient');
    }
  });

  it('the no-exception version returns the error in the result', () => {
    expect(tentarTransitar('Waiting', 'Assigned')).toEqual({ ok: true, state: 'Assigned' });
    const recusa = tentarTransitar('Waiting', 'Open');
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.error).toBeInstanceOf(TransitionInvalidError);
  });
});

describe('target state of each event', () => {
  const casos: [Pick<EventAttendance, 'tipo' | 'closedBy'>, StateConversation | null][] = [
    [{ tipo: 'criada' }, 'Waiting'],
    [{ tipo: 'enfileirada' }, 'Waiting'],
    [{ tipo: 'atribuida' }, 'Assigned'],
    [{ tipo: 'reatribuida' }, 'Assigned'],
    [{ tipo: 'primeira_resposta' }, 'Open'],
    [{ tipo: 'espera_iniciada' }, null],
    [{ tipo: 'espera_encerrada' }, null],
    [{ tipo: 'encerrada' }, 'ClosedAttendant'],
    [{ tipo: 'encerrada', closedBy: 'atendente' }, 'ClosedAttendant'],
    [{ tipo: 'encerrada', closedBy: 'cliente' }, 'ClosedClient'],
    [{ tipo: 'encerrada', closedBy: 'inatividade' }, 'ClosedClientInactivity'],
    [{ tipo: 'encerrada', closedBy: 'transferencia' }, 'Transferred'],
    [{ tipo: 'reaberta' }, 'Waiting'],
    [{ tipo: 'mensagem_entrada' }, null],
    [{ tipo: 'mensagem_saida' }, null],
    [{ tipo: 'transferida_fila' }, null],
    [{ tipo: 'sla_alertado' }, null],
    [{ tipo: 'sla_estourado' }, null],
    [{ tipo: 'avaliada' }, null],
    [{ tipo: 'pesquisa_respondida' }, null],
  ];

  for (const [evento, esperado] of casos) {
    const nome = `${evento.tipo}${evento.closedBy ? ` (${evento.closedBy})` : ''}`;
    it(`${nome} → ${esperado ?? 'não mexe no estado'}`, () => {
      expect(eventStateTarget(evento)).toBe(esperado);
    });
  }
});

describe('aplicar evento', () => {
  const caminhoFeliz: { de: StateConversation; tipo: TipoEvento; para: StateConversation }[] = [
    { de: 'Waiting', tipo: 'atribuida', para: 'Assigned' },
    { de: 'Assigned', tipo: 'primeira_resposta', para: 'Open' },
    { de: 'Open', tipo: 'encerrada', para: 'ClosedAttendant' },
    { de: 'ClosedAttendant', tipo: 'reaberta', para: 'Waiting' },
    { de: 'Waiting', tipo: 'encerrada', para: 'ClosedAttendant' },
  ];

  for (const caso of caminhoFeliz) {
    it(`${caso.de} + ${caso.tipo} = ${caso.para}`, () => {
      expect(aplicarEvento(caso.de, { tipo: caso.tipo })).toEqual({ state: caso.para, mudou: true });
    });
  }

  it('closing by transfer ends in Transferred', () => {
    expect(aplicarEvento('Open', { tipo: 'encerrada', closedBy: 'transferencia' })).toEqual({
      state: 'Transferred',
      mudou: true,
    });
  });

  it('standby events never change state', () => {
    expect(aplicarEvento('Open', { tipo: 'espera_iniciada' })).toEqual({ state: 'Open', mudou: false });
    expect(aplicarEvento('Open', { tipo: 'espera_encerrada' })).toEqual({ state: 'Open', mudou: false });
  });

  it('an event that maps to no state never changes state', () => {
    for (const state of STATES_CONVERSATION) {
      expect(aplicarEvento(state, { tipo: 'mensagem_entrada' })).toEqual({ state, mudou: false });
      expect(aplicarEvento(state, { tipo: 'sla_alertado' })).toEqual({ state, mudou: false });
    }
  });

  it('webhook redelivery is idempotent, it does not turn into an exception', () => {
    expect(aplicarEvento('ClosedAttendant', { tipo: 'encerrada' })).toEqual({
      state: 'ClosedAttendant',
      mudou: false,
    });
  });

  describe('a customer event never takes the conversation to an invalid state', () => {
    const recusas: { nome: string; de: StateConversation; tipo: TipoEvento }[] = [
      { nome: 'resposta em conversa que ainda está na fila', de: 'Waiting', tipo: 'primeira_resposta' },
      { nome: 'atribuição de conversa já encerrada', de: 'ClosedAttendant', tipo: 'atribuida' },
      { nome: 'conversa transferida não reabre', de: 'Transferred', tipo: 'reaberta' },
      { nome: 'reabertura de conversa que está em atendimento', de: 'Open', tipo: 'reaberta' },
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
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('ClosedAttendant');
  });

  it('reopened goes back to the queue and the cycle restarts', () => {
    const ciclo: TipoEvento[] = ['criada', 'atribuida', 'encerrada', 'reaberta', 'atribuida'];
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('Assigned');
  });
});

describe('outbound message state machine', () => {
  const permitidas: [StateDelivery, StateDelivery][] = [
    ['pendente', 'enviando'],
    ['enviando', 'enviada'],
    ['enviando', 'falhou'],
    ['enviada', 'entregue'],
    ['enviada', 'lida'],
    ['enviada', 'falhou'],
    ['entregue', 'lida'],
    ['falhou', 'pendente'],
  ];

  const todos: StateDelivery[] = ['pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou'];

  for (const de of todos) {
    for (const para of todos) {
      const esperado = permitidas.some(([d, p]) => d === de && p === para);
      it(`${de} → ${para} ${esperado ? 'é permitida' : 'é recusada'}`, () => {
        expect(transitionDeliveryAllowed(de, para)).toBe(esperado);
      });
    }
  }

  it('resending takes it out of failed and returns it to the outbound queue', () => {
    expect(transitionDelivery('falhou', 'pendente')).toBe('pendente');
  });

  it('lida é terminal', () => {
    expect(() => transitionDelivery('lida', 'entregue')).toThrow(TransitionDeliveryInvalidError);
  });
});
