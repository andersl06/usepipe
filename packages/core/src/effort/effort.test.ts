import { describe, expect, it } from 'vitest';

import {
  BYTES_BY_SEGUNDO_AUDIO,
  CARACTERES_BY_MINUTO_ESCRITA,
  CARACTERES_BY_MINUTO_READ,
  SESSION_INTERVAL_LIMIT_SEG,
  calcularEffortConversation,
  calcularEffortByConversation,
  calcularTimeInSession,
  agentConsolidarDia,
  audioDuration,
  occupancy,
  segundosDeEscrita,
  readSegundos,
  type MessageEffort,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

const texto = (n: number) => 'a'.repeat(n);

describe('constantes da régua', () => {
  it('they are exactly the ones from the report validated in production', () => {
    expect(CARACTERES_BY_MINUTO_ESCRITA).toBe(200);
    expect(CARACTERES_BY_MINUTO_READ).toBe(1000);
    // Opus a ~16 kbps: 16.000 bits ÷ 8 = 2.000 bytes por segundo.
    expect(BYTES_BY_SEGUNDO_AUDIO).toBe(2000);
    expect(SESSION_INTERVAL_LIMIT_SEG).toBe(600);
  });
});

describe('conversão de caracteres em segundos', () => {
  const casosEscrita: [number, number][] = [
    [0, 0],
    [200, 60], // 200 caracteres = 1 minuto de digitação
    [100, 30],
    [50, 15],
    [1000, 300],
  ];
  for (const [caracteres, segundos] of casosEscrita) {
    it(`escrever ${caracteres} caracteres custa ${segundos}s`, () => {
      expect(segundosDeEscrita(caracteres)).toBe(segundos);
    });
  }

  const casosRead: [number, number][] = [
    [0, 0],
    [1000, 60], // 1.000 caracteres = 1 minuto de leitura
    [500, 30],
    [250, 15],
    [2000, 120],
  ];
  for (const [caracteres, segundos] of casosRead) {
    it(`ler ${caracteres} caracteres custa ${segundos}s`, () => {
      expect(readSegundos(caracteres)).toBe(segundos);
    });
  }

  it('ler é cinco vezes mais rápido que escrever', () => {
    expect(segundosDeEscrita(1000) / readSegundos(1000)).toBe(5);
  });
});

describe('audio duration', () => {
  const casos: { nome: string; attachment: unknown; esperado: number | null }[] = [
    { nome: 'metadado presente manda', attachment: { duracaoSeg: 12, bytes: 999_999 }, esperado: 12 },
    { nome: 'sem metadado, estima por tamanho', attachment: { bytes: 30_000 }, esperado: 15 },
    { nome: 'metadado zero é duração válida', attachment: { duracaoSeg: 0, bytes: 4000 }, esperado: 0 },
    { nome: 'sem metadado e sem tamanho', attachment: {}, esperado: null },
    { nome: 'tamanho zero não estima nada', attachment: { bytes: 0 }, esperado: null },
    { nome: 'anexo ausente', attachment: null, esperado: null },
    { nome: 'duração negativa é ignorada e cai para o tamanho', attachment: { duracaoSeg: -3, bytes: 8000 }, esperado: 4 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(audioDuration(caso.attachment as never)).toBe(caso.esperado);
    });
  }
});

describe('effort per conversation', () => {
  /**
   * Conta feita à mão:
   *  escrita  = 400 (texto) + 100 (nota interna) = 500 chars → 500×60÷200 = 150s
   *  leitura  = 2.000 chars                                   → 2.000×60÷1.000 = 120s
   *  escuta   = áudio do cliente com metadado                 → 45s
   *  fala     = áudio do atendente de 60.000 bytes            → 60.000÷2.000 = 30s
   *  esforço  = 150 + 120 + 45 + 30                           = 345s
   *  resposta pronta: 600 chars fora do esforço               → 600×60÷200 = 180s
   */
  const messages: MessageEffort[] = [
    { conversationId: 'c1', em: em('10:00:00'), autor: 'bot', direction: 'saida', tipo: 'texto', conteudo: texto(5000) },
    { conversationId: 'c1', em: em('10:01:00'), autor: 'contato', direction: 'entrada', tipo: 'texto', conteudo: texto(2000) },
    { conversationId: 'c1', em: em('10:02:00'), autor: 'atendente', direction: 'saida', tipo: 'texto', conteudo: texto(400), userId: 'u1' },
    { conversationId: 'c1', em: em('10:03:00'), autor: 'atendente', direction: 'saida', tipo: 'texto', conteudo: texto(600), userId: 'u1', respostaProntaId: 'rp-1' },
    { conversationId: 'c1', em: em('10:04:00'), autor: 'contato', direction: 'entrada', tipo: 'audio', attachment: { durationSeg: 45 } },
    { conversationId: 'c1', em: em('10:05:00'), autor: 'atendente', direction: 'saida', tipo: 'audio', userId: 'u1', attachment: { bytes: 60_000 } },
    { conversationId: 'c1', em: em('10:06:00'), autor: 'contato', direction: 'entrada', tipo: 'audio', attachment: {} },
    { conversationId: 'c1', em: em('10:07:00'), autor: 'atendente', direction: 'interna', tipo: 'texto', conteudo: texto(100), userId: 'u1' },
    { conversationId: 'c1', em: em('10:08:00'), autor: 'sistema', direction: 'interna', tipo: 'texto', conteudo: texto(300) },
  ];

  const effort = calcularEffortConversation(messages);

  it('separates writing, reading, listening and speaking', () => {
    expect(effort.charsEscritos).toBe(500);
    expect(effort.charsLidos).toBe(2000);
    expect(effort.audioOuvidoSeg).toBe(45);
    expect(effort.audioGravadoSeg).toBe(30);
  });

  it('adds up to 345 seconds of effort', () => {
    expect(effort.effortSeg).toBe(345);
  });

  it('a canned response leaves effort and goes to a separate column', () => {
    expect(effort.charsDeRespostaPronta).toBe(600);
    expect(effort.effortCannedResponseSeg).toBe(180);
    // Os 180s da resposta pronta ficam fora dos 345s de esforço.
    expect(effort.effortSeg).toBe(345);
  });

  it('counts audio without duration metadata instead of making up a time', () => {
    expect(effort.audiosSemMetadado).toBe(1);
  });

  it('bot and system messages generate no effort at all', () => {
    const soMaquina = calcularEffortConversation([
      { conversationId: 'x', em: em('10:00:00'), autor: 'bot', direction: 'saida', tipo: 'texto', conteudo: texto(9000) },
      { conversationId: 'x', em: em('10:01:00'), autor: 'sistema', direction: 'interna', tipo: 'texto', conteudo: texto(9000) },
    ]);
    expect(soMaquina.effortSeg).toBe(0);
    expect(soMaquina.charsEscritos).toBe(0);
    expect(soMaquina.charsLidos).toBe(0);
  });

  it('template também não foi digitado à mão', () => {
    const comTemplate = calcularEffortConversation([
      { conversationId: 'x', em: em('10:00:00'), autor: 'atendente', direction: 'saida', tipo: 'template', conteudo: texto(200), userId: 'u1' },
    ]);
    expect(comTemplate.charsEscritos).toBe(0);
    expect(comTemplate.charsDeRespostaPronta).toBe(200);
    expect(comTemplate.effortSeg).toBe(0);
    expect(comTemplate.effortCannedResponseSeg).toBe(60);
  });

  it('an empty conversation returns everything zeroed', () => {
    const empty = calcularEffortConversation([], { conversationId: 'vazia' });
    expect(empty.effortSeg).toBe(0);
    expect(empty.conversationId).toBe('vazia');
    expect(empty.agentId).toBeNull();
  });

  it('finds the agent from their first message', () => {
    expect(effort.agentId).toBe('u1');
  });

  it('groups by conversation in deterministic order', () => {
    const byConversation = calcularEffortByConversation([
      { conversationId: 'c2', em: em('10:00:00'), autor: 'contato', direction: 'entrada', tipo: 'texto', conteudo: texto(1000) },
      { conversationId: 'c1', em: em('10:00:00'), autor: 'atendente', direction: 'saida', tipo: 'texto', conteudo: texto(200), userId: 'u1' },
    ]);
    expect(byConversation.map((e) => e.conversationId)).toEqual(['c1', 'c2']);
    expect(byConversation[0]?.effortSeg).toBe(60);
    expect(byConversation[1]?.effortSeg).toBe(60);
  });
});

describe('support metric: time in session', () => {
  /**
   * Mensagens do atendente no dia, em minutos a partir das 10:00:
   *   0, 3, 8, 25, 30, 31, 60
   * Intervalos: 3, 5, 17, 5, 1, 29 minutos.
   * Só contam os de até 10 min → 3+5 = 8 min, depois 5+1 = 6 min, depois nada.
   * Sessão = 14 min = 840s, em três blocos.
   */
  const instantes = [
    em('10:00:00'),
    em('10:03:00'),
    em('10:08:00'),
    em('10:25:00'),
    em('10:30:00'),
    em('10:31:00'),
    em('11:00:00'),
  ];

  it('soma 840 segundos em três blocos', () => {
    const session = calcularTimeInSession(instantes);
    expect(session.sessionSeg).toBe(840);
    expect(session.blocos.map((b) => b.segundos)).toEqual([480, 360, 0]);
    expect(session.blocos.map((b) => b.messages)).toEqual([3, 3, 1]);
    expect(session.messages).toBe(7);
  });

  const casosLimite: { nome: string; instantes: Date[]; esperado: number }[] = [
    { nome: 'nenhuma mensagem', instantes: [], esperado: 0 },
    { nome: 'uma mensagem sozinha vale zero', instantes: [em('10:00:00')], esperado: 0 },
    { nome: 'exatamente 10 minutos ainda conta', instantes: [em('10:00:00'), em('10:10:00')], esperado: 600 },
    { nome: '10 minutos e 1 segundo é pausa', instantes: [em('10:00:00'), em('10:10:01')], esperado: 0 },
    { nome: 'mensagens simultâneas somam zero', instantes: [em('10:00:00'), em('10:00:00')], esperado: 0 },
  ];

  for (const caso of casosLimite) {
    it(caso.nome, () => {
      expect(calcularTimeInSession(caso.instantes).sessionSeg).toBe(caso.esperado);
    });
  }

  it('does not depend on the order messages arrive in', () => {
    const embaralhado = [...instantes].reverse();
    expect(calcularTimeInSession(embaralhado).sessionSeg).toBe(840);
  });

  it('aceita limite configurável', () => {
    expect(calcularTimeInSession(instantes, { limiteSeg: 1800 }).sessionSeg).toBe(3600);
  });
});

describe('agent-day consolidation', () => {
  it('effort ÷ session becomes occupancy; effort ÷ tickets is a weighted average by construction', () => {
    const dia = agentConsolidarDia({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: [200, 160],
      messageInstantes: [em('10:00:00'), em('10:03:00'), em('10:08:00')],
    });
    expect(dia.effortSeg).toBe(360);
    expect(dia.tickets).toBe(2);
    expect(dia.sessionSeg).toBe(480);
    expect(dia.effortMedioByTicketSeg).toBe(180);
    expect(dia.occupancy).toBe(0.75);
  });

  it('with no measured session, occupancy is null, never infinite', () => {
    expect(occupancy(600, 0)).toBeNull();
    const dia = agentConsolidarDia({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: [],
      messageInstantes: [],
    });
    expect(dia.occupancy).toBeNull();
    expect(dia.effortMedioByTicketSeg).toBeNull();
  });

  it('a full day weighs more than an empty day in the per-ticket average', () => {
    const cheio = agentConsolidarDia({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: Array.from({ length: 10 }, () => 600),
      messageInstantes: [],
    });
    const empty = agentConsolidarDia({
      dia: '2026-03-03',
      userId: 'u1',
      esforcosSeg: [1800, 1800],
      messageInstantes: [],
    });
    // Dia cheio: 6.000s em 10 tickets (600s cada). Dia vazio: 3.600s em 2 (1.800s cada).
    // Ponderada: 9.600 ÷ 12 = 800s. Média de médias daria (600 + 1.800) ÷ 2 = 1.200s.
    const ponderada =
      (cheio.effortSeg + empty.effortSeg) / (cheio.tickets + empty.tickets);
    expect(ponderada).toBe(800);
    expect(
      ((cheio.effortMedioByTicketSeg as number) + (empty.effortMedioByTicketSeg as number)) / 2,
    ).toBe(1200);
  });
});
