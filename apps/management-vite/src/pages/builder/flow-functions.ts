import type { FlowFunction } from '@pipe/contracts';
import { normalizar } from './variables';

/**
 * Pure logic for the engine's "Biblioteca de funções" (D-22): a bot-scoped library of named,
 * reusable script functions, consumed by the `ExecuteBlipFunction` action (`functionId`) and by
 * the function selector this backs inside the script actions' code field. Deliberately without
 * `../../lib/api` here — same split `channels.ts`/`channel-of-flow.ts`/`comunicacao.ts` already
 * make in this app, so `tests/builder-functions.test.ts` runs under `node --test` without
 * `import.meta.env`; the API client lives in `flow-functions-gravar.ts`.
 */

/** Search filter for "Pesquisar função": matches name or description, no accent/case (same rule as `filterVariables`). */
export function filterFlowFunctions(list: readonly FlowFunction[], query: string): FlowFunction[] {
  const alvo = normalizar(query.trim());
  if (!alvo) return [...list];
  return list.filter(
    (f) => normalizar(f.name).includes(alvo) || normalizar(f.description ?? '').includes(alvo),
  );
}

/** The call-site format the reference documents for inserting a library call into a script: `nome(param1, param2)`. */
export function functionCallSnippet(fn: Pick<FlowFunction, 'name' | 'parameters'>): string {
  return `${fn.name}(${fn.parameters.join(', ')})`;
}
