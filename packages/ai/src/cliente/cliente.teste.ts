import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { comRetentativa, esperaDaTentativa, vaiDeNovo } from './cliente.js';

function erroDeApi(status: number): InstanceType<typeof Anthropic.APIError> {
  return new Anthropic.APIError(status, undefined, `erro ${status}`, undefined);
}

describe('quando vale tentar de novo', () => {
  it('rede e limite de taxa valem', () => {
    expect(vaiDeNovo(new Anthropic.APIConnectionError({ message: 'sem rede' }))).toBe(true);
    expect(vaiDeNovo(erroDeApi(429))).toBe(true);
    expect(vaiDeNovo(erroDeApi(408))).toBe(true);
    expect(vaiDeNovo(erroDeApi(409))).toBe(true);
    expect(vaiDeNovo(erroDeApi(500))).toBe(true);
    expect(vaiDeNovo(erroDeApi(529))).toBe(true);
  });

  it('erro nosso não vale: repetir só gasta dinheiro', () => {
    expect(vaiDeNovo(erroDeApi(400))).toBe(false);
    expect(vaiDeNovo(erroDeApi(401))).toBe(false);
    expect(vaiDeNovo(erroDeApi(404))).toBe(false);
    expect(vaiDeNovo(new Error('qualquer coisa'))).toBe(false);
  });
});

describe('espera crescente', () => {
  it('dobra a cada rodada', () => {
    const semSorteio = () => 0;
    expect(esperaDaTentativa(0, 500, semSorteio)).toBe(500);
    expect(esperaDaTentativa(1, 500, semSorteio)).toBe(1_000);
    expect(esperaDaTentativa(2, 500, semSorteio)).toBe(2_000);
  });

  it('soma até 25% de variação para não ressincronizar tudo no mesmo segundo', () => {
    expect(esperaDaTentativa(0, 500, () => 1)).toBe(625);
    expect(esperaDaTentativa(0, 500, () => 0.5)).toBe(563);
  });
});

describe('retentativa', () => {
  it('não repete quando dá certo de primeira', async () => {
    let vezes = 0;
    const r = await comRetentativa(async () => {
      vezes++;
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(vezes).toBe(1);
  });

  it('repete erro de rede até dar certo', async () => {
    const esperas: number[] = [];
    let vezes = 0;
    const r = await comRetentativa(
      async () => {
        vezes++;
        if (vezes < 3) throw erroDeApi(429);
        return 'ok';
      },
      { dormir: async (ms) => void esperas.push(ms) },
    );
    expect(r).toBe('ok');
    expect(vezes).toBe(3);
    expect(esperas).toHaveLength(2);
    expect(esperas[1]!).toBeGreaterThan(esperas[0]!);
  });

  it('desiste depois do total de tentativas e propaga o erro original', async () => {
    let vezes = 0;
    await expect(
      comRetentativa(
        async () => {
          vezes++;
          throw erroDeApi(500);
        },
        { tentativas: 3, dormir: async () => {} },
      ),
    ).rejects.toThrow('erro 500');
    expect(vezes).toBe(3);
  });

  it('erro que não vale repetir sobe na primeira', async () => {
    let vezes = 0;
    await expect(
      comRetentativa(
        async () => {
          vezes++;
          throw erroDeApi(400);
        },
        { dormir: async () => {} },
      ),
    ).rejects.toThrow('erro 400');
    expect(vezes).toBe(1);
  });
});
