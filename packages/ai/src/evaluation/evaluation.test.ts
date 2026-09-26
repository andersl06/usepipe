import { describe, expect, it } from 'vitest';

import type { ChamadaEstruturada } from '../cliente/index.js';
import { FormatIaError } from '../cliente/index.js';
import { consumoDe } from '../consumo/index.js';
import { montarTranscription, type MessageTranscription } from '../transcription/index.js';
import { avaliarConversation, calcularNota, valueFraction, type Formulario } from './index.js';

/**
 * Weights: c1=1×1, c2=1×2, c3=2×2, c4=3×1, totaling 10; each weight point is worth 10 score points. Round numbers are intentional: awkward arithmetic would obscure rounding errors in this calculation test.
 */
const formulario: Formulario = {
  id: 'form-1',
  nome: 'Formulário de teste',
  notaMaxima: 100,
  groups: [
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
  values: Record<string, string>,
  evidencias: Record<string, string | null> = {},
) =>
  Object.entries(values).map(([criterioId, value]) => ({
    criterioId,
    value,
    justificativa: 'porque sim',
    evidenciaMessageId: evidencias[criterioId] ?? null,
  }));

describe('fraction of the value', () => {
  it('traduz conforme, não conforme e não se aplica', () => {
    const c = formulario.groups[0]!.criterios[0]!;
    expect(valueFraction(c, 'conforme')).toBe(1);
    expect(valueFraction(c, 'nao_conforme')).toBe(0);
    expect(valueFraction(c, 'nao_se_aplica')).toBeNull();
    expect(valueFraction(c, ' CONFORME ')).toBe(1);
  });

  it('divide escala e nota pelos respectivos tetos', () => {
    const escala = formulario.groups[1]!.criterios[0]!;
    expect(valueFraction(escala, '5')).toBe(1);
    expect(valueFraction(escala, '3')).toBeCloseTo(0.6, 10);
    expect(valueFraction(escala, '0')).toBe(0);
    expect(valueFraction({ ...escala, tipo: 'nota' }, '7')).toBeCloseTo(0.7, 10);
  });

  it('rejects a value outside the domain instead of guessing', () => {
    const c = formulario.groups[0]!.criterios[0]!;
    expect(() => valueFraction(c, 'mais ou menos')).toThrow(FormatIaError);
    expect(() => valueFraction(formulario.groups[1]!.criterios[0]!, '9')).toThrow(FormatIaError);
    expect(() => valueFraction(formulario.groups[1]!.criterios[0]!, '-1')).toThrow(FormatIaError);
  });
});

describe('cálculo da nota', () => {
  it('dá nota cheia quando tudo sai conforme', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'conforme' }),
    );
    expect(r.nota).toBe(100);
    expect(r.fatalReprovados).toEqual([]);
    expect(r.respostas.map((x) => x.pontos)).toEqual([10, 20, 40, 30]);
  });

  it('pondera pelo peso do grupo vezes o peso do critério', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'nao_conforme', c2: 'conforme', c3: '5', c4: 'conforme' }),
    );
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

  it('a failed fatal criterion zeros the score but keeps what it would have been worth', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'nao_conforme' }),
    );
    expect(r.nota).toBe(0);
    expect(r.notaAntesDoFatal).toBe(70);
    expect(r.fatalReprovados).toEqual(['c4']);
  });

  it('critério fatal marcado como não se aplica não zera nada', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'conforme', c3: '5', c4: 'nao_se_aplica' }),
    );
    expect(r.fatalReprovados).toEqual([]);
    expect(r.nota).toBe(100);
  });

  it('não se aplica sai do denominador — não é zero', () => {
    const r = calcularNota(
      formulario,
      respostas({ c1: 'conforme', c2: 'nao_se_aplica', c3: '5', c4: 'conforme' }),
    );
    expect(r.nota).toBe(100);
    expect(r.respostas.find((x) => x.criterioId === 'c2')!.pontos).toBe(0);
  });

  it('all not-applicable gives zero without dividing by zero', () => {
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

  it('a criterion with no answer is an error, never a silent zero', () => {
    expect(() =>
      calcularNota(formulario, respostas({ c1: 'conforme', c2: 'conforme', c3: '5' })),
    ).toThrow(FormatIaError);
  });
});


const conversation: MessageTranscription[] = [
  {
    id: 'uuid-a',
    criadaEm: new Date('2026-03-02T13:00:00Z'),
    direction: 'entrada',
    autorTipo: 'contato',
    tipo: 'texto',
    conteudo: 'bom dia, preciso da segunda via',
  },
  {
    id: 'uuid-b',
    criadaEm: new Date('2026-03-02T13:01:00Z'),
    direction: 'saida',
    autorTipo: 'atendente',
    autorNome: 'Camila',
    tipo: 'texto',
    conteudo: 'segue em anexo',
  },
];

interface SaidaGravada {
  respostas: {
    criterioId: string;
    value: string;
    justificativa: string;
    evidencia: string | null;
  }[];
  confianca: number;
}

/** Recorded response stub: tests make no real model calls. */
function duble(saida: SaidaGravada): ChamadaEstruturada {
  return async () =>
    ({
      dados: saida as never,
      consumo: consumoDe('claude-sonnet-5', 4_000, 500),
      modelo: 'claude-sonnet-5',
    }) as never;
}

const transcription = montarTranscription(conversation);

describe('evaluateConversation', () => {
  it('resolves the evidence label to the message id', async () => {
    const r = await avaliarConversation({
      formulario,
      transcription,
      chamar: duble({
        confianca: 0.8,
        respostas: [
          { criterioId: 'c1', value: 'conforme', justificativa: 'saudou', evidencia: 'm2' },
          {
            criterioId: 'c2',
            value: 'nao_conforme',
            justificativa: 'não confirmou',
            evidencia: 'm2',
          },
          { criterioId: 'c3', value: '5', justificativa: 'claro', evidencia: null },
          {
            criterioId: 'c4',
            value: 'conforme',
            justificativa: 'sem dado exposto',
            evidencia: null,
          },
        ],
      }),
    });

    expect(r.respostas.find((x) => x.criterioId === 'c2')!.evidenciaMessageId).toBe('uuid-b');
    expect(r.respostas.find((x) => x.criterioId === 'c3')!.evidenciaMessageId).toBeNull();
    expect(r.nota).toBe(80);
    expect(r.confianca).toBe(0.8);
    expect(r.prompt).toBe('avaliacao@v1');
    expect(r.consumo.custoCentavos).toBeGreaterThan(0);
  });

  it('rejects evidence that does not exist in the transcript', async () => {
    await expect(
      avaliarConversation({
        formulario,
        transcription,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', value: 'nao_conforme', justificativa: 'x', evidencia: 'm99' },
            { criterioId: 'c2', value: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', value: '5', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', value: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/m99/);
  });

  it('exige evidência quando o critério não sai conforme', async () => {
    await expect(
      avaliarConversation({
        formulario,
        transcription,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', value: 'nao_conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c2', value: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', value: '5', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', value: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/evidência/i);
  });

  it('exige evidência também em escala abaixo do máximo', async () => {
    await expect(
      avaliarConversation({
        formulario,
        transcription,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', value: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c2', value: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c3', value: '2', justificativa: 'x', evidencia: null },
            { criterioId: 'c4', value: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(FormatIaError);
  });

  it('recusa critério que não existe no formulário', async () => {
    await expect(
      avaliarConversation({
        formulario,
        transcription,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c-inventado', value: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/não existe no formulário/);
  });

  it('recusa critério respondido duas vezes', async () => {
    await expect(
      avaliarConversation({
        formulario,
        transcription,
        chamar: duble({
          confianca: 0.9,
          respostas: [
            { criterioId: 'c1', value: 'conforme', justificativa: 'x', evidencia: null },
            { criterioId: 'c1', value: 'conforme', justificativa: 'x', evidencia: null },
          ],
        }),
      }),
    ).rejects.toThrow(/duas vezes/);
  });
});
