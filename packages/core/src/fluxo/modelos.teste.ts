/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder.UnitTests/Models/FlowTests.cs
 * — modificado: xUnit/Shouldly → vitest; mensagens em português.
 */
import { describe, expect, it } from 'vitest';
import { validarFluxo } from './modelos.js';
import type { Estado, FluxoBlip } from './modelos.js';

const fluxo = (states: Estado[], id = '0'): FluxoBlip => ({ id, states });

describe('Flow.Validate', () => {
  it('fluxo de um estado válido passa', () => {
    expect(() => validarFluxo(fluxo([{ id: '0', root: true, input: {} }]))).not.toThrow();
  });

  it('sem id falha', () => {
    expect(() => validarFluxo(fluxo([{ id: '0', root: true, input: {} }], ''))).toThrow(
      'O id do fluxo é obrigatório.',
    );
  });

  it('sem estado raiz falha', () => {
    expect(() => validarFluxo(fluxo([{ id: '0', input: {} }]))).toThrow(
      'O fluxo precisa de exatamente um estado raiz.',
    );
  });

  it('raiz sem entrada falha', () => {
    expect(() => validarFluxo(fluxo([{ id: '0', root: true }]))).toThrow(
      'O estado raiz precisa esperar uma entrada.',
    );
  });

  it('duas raízes falham', () => {
    expect(() =>
      validarFluxo(
        fluxo([
          { id: '0', root: true, input: {} },
          { id: '1', root: true, input: {} },
        ]),
      ),
    ).toThrow('O fluxo precisa de exatamente um estado raiz.');
  });

  it('ids repetidos falham', () => {
    expect(() =>
      validarFluxo(fluxo([{ id: '0', root: true, input: {} }, { id: '1' }, { id: '1' }])),
    ).toThrow("O id de estado '1' se repete no fluxo.");
  });

  it('laço direto de um passo falha', () => {
    expect(() =>
      validarFluxo(
        fluxo([
          { id: '0', root: true, input: {}, outputs: [{ stateId: '1' }] },
          { id: '1', outputs: [{ stateId: '1' }] },
        ]),
      ),
    ).toThrow('Há um laço no fluxo começando no estado 1 que não pede entrada do usuário.');
  });

  it('laço direto de dois passos falha', () => {
    expect(() =>
      validarFluxo(
        fluxo([
          { id: '0', root: true, input: {}, outputs: [{ stateId: '1' }] },
          { id: '1', outputs: [{ stateId: '2' }] },
          { id: '2', outputs: [{ stateId: '1' }] },
        ]),
      ),
    ).toThrow('Há um laço no fluxo começando no estado 1 que não pede entrada do usuário.');
  });

  it('laço direto de vários passos falha', () => {
    expect(() =>
      validarFluxo(
        fluxo([
          { id: '0', root: true, input: {}, outputs: [{ stateId: '1' }] },
          { id: '1', outputs: [{ stateId: '2' }] },
          { id: '2', outputs: [{ stateId: '3' }] },
          { id: '3', outputs: [{ stateId: '4' }] },
          { id: '4', outputs: [{ stateId: '2' }] },
        ]),
      ),
    ).toThrow('Há um laço no fluxo começando no estado 2 que não pede entrada do usuário.');
  });

  it('vários passos sem laço direto passam', () => {
    expect(() =>
      validarFluxo(
        fluxo([
          {
            id: 'onboarding',
            root: true,
            input: {},
            outputs: [{ stateId: '1' }, { stateId: 'fallback' }],
          },
          { id: 'fallback', outputs: [{ stateId: 'onboarding' }] },
          { id: '1', outputs: [{ stateId: '2' }, { stateId: 'fallback' }] },
          { id: '2', outputs: [{ stateId: '3' }, { stateId: 'fallback' }] },
          { id: '3', outputs: [{ stateId: 'fallback' }] },
        ]),
      ),
    ).not.toThrow();
  });

  it('destino de saída inexistente falha, e {{variável}} passa', () => {
    expect(() =>
      validarFluxo(fluxo([{ id: '0', root: true, input: {}, outputs: [{ stateId: 'x' }] }])),
    ).toThrow("O estado de destino 'x' da saída não existe.");
    expect(() =>
      validarFluxo(
        fluxo([{ id: '0', root: true, input: {}, outputs: [{ stateId: '{{destino}}' }] }]),
      ),
    ).not.toThrow();
  });
});
