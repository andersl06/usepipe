import { describe, expect, it } from 'vitest';

import {
  classificarClosure,
  contarClosures,
  derivarMarcos,
  intervalosDeResposta,
  mediaDeMedias,
  mediaPonderada,
  mediaPonderadaDePares,
  byDimensao,
  taxaDeResposta,
  timeAteFirstResposta,
  attendanceTime,
  respostaTime,
  timeInQueue,
  timeTotalOfEsperaOfCliente,
  type ConversationEvents,
  type ClosedBy,
  type EventAttendance,
  type TipoEvento,
} from './index.js';
import { resultado } from '../comum/tipos.js';

/** Instante em UTC no dia de referência (segunda-feira, 02/03/2026). */
function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

function evento(
  conversationId: string,
  tipo: TipoEvento,
  relogio: string,
  extra: Partial<EventAttendance> = {},
): EventAttendance {
  return { conversationId, tipo, em: em(relogio), ...extra };
}

/**
 * Três conversas com os cinco carimbos posicionados à mão.
 *
 *  C1 criada 10:00:00 · atribuída 10:02:30 · 1ª resposta 10:03:30 · encerrada 10:20:00
 *  C2 criada 10:00:00 · atribuída 10:10:00 · 1ª resposta 10:14:00 · encerrada 10:30:00
 *  C3 criada 10:00:00 · nunca atribuída · nunca respondida · encerrada 10:05:00
 */
const C1: ConversationEvents = {
  conversationId: 'c1',
  eventos: [
    evento('c1', 'criada', '10:00:00'),
    evento('c1', 'atribuida', '10:02:30', { userId: 'u1' }),
    evento('c1', 'primeira_resposta', '10:03:30', { userId: 'u1' }),
    evento('c1', 'encerrada', '10:20:00', { encerradaBy: 'atendente' }),
  ],
};

const C2: ConversationEvents = {
  conversationId: 'c2',
  eventos: [
    evento('c2', 'criada', '10:00:00'),
    evento('c2', 'atribuida', '10:10:00', { userId: 'u2' }),
    evento('c2', 'primeira_resposta', '10:14:00', { userId: 'u2' }),
    evento('c2', 'encerrada', '10:30:00', { encerradaBy: 'inatividade' }),
  ],
};

const C3: ConversationEvents = {
  conversationId: 'c3',
  eventos: [
    evento('c3', 'criada', '10:00:00'),
    evento('c3', 'encerrada', '10:05:00', { encerradaBy: 'cliente' }),
  ],
};

const TRIO = [C1, C2, C3];

describe('derivarMarcos', () => {
  it('reads the five timestamps of a complete conversation', () => {
    const marcos = derivarMarcos(C1);
    expect(marcos.criadaEm).toEqual(em('10:00:00'));
    expect(marcos.atribuidaEm).toEqual(em('10:02:30'));
    expect(marcos.firstRespostaIn).toEqual(em('10:03:30'));
    expect(marcos.encerradaEm).toEqual(em('10:20:00'));
    expect(marcos.encerradaBy).toBe('atendente');
    expect(marcos.assignments).toBe(1);
  });

  it('reassignment does not overwrite the first assignment', () => {
    const marcos = derivarMarcos({
      conversationId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'atribuida', '10:05:00', { userId: 'u1' }),
        evento('c', 'reatribuida', '10:40:00', { userId: 'u2' }),
        evento('c', 'reatribuida', '11:10:00', { userId: 'u3' }),
      ],
    });
    expect(marcos.atribuidaEm).toEqual(em('10:05:00'));
    expect(marcos.assignments).toBe(3);
  });

  it('with no first-response event, it uses the first output with an agent and ignores the bot', () => {
    const marcos = derivarMarcos({
      conversationId: 'c',
      eventos: [
        evento('c', 'criada', '09:00:00'),
        evento('c', 'mensagem_saida', '09:00:05'), // bot: sem usuarioId
        evento('c', 'atribuida', '09:01:00', { userId: 'u1' }),
        evento('c', 'mensagem_saida', '09:02:00', { userId: 'u1' }),
        evento('c', 'mensagem_saida', '09:03:00', { userId: 'u1' }),
      ],
    });
    expect(marcos.firstRespostaIn).toEqual(em('09:02:00'));
  });

  it('falls back to queued when there is no creation event', () => {
    const marcos = derivarMarcos({
      conversationId: 'c',
      eventos: [evento('c', 'enfileirada', '08:00:00')],
    });
    expect(marcos.criadaEm).toEqual(em('08:00:00'));
  });

  it('reopening clears the previous closure', () => {
    const marcos = derivarMarcos({
      conversationId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'encerrada', '10:10:00', { encerradaBy: 'atendente' }),
        evento('c', 'reaberta', '10:20:00'),
      ],
    });
    expect(marcos.encerradaEm).toBeNull();
    expect(marcos.encerradaBy).toBeNull();
  });

  it('a conversation reopened and closed again stamps the latest closure', () => {
    const marcos = derivarMarcos({
      conversationId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'encerrada', '10:10:00', { encerradaBy: 'inatividade' }),
        evento('c', 'reaberta', '10:20:00'),
        evento('c', 'encerrada', '10:50:00', { encerradaBy: 'atendente' }),
      ],
    });
    expect(marcos.encerradaEm).toEqual(em('10:50:00'));
    expect(marcos.encerradaBy).toBe('atendente');
  });

  it('does not depend on the order events arrive in', () => {
    const embaralhada: ConversationEvents = { conversationId: 'c1', eventos: [...C1.eventos].reverse() };
    expect(derivarMarcos(embaralhada)).toEqual(derivarMarcos(C1));
  });
});

describe('time metrics (§2)', () => {
  const casos: {
    nome: string;
    metrica: (c: readonly ConversationEvents[]) => { value: number | null; population: number; excluidas: number };
    value: number | null;
    population: number;
    excluidas: number;
  }[] = [
    // Tempo na fila: C1 150s, C2 600s. C3 nunca foi atribuída.
    { nome: 'tempo na fila', metrica: timeInQueue, value: 375, population: 2, excluidas: 1 },
    // Até 1ª resposta: C1 60s, C2 240s. C3 nunca respondida.
    {
      nome: 'tempo até a 1ª resposta',
      metrica: timeAteFirstResposta,
      value: 150,
      population: 2,
      excluidas: 1,
    },
    // Espera do cliente: C1 210s, C2 840s, C3 300s (sem resposta, usa o encerramento).
    {
      nome: 'tempo total de espera do cliente',
      metrica: timeTotalOfEsperaOfCliente,
      value: 450,
      population: 3,
      excluidas: 0,
    },
    // Atendimento: C1 990s, C2 960s. C3 fora por não ter 1ª resposta.
    {
      nome: 'tempo de atendimento',
      metrica: attendanceTime,
      value: 975,
      population: 2,
      excluidas: 1,
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome} devolve valor, população e excluídas`, () => {
      const saida = caso.metrica(TRIO);
      expect(saida.value).toBe(caso.value);
      expect(saida.population).toBe(caso.population);
      expect(saida.excluidas).toBe(caso.excluidas);
    });
  }

  it('a conversation with no agent reply at all leaves the denominator instead of becoming zero', () => {
    const saida = attendanceTime([C3]);
    expect(saida.value).toBeNull();
    expect(saida.population).toBe(0);
    expect(saida.excluidas).toBe(1);
  });

  it('a conversation where only the customer spoke has neither a first response nor attendance', () => {
    const soCliente: ConversationEvents = {
      conversationId: 'so-cliente',
      eventos: [
        evento('so-cliente', 'criada', '10:00:00'),
        evento('so-cliente', 'mensagem_entrada', '10:00:01'),
        evento('so-cliente', 'mensagem_entrada', '10:03:00'),
        evento('so-cliente', 'mensagem_entrada', '10:09:00'),
        evento('so-cliente', 'encerrada', '11:00:00', { encerradaBy: 'inatividade' }),
      ],
    };
    expect(timeInQueue([soCliente])).toEqual(resultado(0, 0, 1));
    expect(timeAteFirstResposta([soCliente])).toEqual(resultado(0, 0, 1));
    expect(attendanceTime([soCliente])).toEqual(resultado(0, 0, 1));
    // A espera do cliente existe e vale 3600s: criada 10:00 → encerrada 11:00.
    expect(timeTotalOfEsperaOfCliente([soCliente])).toEqual(resultado(3600, 1, 0));
    expect(respostaTime([soCliente]).value).toBeNull();
  });

  it('an open conversation with no reply is left out of the customer\'s wait time', () => {
    const aberta: ConversationEvents = {
      conversationId: 'aberta',
      eventos: [evento('aberta', 'criada', '10:00:00'), evento('aberta', 'mensagem_entrada', '10:00:10')],
    };
    expect(timeTotalOfEsperaOfCliente([aberta])).toEqual(resultado(0, 0, 1));
  });

  it('intervalo negativo é dado inconsistente e sai do denominador', () => {
    const invertida: ConversationEvents = {
      conversationId: 'x',
      eventos: [
        evento('x', 'criada', '10:00:00'),
        evento('x', 'atribuida', '10:10:00', { userId: 'u1' }),
        // Resposta carimbada antes da atribuição: não pode virar tempo negativo.
        evento('x', 'primeira_resposta', '10:05:00', { userId: 'u1' }),
      ],
    };
    const saida = timeAteFirstResposta([invertida]);
    expect(saida.value).toBeNull();
    expect(saida.excluidas).toBe(1);
  });

  it('an empty list returns null with zero population, never zero seconds', () => {
    expect(timeInQueue([])).toEqual({ valor: null, populacao: 0, excluidas: 0, soma: 0 });
  });
});

describe('response time', () => {
  //  A: 10:00 cliente → 10:01 atendente  = 60s
  //     10:05 cliente, 10:05:30 cliente → 10:07 atendente = 120s (conta da primeira)
  //  B: 09:00 cliente → 09:00:30 atendente = 30s
  //  C: só o cliente falou → nenhuma troca completa
  const A: ConversationEvents = {
    conversationId: 'a',
    eventos: [
      evento('a', 'mensagem_entrada', '10:00:00'),
      evento('a', 'mensagem_saida', '10:01:00', { userId: 'u1' }),
      evento('a', 'mensagem_entrada', '10:05:00'),
      evento('a', 'mensagem_entrada', '10:05:30'),
      evento('a', 'mensagem_saida', '10:07:00', { userId: 'u1' }),
    ],
  };
  const B: ConversationEvents = {
    conversationId: 'b',
    eventos: [
      evento('b', 'mensagem_entrada', '09:00:00'),
      evento('b', 'mensagem_saida', '09:00:30', { userId: 'u2' }),
    ],
  };
  const C: ConversationEvents = {
    conversationId: 'c',
    eventos: [evento('c', 'mensagem_entrada', '08:00:00'), evento('c', 'mensagem_entrada', '08:30:00')],
  };

  it('extracts the intervals from a conversation', () => {
    expect(intervalosDeResposta(A)).toEqual([60, 120]);
    expect(intervalosDeResposta(C)).toEqual([]);
  });

  it('a bot message does not close the exchange', () => {
    const comBot: ConversationEvents = {
      conversationId: 'bot',
      eventos: [
        evento('bot', 'mensagem_entrada', '10:00:00'),
        evento('bot', 'mensagem_saida', '10:00:10'), // bot
        evento('bot', 'mensagem_saida', '10:02:00', { userId: 'u1' }),
      ],
    };
    expect(intervalosDeResposta(comBot)).toEqual([120]);
  });

  it('average of the intervals, with included and excluded conversations visible', () => {
    // (60 + 120 + 30) ÷ 3 intervalos = 70s
    const saida = respostaTime([A, B, C]);
    expect(saida.value).toBe(70);
    expect(saida.soma).toBe(210);
    expect(saida.population).toBe(3);
    expect(saida.conversationsConsideradas).toBe(2);
    expect(saida.excluidas).toBe(1);
  });
});

describe('closure status (§4)', () => {
  const casos: {
    nome: string;
    atribuida: boolean;
    encerradaBy: ClosedBy | null;
    encerrada: boolean;
    esperado: 'perdida' | 'abandonada' | 'finalizada' | null;
  }[] = [
    { nome: 'cliente saiu antes de atribuir', atribuida: false, encerradaBy: 'cliente', encerrada: true, esperado: 'perdida' },
    { nome: 'inatividade antes de atribuir', atribuida: false, encerradaBy: 'inatividade', encerrada: true, esperado: 'perdida' },
    { nome: 'cliente saiu depois de atribuir', atribuida: true, encerradaBy: 'cliente', encerrada: true, esperado: 'abandonada' },
    { nome: 'inatividade depois de atribuir', atribuida: true, encerradaBy: 'inatividade', encerrada: true, esperado: 'abandonada' },
    { nome: 'atendente fechou', atribuida: true, encerradaBy: 'atendente', encerrada: true, esperado: 'finalizada' },
    { nome: 'gestor fechou sem atribuição', atribuida: false, encerradaBy: 'atendente', encerrada: true, esperado: 'finalizada' },
    { nome: 'transferida', atribuida: true, encerradaBy: 'transferencia', encerrada: true, esperado: 'finalizada' },
    { nome: 'origem desconhecida com atribuição', atribuida: true, encerradaBy: null, encerrada: true, esperado: 'abandonada' },
    { nome: 'origem desconhecida sem atribuição', atribuida: false, encerradaBy: null, encerrada: true, esperado: 'perdida' },
    { nome: 'ainda aberta', atribuida: true, encerradaBy: null, encerrada: false, esperado: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const eventos: EventAttendance[] = [evento('c', 'criada', '10:00:00')];
      if (caso.atribuida) eventos.push(evento('c', 'atribuida', '10:01:00', { userId: 'u1' }));
      if (caso.encerrada) {
        eventos.push(evento('c', 'encerrada', '10:30:00', { encerradaBy: caso.encerradaBy }));
      }
      expect(classificarClosure(derivarMarcos({ conversationId: 'c', eventos }))).toBe(caso.esperado);
    });
  }

  it('counts lost, abandoned, finished and the total closed', () => {
    // C1 finalizada · C2 abandonada (inatividade com atribuição) · C3 perdida.
    expect(contarClosures(TRIO)).toEqual({
      perdida: 1,
      abandonada: 1,
      finalizada: 1,
      fechada: 3,
      abertas: 0,
    });
  });
});

describe('volume-weighted average (§5)', () => {
  // Dia cheio: 900s em 10 conversas (média 90s).
  // Dia vazio: 600s em 2 conversas (média 300s).
  const diaCheio = resultado(900, 10, 0);
  const diaEmpty = resultado(600, 2, 1);

  it('weights by volume: 1500 ÷ 12 = 125s', () => {
    const combinado = mediaPonderada([diaCheio, diaEmpty]);
    expect(combinado.value).toBe(125);
    expect(combinado.soma).toBe(1500);
    expect(combinado.population).toBe(12);
    expect(combinado.excluidas).toBe(1);
  });

  it('the average of averages would give 195s — that is the mistake the rule avoids', () => {
    expect(mediaDeMedias([diaCheio.value, diaEmpty.value])).toBe(195);
  });

  it('combinar nada devolve null, não zero', () => {
    expect(mediaPonderada([])).toEqual({ valor: null, populacao: 0, excluidas: 0, soma: 0 });
    expect(mediaPonderada([resultado(0, 0, 4)])).toEqual({
      valor: null,
      populacao: 0,
      excluidas: 4,
      soma: 0,
    });
  });

  it('raw version with sum/count pairs', () => {
    expect(mediaPonderadaDePares([{ soma: 900, count: 10 }, { soma: 600, count: 2 }])).toBe(125);
    expect(mediaPonderadaDePares([])).toBeNull();
  });

  it('groups by dimension in deterministic order', () => {
    const byQueue = byDimensao(
      [
        { fila: 'suporte', conversa: C1 },
        { fila: 'vendas', conversa: C2 },
        { fila: 'suporte', conversa: C3 },
      ],
      (item) => item.fila,
      (grupo) => timeInQueue(grupo.map((item) => item.conversa)),
    );
    expect([...byQueue.keys()]).toEqual(['suporte', 'vendas']);
    expect(byQueue.get('suporte')).toEqual(resultado(150, 1, 1));
    expect(byQueue.get('vendas')).toEqual(resultado(600, 1, 0));
  });
});

describe('taxa de resposta de pesquisa (§6)', () => {
  it('respostas ÷ encerradas', () => {
    expect(taxaDeResposta(22, 100)).toBe(0.22);
    expect(taxaDeResposta(0, 100)).toBe(0);
    expect(taxaDeResposta(5, 0)).toBeNull();
  });
});
