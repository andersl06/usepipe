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

/**
 * "Inserir função da biblioteca" over ExecuteScript/ExecuteScriptV2: the call goes in as the first
 * statement of the script's entry function (`run`, or V1's `function` setting), so it only runs
 * when the engine calls that function — the API puts the library in scope (`script-sandbox.ts`).
 * Parameters the entry function does not declare yet are appended to its signature: the engine
 * feeds them from "Variáveis de entrada", so the call never names an undeclared variable.
 * Without an entry function the call is added as a comment rather than code that runs at load.
 */
export function insertLibraryCall(
  source: string,
  fn: Pick<FlowFunction, 'name' | 'parameters'>,
  entryName = 'run',
): string {
  const nome = entryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entrada = new RegExp(`((?:async\\s+)?function\\s+${nome}\\s*\\()([^)]*)(\\)\\s*\\{)`).exec(source);
  if (!entrada) return `${source}\n// ${functionCallSnippet(fn)}`;
  const [todo, antes, parametros, depois] = entrada as unknown as [string, string, string, string];
  const declarados = parametros.split(',').map((p) => p.split('=')[0]!.trim()).filter(Boolean);
  const faltam = fn.parameters.filter((p) => !declarados.includes(p));
  const assinatura = [parametros.trim(), ...faltam].filter(Boolean).join(', ');
  const fim = entrada.index + todo.length;
  return `${source.slice(0, entrada.index)}${antes}${assinatura}${depois}\n  ${functionCallSnippet(fn)};${source.slice(fim)}`;
}
