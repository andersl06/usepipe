/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0), src/Take.Blip.Builder.UnitTests/Models/ConditionComparisonTests.cs and ConditionTests.cs. Changes: xUnit/Shouldly to vitest; validation messages remain Portuguese.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateConditionBlip,
  delegadoBinario,
  delegadoUnario,
  validateCondition,
} from './condition.js';
import type { ConditionBlip } from './condition.js';
import { createInbound } from './context.js';
import type { Context } from './context.js';

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
  it.each(binarios)('%s("%s", "%s") = %s', (comparison, v1, v2, esperado) => {
    expect(delegadoBinario(comparison as never)(v1, v2)).toBe(esperado);
  });

  const unarios: [string, string | null, boolean][] = [
    ['exists', 'Value', true],
    ['exists', '', false],
    ['exists', null, false],
    ['notExists', 'Value', false],
    ['notExists', '', true],
    ['notExists', null, true],
  ];
  it.each(unarios)('%s(%s) = %s', (comparison, v, esperado) => {
    expect(delegadoUnario(comparison as never)(v)).toBe(esperado);
  });
});

describe('Condition.Validate', () => {
  it('a valid condition passes', () => {
    expect(() =>
      validateCondition({ source: 'context', variable: 'variable', values: ['value'] }),
    ).not.toThrow();
  });
  it('with no value it fails', () => {
    expect(() => validateCondition({ source: 'context', variable: 'variable' })).toThrow(
      'A condição precisa de valores quando a comparação não é exists nem notExists.',
    );
  });
  it('a context source without a variable fails', () => {
    expect(() => validateCondition({ source: 'context', values: ['value'] })).toThrow(
      'O nome da variável é obrigatório quando a fonte da comparação é o contexto.',
    );
  });
  it('an entity source without an entity fails', () => {
    expect(() => validateCondition({ source: 'entity', values: ['value'] })).toThrow(
      'O nome da entidade é obrigatório quando a fonte da comparação é entidade.',
    );
  });
});

describe('Condition.EvaluateConditionAsync', () => {
  const context = (texto: string): Context => ({
    user: 'u',
    flow: { id: 'f', states: [] },
    inbound: createInbound({ id: 'm', tipo: 'text/plain', conteudo: texto }),
    variables: {},
    inboundContext: new Map(),
    services: {
      send: async () => {},
      forwardForAttendance: async () => ({ id: 'x' }),
      registerEvent: async () => {},
    },
  });
  const avaliar = (c: ConditionBlip, texto: string) => {
    const ctx = context(texto);
    return evaluateConditionBlip(c, ctx.inbound, ctx);
  };

  it('with no source it is the input, with no comparison it is equals, and with several values one is enough (or)', async () => {
    expect(await avaliar({ values: ['1', 'Financeiro'] }, 'financeiro')).toBe(true);
  });
  it('and requires every value', async () => {
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
