import { describe, expect, it } from 'vitest';

import type { ChamadaEstruturada } from '../cliente/index.js';
import { ErroFormatoIa } from '../cliente/index.js';
import { consumoDe } from '../consumo/index.js';
import { montarTranscricao, type MensagemTranscricao } from '../transcricao/index.js';
import { avaliarConversa, calcularNota, fracaoDoValor, type Formulario } from './index.js';

/**
 * Pesos: c1=1×1, c2=1×2, c3=2×2, c4=3×1. Somam 10, então cada ponto de peso vale
 * 10 pontos de nota. Números redondos de propósito: teste de cálculo com número
 * feio esconde erro de arredondamento.
 */
const formulario: Formulario = {
  id: 'form-1',
  nome: 'Formulário de teste',
  notaMaxima: 100,
  grupos: [
    {
      id: 'g1',
      nome: 'Abertura',
      peso: 1,
      criterios: [
        { id: 'c1', nome: 'Saudou', peso: 1, tipo: 'conforme', fatal: false },
        { id: 'c2', nome: 'Confirmou necessidade', peso: 2, tipo: 'conforme', fatal: false },
      ],
    },
    {
      id: 'g2',
      nome: 'Condução',
      peso: 2,
      criterios: [{ id: 'c3', nome: 'Clareza', peso: 2, tipo: 'escala', fatal: false }],
    },
    {
      id: 'g3',
      nome: 'Conformidade',
      peso: 3,
      criterios: [{ id: 'c4', nome: 'Protegeu dado', peso: 1, tipo: 'conforme', fatal: true }],
    },
  ],
};

const respostas = (
  valores: Record<string, string>,
  evidencias: Record<string, string | null> = {},
) =>
  Object.entries(valores).map(([criterioId, valor]) => ({
    criterioId,
    valor,
    justificativa: 'porque sim',
    evidenciaMensagemId: evidencias[criterioId] ?? null,
  }));

describe('fração do valor', () => {
  it('traduz conforme, não conforme e não se aplica', () => {
    const c = formulario.grupos[0]!.criterios[0]!;
    expect(fracaoDoValor(c, 'conforme')).toBe(1);
    expect(fracaoDoValor(c, 'nao_conforme')).toBe(0);
    expect(fracaoDoValor(c, 'nao_se_aplica')).toBeNull();
    expect(fracaoDoValor(c, ' CONFORME ')).toBe(1);
  });

  it('divide escala e nota pelos respectivos tetos', () => {
    const escala = formulario.grupos[1]!.criterios[0]!;
    expect(fracaoDoValor(escala, '5')).toBe(1);
    expect(fracaoDoValor(escala, '3')).toBeCloseTo(0.6, 10);
    expect(fracaoDoValor(escala, '0')).toBe(0);
    expect(fracaoDoValor({ ...escala, tipo: 'nota' }, '7')).toBeCloseTo(0.7, 10);
  });

  it('recusa valor fora do domínio em vez de chutar', () => {
    const c = formulario.grupos[0]!.criterios[0]!;
    expect(() => fracaoDoValor(c, 'mais ou menos')).toThrow(ErroFormatoIa);
    expect(() => fracaoDoValor(formulario.grupos[1]!.criterios[0]!, '9')).toThrow(ErroFormatoIa);
    expect(() => fracaoDoValor(formulario.grupos[1]!.criterios[0]!, '-1')).toThrow(ErroFormatoIa);
  });
});

describe('cálculo da nota', () => {
  it('dá nota cheia quando tudo sai conforme', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'conforme' }),
    );
    expect(r.nota).toBe(100);
    expect(r.fataisReprovados).toEqual([]);
    expect(r.respostas.map((x) => x.pontos)).toEqual([10, 20, 40, 30]);
  });

  it('pondera pelo peso do grupo vezes o peso do critério', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'nao_conforme', c2: 'conforme', c3: '5', c4: 'conforme' }),
    );
    // Só o c1 (peso 1 de 10) caiu.
    expect(r.nota).toBe(90);
  });

  it('usa a escala proporcionalmente', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '3', c4: 'conforme' }),
    );
    expect(r.nota).toBe(84); // 10 + 20 + 40×0,6 + 30
  });

  it('a soma dos pontos é a nota antes do fatal', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'nao_conforme', c3: '2', c4: 'conforme' }),
    );
    const soma = r.respostas.reduce((s, x) => s + x.pontos, 0);
    expect(soma).toBeCloseTo(r.notaAntesDoFatal, 10);
  });

  it('critério fatal reprovado zera a nota, mas guarda quanto valeria', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'nao_conforme' }),
    );
    expect(r.nota).toBe(0);
    expect(r.notaAntesDoFatal).toBe(70);
    expect(r.fataisReprovados).toEqual(['c4']);
  });

  it('critério fatal marcado como não se aplica não zera nada', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'nao_se_aplica' }),
    );
    expect(r.fataisReprovados).toEqual([]);
    expect(r.nota).toBe(100);
  });

  it('não se aplica sai do denominador — não é zero', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'nao_se_aplica', c3: '5', c4: 'conforme' }),
    );
    // Peso total cai de 10 para 8; quem sobrou está todo conforme.
    expect(r.nota).toBe(100);
    expect(r.respostas.find((x) => x.criterioId === 'c2')!.pontos).toBe(0);
  });

  it('tudo não se aplica dá zero sem dividir por zero', () => {
    const r = calcularNota(
      formulario,
      respostas({
        c1: 'nao_se_aplica',
        c2: 'nao_se_aplica',
        c3: 'nao_se_aplica',
        c4: 'nao_se_aplica',
      }),
    );
    expect(r.nota).toBe(0);
    expect(Number.isNaN(r.nota)).toBe(false);
  });

  it('critério sem resposta é erro, nunca zero silencioso', () => {
    expect(() =>
      calcularNota(formulario, respostas({ c1: 'conforme', c2: 'conforme', c3: '5' })),
    ).toThrow(ErroFormatoIa);
  });
});

// ——— avaliação com dublê do modelo ———

const conversa: MensagemTranscricao[] = [
  {
    id: 'uuid-a',
    criadaEm: new Date('2026-03-02T13:00:00Z'),
    direcao: 'entrada',
    autorTipo: 'contato',
    tipo: 'texto',
    conteudo: 'bom dia, preciso da segunda via',
  },
  {
    id: 'uuid-b',
    criadaEm: new Date('2026-03-02T13:01:00Z'),
    direcao: 'saida',
    autorTipo: 'atendente',
    autorNome: 'Camila',
    tipo: 'texto',
    conteudo: 'segue em anexo',
  },
];

interface SaidaGravada {
  respostas: {
    criterioId: string;
    valor: string;
    justificativa: string;
    evidencia: string | null;
  }[];
  confianca: number;
}

/** Dublê com resposta gravada: nenhum teste gasta chamada real. */
function duble(saida: SaidaGravada): ChamadaEstruturada {
  return async () =>
    ({
      dados: saida as never,
      consumo: consumoDe('claude-sonnet-5', 4_000, 500),
      modelo: 'claude-sonnet-5',
    }) as never;
}

const transcricao = montarTranscricao(conversa);

describe('avaliarConversa', () => {
  it('resolve o rótulo da evidência para o id da mensagem', async () => {
    const r = await avaliarConversa({
      formulario,
      transcricao,
      chamar: duble({
        confianca: 0.8,
        respostas: [
          { criterioId: 'c1', valor: 'conforme', justificativa: 'saudou', evidencia: 'm2' },
          {
            criterioId: 'c2',
            valor: 'nao_conforme',
            justificativa: 'não confirmou',
            evidencia: 'm2',
          },
          { criterioId: 'c3', valor: '5', justificativa: 'claro', evidencia: null },
          {
            criterioId: 'c4',
            valor: 'conforme',
            justificativa: 'sem dado exposto',
            evidencia: null,
          },
        ],
      }),
    });

    expect(r.respostas.find((x) => x.criterioId === 'c2')!.evidenciaMensagemId).toBe('uuid-b');
    expect(r.respostas.find((x) => x.criterioId === 'c3')!.evidenciaMensagemId).toBeNull();
    expect(r.nota).toBe(80);
    expect(r.confianca).toBe(0.8);
    expect(r.prompt).toBe('avaliacao@v1');
    expect(r.consumo.custoCentavos).toBeGreaterThan(0);
  });

  it('recusa evidência que não existe na transcrição', async () => {
    await expect(
      avaliarConversa({
        formulario,
        transcricao,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', valor: 'nao_conforme', justificativa: 'x', evidencia: 'm99' },
            { criterioId: 'c2', valor: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', valor: '5', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', valor: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/m99/);
  });

  it('exige evidência quando o critério não sai conforme', async () => {
    await expect(
      avaliarConversa({
        formulario,
        transcricao,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', valor: 'nao_conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c2', valor: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', valor: '5', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', valor: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/evidência/i);
  });

  it('exige evidência também em escala abaixo do máximo', async () => {
    await expect(
      avaliarConversa({
        formulario,
        transcricao,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', valor: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c2', valor: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', valor: '2', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', valor: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(ErroFormatoIa);
  });

  it('recusa critério que não existe no formulário', async () => {
    await expect(
      avaliarConversa({
        formulario,
        transcricao,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c-inventado', valor: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/não existe no formulário/);
  });

  it('recusa critério respondido duas vezes', async () => {
    await expect(
      avaliarConversa({
        formulario,
        transcricao,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', valor: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c1', valor: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/duas vezes/);
  });
});
