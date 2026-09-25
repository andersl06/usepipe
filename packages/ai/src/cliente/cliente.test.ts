import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { comRetentativa, esperaDaTentativa, vaiDeNovo } from './cliente.js';

function apiError(status: number): InstanceType<typeof Anthropic.APIError> {
  return new Anthropic.APIError(status, undefined, `erro ${status}`, undefined);
}

describe('quando vale tentar de novo', () => {
  it('rede e limite de taxa valem', () => {
    expect(vaiDeNovo(new Anthropic.APIConnectionError({ message: 'sem rede' }))).toBe(true);
    expect(vaiDeNovo(apiError(429))).toBe(true);
    expect(vaiDeNovo(apiError(408))).toBe(true);
    expect(vaiDeNovo(apiError(409))).toBe(true);
    expect(vaiDeNovo(apiError(500))).toBe(true);
    expect(vaiDeNovo(apiError(529))).toBe(true);
  });

  it('our own error does not count: retrying only wastes money', () => {
    expect(vaiDeNovo(apiError(400))).toBe(false);
    expect(vaiDeNovo(apiError(401))).toBe(false);
    expect(vaiDeNovo(apiError(404))).toBe(false);
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

  it('adds up to 25% of variation so everything does not resync in the same second', () => {
    expect(esperaDaTentativa(0, 500, () => 1)).toBe(625);
    expect(esperaDaTentativa(0, 500, () => 0.5)).toBe(563);
  });
});

describe('retentativa', () => {
  it('does not retry when it succeeds on the first try', async () => {
    let vezes = 0;
    const r = await comRetentativa(async () => {
      vezes++;
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(vezes).toBe(1);
  });

  it('retries a network error until it succeeds', async () => {
    const esperas: number[] = [];
    let vezes = 0;
    const r = await comRetentativa(
      async () => {
        vezes++;
        if (vezes < 3) throw apiError(429);
        return 'ok';
      },
      { dormir: async (ms) => void esperas.push(ms) },
    );
    expect(r).toBe('ok');
    expect(vezes).toBe(3);
    expect(esperas).toHaveLength(2);
    expect(esperas[1]!).toBeGreaterThan(esperas[0]!);
  });

  it('gives up after the total number of attempts and propagates the original error', async () => {
    let vezes = 0;
    await expect(
      comRetentativa(
        async () => {
          vezes++;
          throw apiError(500);
        },
        { tentativas: 3, dormir: async () => {} },
      ),
    ).rejects.toThrow('erro 500');
    expect(vezes).toBe(3);
  });

  it('an error not worth retrying surfaces on the first attempt', async () => {
    let vezes = 0;
    await expect(
      comRetentativa(
        async () => {
          vezes++;
          throw apiError(400);
        },
        { dormir: async () => {} },
      ),
    ).rejects.toThrow('erro 400');
    expect(vezes).toBe(1);
  });
});
