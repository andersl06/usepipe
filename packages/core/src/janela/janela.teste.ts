import { describe, expect, it } from 'vitest';

import {
  JANELA_SEG,
  avaliarEnvio,
  calcularExpiracao,
  canalTemJanela,
  classificarCusto,
  janelaAberta,
  pertoDeExpirar,
  registrarMensagemDoContato,
  segundosRestantes,
  type CategoriaCobranca,
  type CategoriaTemplate,
  type TipoCanal,
} from './index.js';

const utc = (iso: string) => new Date(iso);

/** Cliente falou às 10:00 de 02/03; a janela vai até 10:00 de 03/03. */
const ULTIMA_DO_CONTATO = utc('2026-03-02T10:00:00Z');
const EXPIRA_EM = utc('2026-03-03T10:00:00Z');

describe('janela de 24 horas', () => {
  it('dura exatamente 86.400 segundos', () => {
    expect(JANELA_SEG).toBe(86_400);
  });

  it('expiração é a última mensagem do contato mais 24h', () => {
    expect(calcularExpiracao(ULTIMA_DO_CONTATO)).toEqual(EXPIRA_EM);
  });

  it('sem mensagem do contato não há janela', () => {
    expect(calcularExpiracao(null)).toBeNull();
  });

  it('cada mensagem nova do contato reabre a janela', () => {
    const primeira = registrarMensagemDoContato(ULTIMA_DO_CONTATO, 'm1');
    const segunda = registrarMensagemDoContato(utc('2026-03-02T18:00:00Z'), 'm2');
    expect(primeira.expiraEm).toEqual(EXPIRA_EM);
    expect(segunda.expiraEm).toEqual(utc('2026-03-03T18:00:00Z'));
    expect(segunda.abertaPorMensagemId).toBe('m2');
  });

  const casosLimite: { nome: string; agora: string; aberta: boolean; restante: number }[] = [
    { nome: 'logo depois da mensagem', agora: '2026-03-02T10:00:01Z', aberta: true, restante: 86_399 },
    { nome: 'faltando um segundo', agora: '2026-03-03T09:59:59Z', aberta: true, restante: 1 },
    { nome: 'faltando um milissegundo', agora: '2026-03-03T09:59:59.999Z', aberta: true, restante: 0.001 },
    // A borda que decide se a tela oferece texto livre ou template.
    { nome: 'no exato segundo da expiração, já fechou', agora: '2026-03-03T10:00:00Z', aberta: false, restante: 0 },
    { nome: 'um milissegundo depois', agora: '2026-03-03T10:00:00.001Z', aberta: false, restante: 0 },
    { nome: 'muito depois', agora: '2026-03-05T10:00:00Z', aberta: false, restante: 0 },
  ];

  for (const caso of casosLimite) {
    it(caso.nome, () => {
      expect(janelaAberta(EXPIRA_EM, utc(caso.agora))).toBe(caso.aberta);
      expect(segundosRestantes(EXPIRA_EM, utc(caso.agora))).toBeCloseTo(caso.restante, 6);
    });
  }

  it('janela nula está fechada', () => {
    expect(janelaAberta(null, ULTIMA_DO_CONTATO)).toBe(false);
    expect(segundosRestantes(null, ULTIMA_DO_CONTATO)).toBe(0);
  });

  const casosPerto: [string, boolean][] = [
    ['2026-03-03T08:59:59Z', false], // falta 1h e 1s
    ['2026-03-03T09:00:00Z', true], // falta exatamente 1h
    ['2026-03-03T09:59:00Z', true], // falta 1 min
    ['2026-03-03T10:00:00Z', false], // já fechou: não é "perto", é fora
  ];
  for (const [agora, esperado] of casosPerto) {
    it(`perto de expirar em ${agora}: ${esperado}`, () => {
      expect(pertoDeExpirar(EXPIRA_EM, utc(agora))).toBe(esperado);
    });
  }
});

describe('canais', () => {
  const casos: [TipoCanal, boolean][] = [
    ['whatsapp_cloud', true],
    ['email', false],
    ['widget', false],
  ];
  for (const [canal, esperado] of casos) {
    it(`${canal} ${esperado ? 'tem' : 'não tem'} janela`, () => {
      expect(canalTemJanela(canal)).toBe(esperado);
    });
  }
});

describe('classificação de custo', () => {
  const casos: {
    nome: string;
    conteudo: 'texto_livre' | 'template';
    dentroDaJanela: boolean;
    categoriaTemplate?: CategoriaTemplate;
    esperado: CategoriaCobranca | null;
  }[] = [
    { nome: 'texto livre dentro da janela é livre', conteudo: 'texto_livre', dentroDaJanela: true, esperado: 'livre' },
    { nome: 'texto livre fora da janela não tem custo porque não sai', conteudo: 'texto_livre', dentroDaJanela: false, esperado: null },
    { nome: 'template de utilidade fora da janela', conteudo: 'template', dentroDaJanela: false, categoriaTemplate: 'utilidade', esperado: 'utilidade' },
    { nome: 'template de marketing dentro da janela ainda cobra como template', conteudo: 'template', dentroDaJanela: true, categoriaTemplate: 'marketing', esperado: 'marketing' },
    { nome: 'template de autenticação', conteudo: 'template', dentroDaJanela: false, categoriaTemplate: 'autenticacao', esperado: 'autenticacao' },
    { nome: 'template sem categoria não classifica', conteudo: 'template', dentroDaJanela: false, esperado: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(
        classificarCusto({
          conteudo: caso.conteudo,
          dentroDaJanela: caso.dentroDaJanela,
          categoriaTemplate: caso.categoriaTemplate ?? null,
        }),
      ).toBe(caso.esperado);
    });
  }
});

describe('avaliação de envio', () => {
  const dentro = utc('2026-03-02T20:00:00Z');
  const fora = utc('2026-03-04T20:00:00Z');

  it('dentro da janela o Desk oferece texto livre', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: dentro,
      conteudo: 'texto_livre',
    });
    expect(saida).toEqual({
      permitido: true,
      modo: 'texto_livre',
      motivo: null,
      restanteSeg: 50_400, // de 20:00 do dia 2 até 10:00 do dia 3 = 14 horas
      categoriaCobranca: 'livre',
      dentroDaJanela: true,
    });
  });

  it('fora da janela o campo de texto vira seletor de template, com motivo', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: fora,
      conteudo: 'texto_livre',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.modo).toBe('somente_template');
    expect(saida.motivo).toBe('janela_fechada');
    expect(saida.restanteSeg).toBe(0);
    expect(saida.categoriaCobranca).toBeNull();
  });

  it('fora da janela, template aprovado passa', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: fora,
      conteudo: 'template',
      categoriaTemplate: 'utilidade',
    });
    expect(saida.permitido).toBe(true);
    expect(saida.categoriaCobranca).toBe('utilidade');
  });

  it('template sem categoria é recusado antes de chegar na Meta', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: fora,
      conteudo: 'template',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('template_sem_categoria');
  });

  it('contato que nunca falou não tem janela aberta', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: null,
      agora: dentro,
      conteudo: 'texto_livre',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('janela_fechada');
  });

  it('no exato segundo da expiração o envio livre já é recusado', () => {
    const saida = avaliarEnvio({
      canal: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: EXPIRA_EM,
      conteudo: 'texto_livre',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('janela_fechada');
    expect(saida.dentroDaJanela).toBe(false);
  });

  const semJanela: TipoCanal[] = ['email', 'widget'];
  for (const canal of semJanela) {
    it(`${canal} não tem janela: texto livre sempre permitido`, () => {
      const saida = avaliarEnvio({ canal, expiraEm: null, agora: fora, conteudo: 'texto_livre' });
      expect(saida.permitido).toBe(true);
      expect(saida.modo).toBe('texto_livre');
      expect(saida.dentroDaJanela).toBe(true);
      expect(saida.categoriaCobranca).toBe('livre');
      expect(saida.restanteSeg).toBe(0);
    });
  }
});
