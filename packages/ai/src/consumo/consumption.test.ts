import { describe, expect, it } from 'vitest';

import {
  TemplateWithoutPriceError,
  TEMPLATE_DEFAULT,
  PRECOS,
  arredondarCentavos,
  calcularCusto,
  consumoDe,
  somarConsumo,
} from './index.js';

describe('tabela de preços', () => {
  it('has the default model registered', () => {
    expect(TEMPLATE_DEFAULT).toBe('claude-sonnet-5');
    expect(PRECOS[TEMPLATE_DEFAULT]).toEqual({ entradaUsdPorMilhao: 2, saidaUsdPorMilhao: 10 });
  });
});

describe('custo', () => {
  it('charges input and output at the model\'s rates', () => {
    expect(calcularCusto('claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(200, 10);
    expect(calcularCusto('claude-sonnet-5', 0, 1_000_000)).toBeCloseTo(1_000, 10);
    expect(calcularCusto('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(1_200, 10);
  });

  it('mede chamada de tamanho realista sem arredondar para zero', () => {
    expect(calcularCusto('claude-sonnet-5', 12_000, 800)).toBeCloseTo(3.2, 10);
  });

  it('charges more for the more expensive model', () => {
    expect(calcularCusto('claude-opus-5', 1_000_000, 0)).toBeCloseTo(500, 10);
  });

  it('throws for a model without a price instead of returning zero cost', () => {
    expect(() => calcularCusto('modelo-inventado', 1_000, 1_000)).toThrow(TemplateWithoutPriceError);
  });
});

describe('consumo', () => {
  it('monta o registro completo da chamada', () => {
    const c = consumoDe('claude-sonnet-5', 10_000, 1_000);
    expect(c.template).toBe('claude-sonnet-5');
    expect(c.tokensInbound).toBe(10_000);
    expect(c.tokensSaida).toBe(1_000);
    expect(c.custoCentavos).toBeCloseTo(3, 10);
  });

  it('sums per model and never mixes models in a single row', () => {
    const soma = somarConsumo([
      consumoDe('claude-sonnet-5', 1_000, 100),
      consumoDe('claude-sonnet-5', 2_000, 200),
      consumoDe('claude-haiku-4-5', 5_000, 500),
    ]);
    expect(soma).toHaveLength(2);
    const sonnet = soma.find((c) => c.template === 'claude-sonnet-5')!;
    expect(sonnet.tokensInbound).toBe(3_000);
    expect(sonnet.tokensSaida).toBe(300);
    expect(sonnet.custoCentavos).toBeCloseTo(calcularCusto('claude-sonnet-5', 3_000, 300), 10);
  });

  it('não altera os consumos recebidos', () => {
    const original = consumoDe('claude-sonnet-5', 1_000, 100);
    somarConsumo([original, consumoDe('claude-sonnet-5', 1_000, 100)]);
    expect(original.tokensInbound).toBe(1_000);
  });

  it('arredonda só na hora de gravar em `consumo_ia.custo_centavos`', () => {
    expect(arredondarCentavos(3.2)).toBe(3);
    expect(arredondarCentavos(3.6)).toBe(4);
    expect(arredondarCentavos(0.004)).toBe(0);
    expect(arredondarCentavos(-1)).toBe(0);
  });
});
