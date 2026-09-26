import { describe, expect, it } from 'vitest';

import {
  WINDOW_SEG,
  avaliarEnvio,
  calculateExpiration,
  channelHasWindow,
  classificarCusto,
  windowOpen,
  pertoDeExpirar,
  contactRegisterMessage,
  segundosRestantes,
  type CategoriaCobranca,
  type CategoriaTemplate,
  type TypeChannel,
} from './index.js';

const utc = (iso: string) => new Date(iso);


const LAST_OF_CONTACT = utc('2026-03-02T10:00:00Z');
const EXPIRA_EM = utc('2026-03-03T10:00:00Z');

describe('24-hour window', () => {
  it('dura exatamente 86.400 segundos', () => {
    expect(WINDOW_SEG).toBe(86_400);
  });

  it('expiration is the contact\'s last message plus 24h', () => {
    expect(calculateExpiration(LAST_OF_CONTACT)).toEqual(EXPIRA_EM);
  });

  it('with no message from the contact there is no window', () => {
    expect(calculateExpiration(null)).toBeNull();
  });

  it('every new message from the contact reopens the window', () => {
    const first = contactRegisterMessage(LAST_OF_CONTACT, 'm1');
    const segunda = contactRegisterMessage(utc('2026-03-02T18:00:00Z'), 'm2');
    expect(first.expiraEm).toEqual(EXPIRA_EM);
    expect(segunda.expiraEm).toEqual(utc('2026-03-03T18:00:00Z'));
    expect(segunda.openByMessageId).toBe('m2');
  });

  const casosLimite: { nome: string; agora: string; aberta: boolean; restante: number }[] = [
    { nome: 'logo depois da mensagem', agora: '2026-03-02T10:00:01Z', aberta: true, restante: 86_399 },
    { nome: 'faltando um segundo', agora: '2026-03-03T09:59:59Z', aberta: true, restante: 1 },
    { nome: 'faltando um milissegundo', agora: '2026-03-03T09:59:59.999Z', aberta: true, restante: 0.001 },
    // Boundary that decides whether the UI offers free text or a template.
    { nome: 'no exato segundo da expiração, já fechou', agora: '2026-03-03T10:00:00Z', aberta: false, restante: 0 },
    { nome: 'um milissegundo depois', agora: '2026-03-03T10:00:00.001Z', aberta: false, restante: 0 },
    { nome: 'muito depois', agora: '2026-03-05T10:00:00Z', aberta: false, restante: 0 },
  ];

  for (const caso of casosLimite) {
    it(caso.nome, () => {
      expect(windowOpen(EXPIRA_EM, utc(caso.agora))).toBe(caso.aberta);
      expect(segundosRestantes(EXPIRA_EM, utc(caso.agora))).toBeCloseTo(caso.restante, 6);
    });
  }

  it('a null window is closed', () => {
    expect(windowOpen(null, LAST_OF_CONTACT)).toBe(false);
    expect(segundosRestantes(null, LAST_OF_CONTACT)).toBe(0);
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

describe('channels', () => {
  const casos: [TypeChannel, boolean][] = [
    ['whatsapp_cloud', true],
    ['email', false],
    ['widget', false],
  ];
  for (const [channel, esperado] of casos) {
    it(`${channel} ${esperado ? 'tem' : 'não tem'} janela`, () => {
      expect(channelHasWindow(channel)).toBe(esperado);
    });
  }
});

describe('cost classification', () => {
  const casos: {
    nome: string;
    conteudo: 'texto_livre' | 'template';
    withinWindow: boolean;
    categoriaTemplate?: CategoriaTemplate;
    esperado: CategoriaCobranca | null;
  }[] = [
    { nome: 'texto livre dentro da janela é livre', conteudo: 'texto_livre', withinWindow: true, esperado: 'livre' },
    { nome: 'texto livre fora da janela não tem custo porque não sai', conteudo: 'texto_livre', withinWindow: false, esperado: null },
    { nome: 'template de utilidade fora da janela', conteudo: 'template', withinWindow: false, categoriaTemplate: 'utilidade', esperado: 'utilidade' },
    { nome: 'template de marketing dentro da janela ainda cobra como template', conteudo: 'template', withinWindow: true, categoriaTemplate: 'marketing', esperado: 'marketing' },
    { nome: 'template de autenticação', conteudo: 'template', withinWindow: false, categoriaTemplate: 'autenticacao', esperado: 'autenticacao' },
    { nome: 'template sem categoria não classifica', conteudo: 'template', withinWindow: false, esperado: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(
        classificarCusto({
          conteudo: caso.conteudo,
          withinWindow: caso.withinWindow,
          categoriaTemplate: caso.categoriaTemplate ?? null,
        }),
      ).toBe(caso.esperado);
    });
  }
});

describe('send evaluation', () => {
  const dentro = utc('2026-03-02T20:00:00Z');
  const fora = utc('2026-03-04T20:00:00Z');

  it('inside the window the Desk offers free text', () => {
    const saida = avaliarEnvio({
      channel: 'whatsapp_cloud',
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

  it('outside the window the text field becomes a template selector, with a reason', () => {
    const saida = avaliarEnvio({
      channel: 'whatsapp_cloud',
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

  it('outside the window, an approved template passes', () => {
    const saida = avaliarEnvio({
      channel: 'whatsapp_cloud',
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
      channel: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: fora,
      conteudo: 'template',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('template_sem_categoria');
  });

  it('a contact who never spoke has no open window', () => {
    const saida = avaliarEnvio({
      channel: 'whatsapp_cloud',
      expiraEm: null,
      agora: dentro,
      conteudo: 'texto_livre',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('janela_fechada');
  });

  it('at the exact second of expiration, free-form sending is already rejected', () => {
    const saida = avaliarEnvio({
      channel: 'whatsapp_cloud',
      expiraEm: EXPIRA_EM,
      agora: EXPIRA_EM,
      conteudo: 'texto_livre',
    });
    expect(saida.permitido).toBe(false);
    expect(saida.motivo).toBe('janela_fechada');
    expect(saida.withinWindow).toBe(false);
  });

  const withoutWindow: TypeChannel[] = ['email', 'widget'];
  for (const channel of withoutWindow) {
    it(`${channel} não tem janela: texto livre sempre permitido`, () => {
      const saida = avaliarEnvio({ channel, expiraEm: null, agora: fora, conteudo: 'texto_livre' });
      expect(saida.permitido).toBe(true);
      expect(saida.modo).toBe('texto_livre');
      expect(saida.withinWindow).toBe(true);
      expect(saida.categoriaCobranca).toBe('livre');
      expect(saida.restanteSeg).toBe(0);
    });
  }
});
