/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder.UnitTests/Models/ConditionComparisonTests.cs e ConditionTests.cs
 * — modificado: xUnit/Shouldly → vitest; mensagens de validação em português.
 */
import { describe, expect, it } from 'vitest';
import {
  avaliarCondicaoBlip,
  delegadoBinario,
  delegadoUnario,
  validarCondicao,
} from './condicao.js';
import type { CondicaoBlip } from './condicao.js';
import { criarEntrada } from './contexto.js';
import type { Contexto } from './contexto.js';

describe('ConditionComparison', () => {
  const binarios: [string, string, string, boolean][] = [
    ['equals', 'Value 1', 'Value 1', true],
    ['equals', 'ValUe 1', 'value 1', true],
    ['equals', 'Value 😱🤢➡', 'Value 😱🤢➡', true],
    ['equals', 'Valuê 1', 'Válue 1', true],
    ['equals', 'Value 1', 'Value X', false],
    ['notEquals', 'Value 1', 'Value 1', false],
    ['notEquals', 'ValUe 1', 'value 1', false],
    ['notEquals', 'Valuê 1', 'Válue 1', false],
    ['notEquals', 'Value 1', 'Value X', true],
    ['startsWith', 'Value 1', 'Value 1', true],
    ['startsWith', 'ValUe 1', 'value 1', true],
    ['startsWith', 'Value 1', 'Valu', true],
    ['startsWith', 'Value 1', 'Balue', false],
    ['greaterThan', '12345', '1234', true],
    ['greaterThan', '12345', '12345', false],
    ['greaterThan', '1234', '12345', false],
    ['greaterThan', 'not a number', 'also not a number', false],
    ['approximateTo', 'Value 1', 'Value 1', true],
    ['approximateTo', 'ValUe 1', 'value 1', true],
    ['approximateTo', 'Valuê 1', 'Válue 1', true],
    ['approximateTo', 'Value 1', 'Vilue X', true],
    ['approximateTo', 'Value 1', 'Hello world', false],
  ];
  it.each(binarios)('%s("%s", "%s") = %s', (comparacao, v1, v2, esperado) => {
    expect(delegadoBinario(comparacao as never)(v1, v2)).toBe(esperado);
  });

  const unarios: [string, string | null, boolean][] = [
    ['exists', 'Value', true],
    ['exists', '', false],
    ['exists', null, false],
    ['notExists', 'Value', false],
    ['notExists', '', true],
    ['notExists', null, true],
  ];
  it.each(unarios)('%s(%s) = %s', (comparacao, v, esperado) => {
    expect(delegadoUnario(comparacao as never)(v)).toBe(esperado);
  });
});

describe('Condition.Validate', () => {
  it('condição válida passa', () => {
    expect(() =>
      validarCondicao({ source: 'context', variable: 'variable', values: ['value'] }),
    ).not.toThrow();
  });
  it('sem valor falha', () => {
    expect(() => validarCondicao({ source: 'context', variable: 'variable' })).toThrow(
      'A condição precisa de valores quando a comparação não é exists nem notExists.',
    );
  });
  it('fonte contexto sem variável falha', () => {
    expect(() => validarCondicao({ source: 'context', values: ['value'] })).toThrow(
      'O nome da variável é obrigatório quando a fonte da comparação é o contexto.',
    );
  });
  it('fonte entidade sem entidade falha', () => {
    expect(() => validarCondicao({ source: 'entity', values: ['value'] })).toThrow(
      'O nome da entidade é obrigatório quando a fonte da comparação é entidade.',
    );
  });
});

describe('Condition.EvaluateConditionAsync', () => {
  const contexto = (texto: string): Contexto => ({
    usuario: 'u',
    fluxo: { id: 'f', states: [] },
    entrada: criarEntrada({ id: 'm', tipo: 'text/plain', conteudo: texto }),
    variaveis: {},
    entradaContexto: new Map(),
    servicos: {
      enviar: async () => {},
      encaminharParaAtendimento: async () => ({ id: 'x' }),
      registrarEvento: async () => {},
    },
  });
  const avaliar = (c: CondicaoBlip, texto: string) => {
    const ctx = contexto(texto);
    return avaliarCondicaoBlip(c, ctx.entrada, ctx);
  };

  it('sem fonte é a entrada, sem comparação é equals, e com vários valores basta um (or)', async () => {
    expect(await avaliar({ values: ['1', 'Financeiro'] }, 'financeiro')).toBe(true);
  });
  it('and exige todos os valores', async () => {
    expect(
      await avaliar({ comparison: 'contains', operator: 'and', values: ['bo', 'leto'] }, 'boleto'),
    ).toBe(true);
    expect(
      await avaliar({ comparison: 'contains', operator: 'and', values: ['bo', 'pix'] }, 'boleto'),
    ).toBe(false);
  });
  it('notEquals com or é "diferente de todos", como no original', async () => {
    expect(await avaliar({ comparison: 'notEquals', values: ['a', 'b'] }, 'a')).toBe(false);
    expect(await avaliar({ comparison: 'notEquals', values: ['a', 'b'] }, 'c')).toBe(true);
  });
  it('lê o enum sem diferenciar maiúscula, como o Newtonsoft', async () => {
    expect(
      await avaliar({ source: 'Input', comparison: 'StartsWith', values: ['bo'] }, 'Boleto'),
    ).toBe(true);
  });
});
