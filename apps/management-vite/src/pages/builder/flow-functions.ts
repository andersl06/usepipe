import type { FlowFunction, FlowFunctionUsage } from '@pipe/contracts';
import { normalizar } from './variables';

/**
 * Pure logic for the engine's "Biblioteca de funções" (D-22): the account's (tenant's) library of
 * named, reusable script functions (P10, D-57), consumed by the `ExecuteBlipFunction` action (`source`) and by
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

/**
 * "Em uso em outros bots" (P10, D-57): the library belongs to the account, so the flows that use a
 * function (`GET /flow-functions/:id/usage`) other than the one open in the Builder are the ones an
 * edit or a deletion would also change.
 */
export function otherFlowsUsing(usage: readonly FlowFunctionUsage[], currentFlowId: string | undefined): FlowFunctionUsage[] {
  return usage.filter((flow) => flow.flowId !== currentFlowId);
}

/** Warning text for edit/delete, or `null` when no other bot uses the function. */
export function inUseWarning(others: readonly FlowFunctionUsage[], acao: 'editar' | 'excluir'): string | null {
  if (others.length === 0) return null;
  const nomes = others.map((flow) => flow.flowName);
  const lista = nomes.length <= 3 ? nomes.join(', ') : `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;
  const efeito = acao === 'editar'
    ? 'As alterações valem para todos eles.'
    : 'Excluir a função faz as ações que a chamam deixarem de funcionar nesses bots.';
  return `Esta função está em uso em outros bots (${lista}). ${efeito}`;
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
