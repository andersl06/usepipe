import { describe, expect, it } from 'vitest';
import { converterDoEditor, validateFlow } from '@pipe/core';
import { ACTIONS_GLOBAL_DEFAULT, FLOW_DEFAULT } from '../src/flow-default.js';

/**
 * O fluxo padrão é a primeira coisa que o cliente vê no Builder. Se ele não for
 * publicável, a primeira ação de quem entrou no produto é tomar um erro.
 *
 * Este teste existe porque isso aconteceu: a versão anterior não esperava entrada, e
 * o motor recusou publicar com "O estado raiz precisa esperar uma entrada".
 */

describe('Builder\'s default flow', () => {
  const compilado = converterDoEditor(
    { flow: FLOW_DEFAULT as never, globalActions: ACTIONS_GLOBAL_DEFAULT as never },
    'fluxo-de-teste',
  );

  it('passes the engine\'s validation — meaning it can be published without changing anything', () => {
    expect(() => validateFlow(compilado)).not.toThrow();
  });

  it('the initial block waits for the customer\'s message', () => {
    const raiz = FLOW_DEFAULT['onboarding'] as { $contentActions: { input?: unknown }[] };
    expect(raiz.$contentActions.some((a) => a.input)).toBe(true);
  });

  it('overflow uses the prefix the engine recognizes', () => {
    // `desk:` é o que faz o motor tratar o bloco como atendimento humano.
    expect(Object.keys(FLOW_DEFAULT).some((id) => id.startsWith('desk:'))).toBe(true);
  });

  it('it really is the smallest useful flow: two blocks, no branching', () => {
    expect(Object.keys(FLOW_DEFAULT)).toHaveLength(2);
    const raiz = FLOW_DEFAULT['onboarding'] as { $conditionOutputs: unknown[] };
    expect(raiz.$conditionOutputs).toHaveLength(0);
  });
});
