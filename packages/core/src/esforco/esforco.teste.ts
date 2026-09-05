import { describe, expect, it } from 'vitest';

import {
  BYTES_POR_SEGUNDO_AUDIO,
  CARACTERES_POR_MINUTO_ESCRITA,
  CARACTERES_POR_MINUTO_LEITURA,
  LIMITE_INTERVALO_SESSAO_SEG,
  calcularEsforcoConversa,
  calcularEsforcoPorConversa,
  calcularTempoEmSessao,
  consolidarDiaDoAtendente,
  duracaoDeAudio,
  ocupacao,
  segundosDeEscrita,
  segundosDeLeitura,
  type MensagemEsforco,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

const texto = (n: number) => 'a'.repeat(n);

describe('constantes da régua', () => {
  it('são exatamente as do relatório validado em produção', () => {
    expect(CARACTERES_POR_MINUTO_ESCRITA).toBe(200);
    expect(CARACTERES_POR_MINUTO_LEITURA).toBe(1000);
    // Opus a ~16 kbps: 16.000 bits ÷ 8 = 2.000 bytes por segundo.
    expect(BYTES_POR_SEGUNDO_AUDIO).toBe(2000);
    expect(LIMITE_INTERVALO_SESSAO_SEG).toBe(600);
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

  const casosLeitura: [number, number][] = [
    [0, 0],
    [1000, 60], // 1.000 caracteres = 1 minuto de leitura
    [500, 30],
    [250, 15],
    [2000, 120],
  ];
  for (const [caracteres, segundos] of casosLeitura) {
    it(`ler ${caracteres} caracteres custa ${segundos}s`, () => {
      expect(segundosDeLeitura(caracteres)).toBe(segundos);
    });
  }

  it('ler é cinco vezes mais rápido que escrever', () => {
    expect(segundosDeEscrita(1000) / segundosDeLeitura(1000)).toBe(5);
  });
});

describe('duração de áudio', () => {
  const casos: { nome: string; anexo: unknown; esperado: number | null }[] = [
    { nome: 'metadado presente manda', anexo: { duracaoSeg: 12, bytes: 999_999 }, esperado: 12 },
    { nome: 'sem metadado, estima por tamanho', anexo: { bytes: 30_000 }, esperado: 15 },
    { nome: 'metadado zero é duração válida', anexo: { duracaoSeg: 0, bytes: 4000 }, esperado: 0 },
    { nome: 'sem metadado e sem tamanho', anexo: {}, esperado: null },
    { nome: 'tamanho zero não estima nada', anexo: { bytes: 0 }, esperado: null },
    { nome: 'anexo ausente', anexo: null, esperado: null },
    { nome: 'duração negativa é ignorada e cai para o tamanho', anexo: { duracaoSeg: -3, bytes: 8000 }, esperado: 4 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(duracaoDeAudio(caso.anexo as never)).toBe(caso.esperado);
    });
  }
});

describe('esforço por conversa', () => {
  /**
   * Conta feita à mão:
   *  escrita  = 400 (texto) + 100 (nota interna) = 500 chars → 500×60÷200 = 150s
   *  leitura  = 2.000 chars                                   → 2.000×60÷1.000 = 120s
   *  escuta   = áudio do cliente com metadado                 → 45s
   *  fala     = áudio do atendente de 60.000 bytes            → 60.000÷2.000 = 30s
   *  esforço  = 150 + 120 + 45 + 30                           = 345s
   *  resposta pronta: 600 chars fora do esforço               → 600×60÷200 = 180s
   */
  const mensagens: MensagemEsforco[] = [
    { conversaId: 'c1', em: em('10:00:00'), autor: 'bot', direcao: 'saida', tipo: 'texto', conteudo: texto(5000) },
    { conversaId: 'c1', em: em('10:01:00'), autor: 'contato', direcao: 'entrada', tipo: 'texto', conteudo: texto(2000) },
    { conversaId: 'c1', em: em('10:02:00'), autor: 'atendente', direcao: 'saida', tipo: 'texto', conteudo: texto(400), usuarioId: 'u1' },
    { conversaId: 'c1', em: em('10:03:00'), autor: 'atendente', direcao: 'saida', tipo: 'texto', conteudo: texto(600), usuarioId: 'u1', respostaProntaId: 'rp-1' },
    { conversaId: 'c1', em: em('10:04:00'), autor: 'contato', direcao: 'entrada', tipo: 'audio', anexo: { duracaoSeg: 45 } },
    { conversaId: 'c1', em: em('10:05:00'), autor: 'atendente', direcao: 'saida', tipo: 'audio', usuarioId: 'u1', anexo: { bytes: 60_000 } },
    { conversaId: 'c1', em: em('10:06:00'), autor: 'contato', direcao: 'entrada', tipo: 'audio', anexo: {} },
    { conversaId: 'c1', em: em('10:07:00'), autor: 'atendente', direcao: 'interna', tipo: 'texto', conteudo: texto(100), usuarioId: 'u1' },
    { conversaId: 'c1', em: em('10:08:00'), autor: 'sistema', direcao: 'interna', tipo: 'texto', conteudo: texto(300) },
  ];

  const esforco = calcularEsforcoConversa(mensagens);

  it('separa escrita, leitura, escuta e fala', () => {
    expect(esforco.charsEscritos).toBe(500);
    expect(esforco.charsLidos).toBe(2000);
    expect(esforco.audioOuvidoSeg).toBe(45);
    expect(esforco.audioGravadoSeg).toBe(30);
  });

  it('soma 345 segundos de esforço', () => {
    expect(esforco.esforcoSeg).toBe(345);
  });

  it('resposta pronta sai do esforço e vai para coluna separada', () => {
    expect(esforco.charsDeRespostaPronta).toBe(600);
    expect(esforco.esforcoRespostaProntaSeg).toBe(180);
    // Os 180s da resposta pronta ficam fora dos 345s de esforço.
    expect(esforco.esforcoSeg).toBe(345);
  });

  it('conta o áudio sem metadado de duração em vez de inventar tempo', () => {
    expect(esforco.audiosSemMetadado).toBe(1);
  });

  it('mensagem de bot e de sistema não geram esforço nenhum', () => {
    const soMaquina = calcularEsforcoConversa([
      { conversaId: 'x', em: em('10:00:00'), autor: 'bot', direcao: 'saida', tipo: 'texto', conteudo: texto(9000) },
      { conversaId: 'x', em: em('10:01:00'), autor: 'sistema', direcao: 'interna', tipo: 'texto', conteudo: texto(9000) },
    ]);
    expect(soMaquina.esforcoSeg).toBe(0);
    expect(soMaquina.charsEscritos).toBe(0);
    expect(soMaquina.charsLidos).toBe(0);
  });

  it('template também não foi digitado à mão', () => {
    const comTemplate = calcularEsforcoConversa([
      { conversaId: 'x', em: em('10:00:00'), autor: 'atendente', direcao: 'saida', tipo: 'template', conteudo: texto(200), usuarioId: 'u1' },
    ]);
    expect(comTemplate.charsEscritos).toBe(0);
    expect(comTemplate.charsDeRespostaPronta).toBe(200);
    expect(comTemplate.esforcoSeg).toBe(0);
    expect(comTemplate.esforcoRespostaProntaSeg).toBe(60);
  });

  it('conversa vazia devolve tudo zerado', () => {
    const vazio = calcularEsforcoConversa([], { conversaId: 'vazia' });
    expect(vazio.esforcoSeg).toBe(0);
    expect(vazio.conversaId).toBe('vazia');
    expect(vazio.atendenteId).toBeNull();
  });

  it('descobre o atendente pela primeira mensagem dele', () => {
    expect(esforco.atendenteId).toBe('u1');
  });

  it('agrupa por conversa em ordem determinística', () => {
    const porConversa = calcularEsforcoPorConversa([
      { conversaId: 'c2', em: em('10:00:00'), autor: 'contato', direcao: 'entrada', tipo: 'texto', conteudo: texto(1000) },
      { conversaId: 'c1', em: em('10:00:00'), autor: 'atendente', direcao: 'saida', tipo: 'texto', conteudo: texto(200), usuarioId: 'u1' },
    ]);
    expect(porConversa.map((e) => e.conversaId)).toEqual(['c1', 'c2']);
    expect(porConversa[0]?.esforcoSeg).toBe(60);
    expect(porConversa[1]?.esforcoSeg).toBe(60);
  });
});

describe('régua de apoio: tempo em sessão', () => {
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
    const sessao = calcularTempoEmSessao(instantes);
    expect(sessao.sessaoSeg).toBe(840);
    expect(sessao.blocos.map((b) => b.segundos)).toEqual([480, 360, 0]);
    expect(sessao.blocos.map((b) => b.mensagens)).toEqual([3, 3, 1]);
    expect(sessao.mensagens).toBe(7);
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
      expect(calcularTempoEmSessao(caso.instantes).sessaoSeg).toBe(caso.esperado);
    });
  }

  it('não depende da ordem em que as mensagens chegam', () => {
    const embaralhado = [...instantes].reverse();
    expect(calcularTempoEmSessao(embaralhado).sessaoSeg).toBe(840);
  });

  it('aceita limite configurável', () => {
    expect(calcularTempoEmSessao(instantes, { limiteSeg: 1800 }).sessaoSeg).toBe(3600);
  });
});

describe('consolidação do dia do atendente', () => {
  it('esforço ÷ sessão vira ocupação; esforço ÷ tickets é média ponderada por construção', () => {
    const dia = consolidarDiaDoAtendente({
      dia: '2026-03-02',
      usuarioId: 'u1',
      esforcosSeg: [200, 160],
      instantesDeMensagem: [em('10:00:00'), em('10:03:00'), em('10:08:00')],
    });
    expect(dia.esforcoSeg).toBe(360);
    expect(dia.tickets).toBe(2);
    expect(dia.sessaoSeg).toBe(480);
    expect(dia.esforcoMedioPorTicketSeg).toBe(180);
    expect(dia.ocupacao).toBe(0.75);
  });

  it('sem sessão medida a ocupação é null, nunca infinito', () => {
    expect(ocupacao(600, 0)).toBeNull();
    const dia = consolidarDiaDoAtendente({
      dia: '2026-03-02',
      usuarioId: 'u1',
      esforcosSeg: [],
      instantesDeMensagem: [],
    });
    expect(dia.ocupacao).toBeNull();
    expect(dia.esforcoMedioPorTicketSeg).toBeNull();
  });

  it('dia cheio pesa mais que dia vazio na média por ticket', () => {
    const cheio = consolidarDiaDoAtendente({
      dia: '2026-03-02',
      usuarioId: 'u1',
      esforcosSeg: Array.from({ length: 10 }, () => 600),
      instantesDeMensagem: [],
    });
    const vazio = consolidarDiaDoAtendente({
      dia: '2026-03-03',
      usuarioId: 'u1',
      esforcosSeg: [1800, 1800],
      instantesDeMensagem: [],
    });
    // Dia cheio: 6.000s em 10 tickets (600s cada). Dia vazio: 3.600s em 2 (1.800s cada).
    // Ponderada: 9.600 ÷ 12 = 800s. Média de médias daria (600 + 1.800) ÷ 2 = 1.200s.
    const ponderada =
      (cheio.esforcoSeg + vazio.esforcoSeg) / (cheio.tickets + vazio.tickets);
    expect(ponderada).toBe(800);
    expect(
      ((cheio.esforcoMedioPorTicketSeg as number) + (vazio.esforcoMedioPorTicketSeg as number)) / 2,
    ).toBe(1200);
  });
});
