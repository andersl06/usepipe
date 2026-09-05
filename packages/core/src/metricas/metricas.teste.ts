import { describe, expect, it } from 'vitest';

import {
  classificarEncerramento,
  contarEncerramentos,
  derivarMarcos,
  intervalosDeResposta,
  mediaDeMedias,
  mediaPonderada,
  mediaPonderadaDePares,
  porDimensao,
  taxaDeResposta,
  tempoAtePrimeiraResposta,
  tempoDeAtendimento,
  tempoDeResposta,
  tempoNaFila,
  tempoTotalDeEsperaDoCliente,
  type ConversaEventos,
  type EncerradaPor,
  type EventoAtendimento,
  type TipoEvento,
} from './index.js';
import { resultado } from '../comum/tipos.js';

/** Instante em UTC no dia de referência (segunda-feira, 02/03/2026). */
function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

function evento(
  conversaId: string,
  tipo: TipoEvento,
  relogio: string,
  extra: Partial<EventoAtendimento> = {},
): EventoAtendimento {
  return { conversaId, tipo, em: em(relogio), ...extra };
}

/**
 * Três conversas com os cinco carimbos posicionados à mão.
 *
 *  C1 criada 10:00:00 · atribuída 10:02:30 · 1ª resposta 10:03:30 · encerrada 10:20:00
 *  C2 criada 10:00:00 · atribuída 10:10:00 · 1ª resposta 10:14:00 · encerrada 10:30:00
 *  C3 criada 10:00:00 · nunca atribuída · nunca respondida · encerrada 10:05:00
 */
const C1: ConversaEventos = {
  conversaId: 'c1',
  eventos: [
    evento('c1', 'criada', '10:00:00'),
    evento('c1', 'atribuida', '10:02:30', { usuarioId: 'u1' }),
    evento('c1', 'primeira_resposta', '10:03:30', { usuarioId: 'u1' }),
    evento('c1', 'encerrada', '10:20:00', { encerradaPor: 'atendente' }),
  ],
};

const C2: ConversaEventos = {
  conversaId: 'c2',
  eventos: [
    evento('c2', 'criada', '10:00:00'),
    evento('c2', 'atribuida', '10:10:00', { usuarioId: 'u2' }),
    evento('c2', 'primeira_resposta', '10:14:00', { usuarioId: 'u2' }),
    evento('c2', 'encerrada', '10:30:00', { encerradaPor: 'inatividade' }),
  ],
};

const C3: ConversaEventos = {
  conversaId: 'c3',
  eventos: [
    evento('c3', 'criada', '10:00:00'),
    evento('c3', 'encerrada', '10:05:00', { encerradaPor: 'cliente' }),
  ],
};

const TRIO = [C1, C2, C3];

describe('derivarMarcos', () => {
  it('lê os cinco carimbos de uma conversa completa', () => {
    const marcos = derivarMarcos(C1);
    expect(marcos.criadaEm).toEqual(em('10:00:00'));
    expect(marcos.atribuidaEm).toEqual(em('10:02:30'));
    expect(marcos.primeiraRespostaEm).toEqual(em('10:03:30'));
    expect(marcos.encerradaEm).toEqual(em('10:20:00'));
    expect(marcos.encerradaPor).toBe('atendente');
    expect(marcos.atribuicoes).toBe(1);
  });

  it('reatribuição não sobrescreve a primeira atribuição', () => {
    const marcos = derivarMarcos({
      conversaId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'atribuida', '10:05:00', { usuarioId: 'u1' }),
        evento('c', 'reatribuida', '10:40:00', { usuarioId: 'u2' }),
        evento('c', 'reatribuida', '11:10:00', { usuarioId: 'u3' }),
      ],
    });
    expect(marcos.atribuidaEm).toEqual(em('10:05:00'));
    expect(marcos.atribuicoes).toBe(3);
  });

  it('sem evento de primeira resposta, usa a primeira saída com atendente e ignora o bot', () => {
    const marcos = derivarMarcos({
      conversaId: 'c',
      eventos: [
        evento('c', 'criada', '09:00:00'),
        evento('c', 'mensagem_saida', '09:00:05'), // bot: sem usuarioId
        evento('c', 'atribuida', '09:01:00', { usuarioId: 'u1' }),
        evento('c', 'mensagem_saida', '09:02:00', { usuarioId: 'u1' }),
        evento('c', 'mensagem_saida', '09:03:00', { usuarioId: 'u1' }),
      ],
    });
    expect(marcos.primeiraRespostaEm).toEqual(em('09:02:00'));
  });

  it('cai para enfileirada quando não há evento de criação', () => {
    const marcos = derivarMarcos({
      conversaId: 'c',
      eventos: [evento('c', 'enfileirada', '08:00:00')],
    });
    expect(marcos.criadaEm).toEqual(em('08:00:00'));
  });

  it('reabertura apaga o encerramento anterior', () => {
    const marcos = derivarMarcos({
      conversaId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'encerrada', '10:10:00', { encerradaPor: 'atendente' }),
        evento('c', 'reaberta', '10:20:00'),
      ],
    });
    expect(marcos.encerradaEm).toBeNull();
    expect(marcos.encerradaPor).toBeNull();
  });

  it('conversa reaberta e fechada de novo carimba o último encerramento', () => {
    const marcos = derivarMarcos({
      conversaId: 'c',
      eventos: [
        evento('c', 'criada', '10:00:00'),
        evento('c', 'encerrada', '10:10:00', { encerradaPor: 'inatividade' }),
        evento('c', 'reaberta', '10:20:00'),
        evento('c', 'encerrada', '10:50:00', { encerradaPor: 'atendente' }),
      ],
    });
    expect(marcos.encerradaEm).toEqual(em('10:50:00'));
    expect(marcos.encerradaPor).toBe('atendente');
  });

  it('não depende da ordem em que os eventos chegam', () => {
    const embaralhada: ConversaEventos = { conversaId: 'c1', eventos: [...C1.eventos].reverse() };
    expect(derivarMarcos(embaralhada)).toEqual(derivarMarcos(C1));
  });
});

describe('métricas de tempo (§2)', () => {
  const casos: {
    nome: string;
    metrica: (c: readonly ConversaEventos[]) => { valor: number | null; populacao: number; excluidas: number };
    valor: number | null;
    populacao: number;
    excluidas: number;
  }[] = [
    // Tempo na fila: C1 150s, C2 600s. C3 nunca foi atribuída.
    { nome: 'tempo na fila', metrica: tempoNaFila, valor: 375, populacao: 2, excluidas: 1 },
    // Até 1ª resposta: C1 60s, C2 240s. C3 nunca respondida.
    {
      nome: 'tempo até a 1ª resposta',
      metrica: tempoAtePrimeiraResposta,
      valor: 150,
      populacao: 2,
      excluidas: 1,
    },
    // Espera do cliente: C1 210s, C2 840s, C3 300s (sem resposta, usa o encerramento).
    {
      nome: 'tempo total de espera do cliente',
      metrica: tempoTotalDeEsperaDoCliente,
      valor: 450,
      populacao: 3,
      excluidas: 0,
    },
    // Atendimento: C1 990s, C2 960s. C3 fora por não ter 1ª resposta.
    {
      nome: 'tempo de atendimento',
      metrica: tempoDeAtendimento,
      valor: 975,
      populacao: 2,
      excluidas: 1,
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome} devolve valor, população e excluídas`, () => {
      const saida = caso.metrica(TRIO);
      expect(saida.valor).toBe(caso.valor);
      expect(saida.populacao).toBe(caso.populacao);
      expect(saida.excluidas).toBe(caso.excluidas);
    });
  }

  it('conversa sem nenhuma resposta do atendente sai do denominador, não vira zero', () => {
    const saida = tempoDeAtendimento([C3]);
    expect(saida.valor).toBeNull();
    expect(saida.populacao).toBe(0);
    expect(saida.excluidas).toBe(1);
  });

  it('conversa em que só o cliente falou não tem 1ª resposta nem atendimento', () => {
    const soCliente: ConversaEventos = {
      conversaId: 'so-cliente',
      eventos: [
        evento('so-cliente', 'criada', '10:00:00'),
        evento('so-cliente', 'mensagem_entrada', '10:00:01'),
        evento('so-cliente', 'mensagem_entrada', '10:03:00'),
        evento('so-cliente', 'mensagem_entrada', '10:09:00'),
        evento('so-cliente', 'encerrada', '11:00:00', { encerradaPor: 'inatividade' }),
      ],
    };
    expect(tempoNaFila([soCliente])).toEqual(resultado(0, 0, 1));
    expect(tempoAtePrimeiraResposta([soCliente])).toEqual(resultado(0, 0, 1));
    expect(tempoDeAtendimento([soCliente])).toEqual(resultado(0, 0, 1));
    // A espera do cliente existe e vale 3600s: criada 10:00 → encerrada 11:00.
    expect(tempoTotalDeEsperaDoCliente([soCliente])).toEqual(resultado(3600, 1, 0));
    expect(tempoDeResposta([soCliente]).valor).toBeNull();
  });

  it('conversa aberta e sem resposta fica de fora da espera do cliente', () => {
    const aberta: ConversaEventos = {
      conversaId: 'aberta',
      eventos: [evento('aberta', 'criada', '10:00:00'), evento('aberta', 'mensagem_entrada', '10:00:10')],
    };
    expect(tempoTotalDeEsperaDoCliente([aberta])).toEqual(resultado(0, 0, 1));
  });

  it('intervalo negativo é dado inconsistente e sai do denominador', () => {
    const invertida: ConversaEventos = {
      conversaId: 'x',
      eventos: [
        evento('x', 'criada', '10:00:00'),
        evento('x', 'atribuida', '10:10:00', { usuarioId: 'u1' }),
        // Resposta carimbada antes da atribuição: não pode virar tempo negativo.
        evento('x', 'primeira_resposta', '10:05:00', { usuarioId: 'u1' }),
      ],
    };
    const saida = tempoAtePrimeiraResposta([invertida]);
    expect(saida.valor).toBeNull();
    expect(saida.excluidas).toBe(1);
  });

  it('lista vazia devolve null com população zero, nunca zero segundos', () => {
    expect(tempoNaFila([])).toEqual({ valor: null, populacao: 0, excluidas: 0, soma: 0 });
  });
});

describe('tempo de resposta', () => {
  //  A: 10:00 cliente → 10:01 atendente  = 60s
  //     10:05 cliente, 10:05:30 cliente → 10:07 atendente = 120s (conta da primeira)
  //  B: 09:00 cliente → 09:00:30 atendente = 30s
  //  C: só o cliente falou → nenhuma troca completa
  const A: ConversaEventos = {
    conversaId: 'a',
    eventos: [
      evento('a', 'mensagem_entrada', '10:00:00'),
      evento('a', 'mensagem_saida', '10:01:00', { usuarioId: 'u1' }),
      evento('a', 'mensagem_entrada', '10:05:00'),
      evento('a', 'mensagem_entrada', '10:05:30'),
      evento('a', 'mensagem_saida', '10:07:00', { usuarioId: 'u1' }),
    ],
  };
  const B: ConversaEventos = {
    conversaId: 'b',
    eventos: [
      evento('b', 'mensagem_entrada', '09:00:00'),
      evento('b', 'mensagem_saida', '09:00:30', { usuarioId: 'u2' }),
    ],
  };
  const C: ConversaEventos = {
    conversaId: 'c',
    eventos: [evento('c', 'mensagem_entrada', '08:00:00'), evento('c', 'mensagem_entrada', '08:30:00')],
  };

  it('extrai os intervalos de uma conversa', () => {
    expect(intervalosDeResposta(A)).toEqual([60, 120]);
    expect(intervalosDeResposta(C)).toEqual([]);
  });

  it('mensagem de bot não fecha a troca', () => {
    const comBot: ConversaEventos = {
      conversaId: 'bot',
      eventos: [
        evento('bot', 'mensagem_entrada', '10:00:00'),
        evento('bot', 'mensagem_saida', '10:00:10'), // bot
        evento('bot', 'mensagem_saida', '10:02:00', { usuarioId: 'u1' }),
      ],
    };
    expect(intervalosDeResposta(comBot)).toEqual([120]);
  });

  it('média dos intervalos, com conversas e excluídas visíveis', () => {
    // (60 + 120 + 30) ÷ 3 intervalos = 70s
    const saida = tempoDeResposta([A, B, C]);
    expect(saida.valor).toBe(70);
    expect(saida.soma).toBe(210);
    expect(saida.populacao).toBe(3);
    expect(saida.conversasConsideradas).toBe(2);
    expect(saida.excluidas).toBe(1);
  });
});

describe('status de encerramento (§4)', () => {
  const casos: {
    nome: string;
    atribuida: boolean;
    encerradaPor: EncerradaPor | null;
    encerrada: boolean;
    esperado: 'perdida' | 'abandonada' | 'finalizada' | null;
  }[] = [
    { nome: 'cliente saiu antes de atribuir', atribuida: false, encerradaPor: 'cliente', encerrada: true, esperado: 'perdida' },
    { nome: 'inatividade antes de atribuir', atribuida: false, encerradaPor: 'inatividade', encerrada: true, esperado: 'perdida' },
    { nome: 'cliente saiu depois de atribuir', atribuida: true, encerradaPor: 'cliente', encerrada: true, esperado: 'abandonada' },
    { nome: 'inatividade depois de atribuir', atribuida: true, encerradaPor: 'inatividade', encerrada: true, esperado: 'abandonada' },
    { nome: 'atendente fechou', atribuida: true, encerradaPor: 'atendente', encerrada: true, esperado: 'finalizada' },
    { nome: 'gestor fechou sem atribuição', atribuida: false, encerradaPor: 'atendente', encerrada: true, esperado: 'finalizada' },
    { nome: 'transferida', atribuida: true, encerradaPor: 'transferencia', encerrada: true, esperado: 'finalizada' },
    { nome: 'origem desconhecida com atribuição', atribuida: true, encerradaPor: null, encerrada: true, esperado: 'abandonada' },
    { nome: 'origem desconhecida sem atribuição', atribuida: false, encerradaPor: null, encerrada: true, esperado: 'perdida' },
    { nome: 'ainda aberta', atribuida: true, encerradaPor: null, encerrada: false, esperado: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const eventos: EventoAtendimento[] = [evento('c', 'criada', '10:00:00')];
      if (caso.atribuida) eventos.push(evento('c', 'atribuida', '10:01:00', { usuarioId: 'u1' }));
      if (caso.encerrada) {
        eventos.push(evento('c', 'encerrada', '10:30:00', { encerradaPor: caso.encerradaPor }));
      }
      expect(classificarEncerramento(derivarMarcos({ conversaId: 'c', eventos }))).toBe(caso.esperado);
    });
  }

  it('conta perdidas, abandonadas, finalizadas e o total fechado', () => {
    // C1 finalizada · C2 abandonada (inatividade com atribuição) · C3 perdida.
    expect(contarEncerramentos(TRIO)).toEqual({
      perdida: 1,
      abandonada: 1,
      finalizada: 1,
      fechada: 3,
      abertas: 0,
    });
  });
});

describe('média ponderada por volume (§5)', () => {
  // Dia cheio: 900s em 10 conversas (média 90s).
  // Dia vazio: 600s em 2 conversas (média 300s).
  const diaCheio = resultado(900, 10, 0);
  const diaVazio = resultado(600, 2, 1);

  it('pondera por volume: 1500 ÷ 12 = 125s', () => {
    const combinado = mediaPonderada([diaCheio, diaVazio]);
    expect(combinado.valor).toBe(125);
    expect(combinado.soma).toBe(1500);
    expect(combinado.populacao).toBe(12);
    expect(combinado.excluidas).toBe(1);
  });

  it('a média de médias daria 195s — é o erro que a regra evita', () => {
    expect(mediaDeMedias([diaCheio.valor, diaVazio.valor])).toBe(195);
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

  it('versão crua com pares soma/contagem', () => {
    expect(mediaPonderadaDePares([{ soma: 900, contagem: 10 }, { soma: 600, contagem: 2 }])).toBe(125);
    expect(mediaPonderadaDePares([])).toBeNull();
  });

  it('agrupa por dimensão em ordem determinística', () => {
    const porFila = porDimensao(
      [
        { fila: 'suporte', conversa: C1 },
        { fila: 'vendas', conversa: C2 },
        { fila: 'suporte', conversa: C3 },
      ],
      (item) => item.fila,
      (grupo) => tempoNaFila(grupo.map((item) => item.conversa)),
    );
    expect([...porFila.keys()]).toEqual(['suporte', 'vendas']);
    expect(porFila.get('suporte')).toEqual(resultado(150, 1, 1));
    expect(porFila.get('vendas')).toEqual(resultado(600, 1, 0));
  });
});

describe('taxa de resposta de pesquisa (§6)', () => {
  it('respostas ÷ encerradas', () => {
    expect(taxaDeResposta(22, 100)).toBe(0.22);
    expect(taxaDeResposta(0, 100)).toBe(0);
    expect(taxaDeResposta(5, 0)).toBeNull();
  });
});
