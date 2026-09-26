import { describe, expect, it } from 'vitest';
import { converterDoEditor, validateFlow } from '@pipe/core';
import { ACTIONS_GLOBAL_DEFAULT, FLOW_DEFAULT } from '../src/flow-default.js';

/**
 * The default flow is the first thing a client sees in Builder. If it cannot be published, their first action fails. This test records a previous failure: the old version did not wait for input and the engine rejected publication with "O estado raiz precisa esperar uma entrada".
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
    // The `desk:` prefix makes the engine treat a block as human attendance.
    expect(Object.keys(FLOW_DEFAULT).some((id) => id.startsWith('desk:'))).toBe(true);
  });

  it('it really is the smallest useful flow: two blocks, no branching', () => {
    expect(Object.keys(FLOW_DEFAULT)).toHaveLength(2);
    const raiz = FLOW_DEFAULT['onboarding'] as { $conditionOutputs: unknown[] };
    expect(raiz.$conditionOutputs).toHaveLength(0);
  });
});
