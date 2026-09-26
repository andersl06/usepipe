/**
 * Ported from takenet/blip-sdk-csharp (Apache-2.0), src/Take.Blip.Builder.UnitTests/Models/FlowTests.cs. Changes: xUnit/Shouldly to vitest; messages remain Portuguese.
 */
import { describe, expect, it } from 'vitest';
import { validateFlow } from './modelos.js';
import type { State, FlowBlip } from './modelos.js';

const flow = (states: State[], id = '0'): FlowBlip => ({ id, states });

describe('Flow.Validate', () => {
  it('a valid one-state flow passes', () => {
    expect(() => validateFlow(flow([{ id: '0', root: true, input: {} }]))).not.toThrow();
  });

  it('sem id falha', () => {
    expect(() => validateFlow(flow([{ id: '0', root: true, input: {} }], ''))).toThrow(
      'O id do fluxo é obrigatório.',
    );
  });

  it('with no root state it fails', () => {
    expect(() => validateFlow(flow([{ id: '0', input: {} }]))).toThrow(
      'O fluxo precisa de exatamente um estado raiz.',
    );
  });

  it('a root without an entry fails', () => {
    expect(() => validateFlow(flow([{ id: '0', root: true }]))).toThrow(
      'O estado raiz precisa esperar uma entrada.',
    );
  });

  it('duas raízes falham', () => {
    expect(() =>
      validateFlow(
        flow([
          { id: '0', root: true, input: {} },
          { id: '1', root: true, input: {} },
        ]),
      ),
    ).toThrow('O fluxo precisa de exatamente um estado raiz.');
  });

  it('ids repetidos falham', () => {
    expect(() =>
      validateFlow(flow([{ id: '0', root: true, input: {} }, { id: '1' }, { id: '1' }])),
    ).toThrow("O id de estado '1' se repete no fluxo.");
  });

  it('laço direto de um passo falha', () => {
    expect(() =>
      validateFlow(
        flow([
          { id: '0', root: true, input: {}, outputs: [{ stateId: '1' }] },
          { id: '1', outputs: [{ stateId: '1' }] },
        ]),
      ),
    ).toThrow('Há um laço no fluxo começando no estado 1 que não pede entrada do usuário.');
  });

  it('laço direto de dois passos falha', () => {
    expect(() =>
      validateFlow(
        flow([
          { id: '0', root: true, input: {}, outputs: [{ stateId: '1' }] },
          { id: '1', outputs: [{ stateId: '2' }] },
          { id: '2', outputs: [{ stateId: '1' }] },
        ]),
      ),
    ).toThrow('Há um laço no fluxo começando no estado 1 que não pede entrada do usuário.');
  });

  it('laço direto de vários passos falha', () => {
    expect(() =>
      validateFlow(
        flow([
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
      validateFlow(
        flow([
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

  it('a nonexistent output destination fails, and {{variable}} passes', () => {
    expect(() =>
      validateFlow(flow([{ id: '0', root: true, input: {}, outputs: [{ stateId: 'x' }] }])),
    ).toThrow("O estado de destino 'x' da saída não existe.");
    expect(() =>
      validateFlow(
        flow([{ id: '0', root: true, input: {}, outputs: [{ stateId: '{{destino}}' }] }]),
      ),
    ).not.toThrow();
  });
});
