import { describe, expect, it } from 'vitest';

import {
  ErroModeloSemPreco,
  MODELO_PADRAO,
  PRECOS,
  arredondarCentavos,
  calcularCusto,
  consumoDe,
  somarConsumo,
} from './index.js';

describe('tabela de preços', () => {
  it('tem o modelo padrão cadastrado', () => {
    expect(MODELO_PADRAO).toBe('claude-sonnet-5');
    expect(PRECOS[MODELO_PADRAO]).toEqual({ entradaUsdPorMilhao: 2, saidaUsdPorMilhao: 10 });
  });
});

describe('custo', () => {
  it('cobra entrada e saída pelas tarifas do modelo', () => {
    // 1M de entrada a US$ 2 = 200 centavos; 1M de saída a US$ 10 = 1.000 centavos.
    expect(calcularCusto('claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(200, 10);
    expect(calcularCusto('claude-sonnet-5', 0, 1_000_000)).toBeCloseTo(1_000, 10);
    expect(calcularCusto('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(1_200, 10);
  });

  it('mede chamada de tamanho realista sem arredondar para zero', () => {
    // 12.000 de entrada e 800 de saída: US$ 0,024 + US$ 0,008 = 3,2 centavos.
    expect(calcularCusto('claude-sonnet-5', 12_000, 800)).toBeCloseTo(3.2, 10);
  });

  it('cobra mais caro no modelo mais caro', () => {
    expect(calcularCusto('claude-opus-5', 1_000_000, 0)).toBeCloseTo(500, 10);
  });

  it('estoura em modelo sem preço em vez de devolver custo zero', () => {
    expect(() => calcularCusto('modelo-inventado', 1_000, 1_000)).toThrow(ErroModeloSemPreco);
  });
});

describe('consumo', () => {
  it('monta o registro completo da chamada', () => {
    const c = consumoDe('claude-sonnet-5', 10_000, 1_000);
    expect(c.modelo).toBe('claude-sonnet-5');
    expect(c.tokensEntrada).toBe(10_000);
    expect(c.tokensSaida).toBe(1_000);
    expect(c.custoCentavos).toBeCloseTo(3, 10);
  });

  it('soma por modelo e nunca mistura modelos numa linha só', () => {
    const soma = somarConsumo([
      consumoDe('claude-sonnet-5', 1_000, 100),
      consumoDe('claude-sonnet-5', 2_000, 200),
      consumoDe('claude-haiku-4-5', 5_000, 500),
    ]);
    expect(soma).toHaveLength(2);
    const sonnet = soma.find((c) => c.modelo === 'claude-sonnet-5')!;
    expect(sonnet.tokensEntrada).toBe(3_000);
    expect(sonnet.tokensSaida).toBe(300);
    expect(sonnet.custoCentavos).toBeCloseTo(calcularCusto('claude-sonnet-5', 3_000, 300), 10);
  });

  it('não altera os consumos recebidos', () => {
    const original = consumoDe('claude-sonnet-5', 1_000, 100);
    somarConsumo([original, consumoDe('claude-sonnet-5', 1_000, 100)]);
    expect(original.tokensEntrada).toBe(1_000);
  });

  it('arredonda só na hora de gravar em `consumo_ia.custo_centavos`', () => {
    expect(arredondarCentavos(3.2)).toBe(3);
    expect(arredondarCentavos(3.6)).toBe(4);
    expect(arredondarCentavos(0.004)).toBe(0);
    expect(arredondarCentavos(-1)).toBe(0);
  });
});
