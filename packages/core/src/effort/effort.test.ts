import { describe, expect, it } from 'vitest';

import {
  BYTES_BY_SECOND_AUDIO,
  CHARACTERS_BY_MINUTE_WRITING,
  CHARACTERS_BY_MINUTE_READ,
  SESSION_INTERVAL_LIMIT_SEG,
  calculateEffortConversation,
  calculateEffortByConversation,
  calculateTimeInSession,
  agentConsolidateDay,
  audioDuration,
  occupancy,
  segundosDeEscrita,
  readSeconds,
  type MessageEffort,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

const texto = (n: number) => 'a'.repeat(n);

describe('constantes da régua', () => {
  it('they are exactly the ones from the report validated in production', () => {
    expect(CHARACTERS_BY_MINUTE_WRITING).toBe(200);
    expect(CHARACTERS_BY_MINUTE_READ).toBe(1000);
    // Opus a ~16 kbps: 16.000 bits ÷ 8 = 2.000 bytes por segundo.
    expect(BYTES_BY_SECOND_AUDIO).toBe(2000);
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

  const casesRead: [number, number][] = [
    [0, 0],
    [1000, 60], // 1.000 caracteres = 1 minuto de leitura
    [500, 30],
    [250, 15],
    [2000, 120],
  ];
  for (const [caracteres, segundos] of casesRead) {
    it(`ler ${caracteres} caracteres custa ${segundos}s`, () => {
      expect(readSeconds(caracteres)).toBe(segundos);
    });
  }

  it('ler é cinco vezes mais rápido que escrever', () => {
    expect(segundosDeEscrita(1000) / readSeconds(1000)).toBe(5);
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
   * Manual calculation: writing 400 message and 100 internal-note characters gives 500 × 60 ÷ 200 = 150 s; reading 2,000 characters gives 2,000 × 60 ÷ 1,000 = 120 s; listening to customer audio adds 45 s; 60,000 bytes of agent audio at 2,000 bytes/s adds 30 s. Total effort is 345 s. The 600-character canned response is excluded and would add 180 s if typed.
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

  const effort = calculateEffortConversation(messages);

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
    expect(effort.effortSeg).toBe(345);
  });

  it('counts audio without duration metadata instead of making up a time', () => {
    expect(effort.audiosSemMetadado).toBe(1);
  });

  it('bot and system messages generate no effort at all', () => {
    const soMaquina = calculateEffortConversation([
      { conversationId: 'x', em: em('10:00:00'), autor: 'bot', direction: 'saida', tipo: 'texto', conteudo: texto(9000) },
      { conversationId: 'x', em: em('10:01:00'), autor: 'sistema', direction: 'interna', tipo: 'texto', conteudo: texto(9000) },
    ]);
    expect(soMaquina.effortSeg).toBe(0);
    expect(soMaquina.charsEscritos).toBe(0);
    expect(soMaquina.charsLidos).toBe(0);
  });

  it('template também não foi digitado à mão', () => {
    const comTemplate = calculateEffortConversation([
      { conversationId: 'x', em: em('10:00:00'), autor: 'atendente', direction: 'saida', tipo: 'template', conteudo: texto(200), userId: 'u1' },
    ]);
    expect(comTemplate.charsEscritos).toBe(0);
    expect(comTemplate.charsDeRespostaPronta).toBe(200);
    expect(comTemplate.effortSeg).toBe(0);
    expect(comTemplate.effortCannedResponseSeg).toBe(60);
  });

  it('an empty conversation returns everything zeroed', () => {
    const empty = calculateEffortConversation([], { conversationId: 'vazia' });
    expect(empty.effortSeg).toBe(0);
    expect(empty.conversationId).toBe('vazia');
    expect(empty.agentId).toBeNull();
  });

  it('finds the agent from their first message', () => {
    expect(effort.agentId).toBe('u1');
  });

  it('groups by conversation in deterministic order', () => {
    const byConversation = calculateEffortByConversation([
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
   * Agent messages in minutes after 10:00: 0, 3, 8, 25, 30, 31, 60. Gaps are 3, 5, 17, 5, 1, 29 minutes; only gaps up to 10 count, giving 8 then 6 minutes and no later time. Session time is 14 minutes (840 seconds) across three blocks.
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
    const session = calculateTimeInSession(instantes);
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
      expect(calculateTimeInSession(caso.instantes).sessionSeg).toBe(caso.esperado);
    });
  }

  it('does not depend on the order messages arrive in', () => {
    const embaralhado = [...instantes].reverse();
    expect(calculateTimeInSession(embaralhado).sessionSeg).toBe(840);
  });

  it('aceita limite configurável', () => {
    expect(calculateTimeInSession(instantes, { limiteSeg: 1800 }).sessionSeg).toBe(3600);
  });
});

describe('agent-day consolidation', () => {
  it('effort ÷ session becomes occupancy; effort ÷ tickets is a weighted average by construction', () => {
    const dia = agentConsolidateDay({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: [200, 160],
      messageInstants: [em('10:00:00'), em('10:03:00'), em('10:08:00')],
    });
    expect(dia.effortSeg).toBe(360);
    expect(dia.tickets).toBe(2);
    expect(dia.sessionSeg).toBe(480);
    expect(dia.effortAverageByTicketSeg).toBe(180);
    expect(dia.occupancy).toBe(0.75);
  });

  it('with no measured session, occupancy is null, never infinite', () => {
    expect(occupancy(600, 0)).toBeNull();
    const dia = agentConsolidateDay({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: [],
      messageInstants: [],
    });
    expect(dia.occupancy).toBeNull();
    expect(dia.effortAverageByTicketSeg).toBeNull();
  });

  it('a full day weighs more than an empty day in the per-ticket average', () => {
    const cheio = agentConsolidateDay({
      dia: '2026-03-02',
      userId: 'u1',
      esforcosSeg: Array.from({ length: 10 }, () => 600),
      messageInstants: [],
    });
    const empty = agentConsolidateDay({
      dia: '2026-03-03',
      userId: 'u1',
      esforcosSeg: [1800, 1800],
      messageInstants: [],
    });
    // Dia cheio: 6.000s em 10 tickets (600s cada). Dia vazio: 3.600s em 2 (1.800s cada).
    // Weighted mean: 9,600 ÷ 12 = 800 seconds. Mean of daily means would be (600 + 1,800) ÷ 2 = 1,200 seconds.
    const ponderada =
      (cheio.effortSeg + empty.effortSeg) / (cheio.tickets + empty.tickets);
    expect(ponderada).toBe(800);
    expect(
      ((cheio.effortAverageByTicketSeg as number) + (empty.effortAverageByTicketSeg as number)) / 2,
    ).toBe(1200);
  });
});
