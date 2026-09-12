import { describe, expect, it } from 'vitest';
import { converterDoEditor, validarFluxo } from '@pipe/core';
import { ACOES_GLOBAIS_PADRAO, FLUXO_PADRAO } from '../src/fluxo-padrao.js';

/**
 * O fluxo padrão é a primeira coisa que o cliente vê no Builder. Se ele não for
 * publicável, a primeira ação de quem entrou no produto é tomar um erro.
 *
 * Este teste existe porque isso aconteceu: a versão anterior não esperava entrada, e
 * o motor recusou publicar com "O estado raiz precisa esperar uma entrada".
 */

describe('fluxo padrão do Builder', () => {
  const compilado = converterDoEditor(
    { flow: FLUXO_PADRAO as never, globalActions: ACOES_GLOBAIS_PADRAO as never },
    'fluxo-de-teste',
  );

  it('passa na validação do motor — ou seja, dá para publicar sem mexer em nada', () => {
    expect(() => validarFluxo(compilado)).not.toThrow();
  });

  it('o bloco inicial espera a mensagem do cliente', () => {
    const raiz = FLUXO_PADRAO['onboarding'] as { $contentActions: { input?: unknown }[] };
    expect(raiz.$contentActions.some((a) => a.input)).toBe(true);
  });

  it('o transbordo usa o prefixo que o motor reconhece', () => {
    // `desk:` é o que faz o motor tratar o bloco como atendimento humano.
    expect(Object.keys(FLUXO_PADRAO).some((id) => id.startsWith('desk:'))).toBe(true);
  });

  it('é mesmo o menor fluxo útil: dois blocos, sem ramificação', () => {
    expect(Object.keys(FLUXO_PADRAO)).toHaveLength(2);
    const raiz = FLUXO_PADRAO['onboarding'] as { $conditionOutputs: unknown[] };
    expect(raiz.$conditionOutputs).toHaveLength(0);
  });
});
