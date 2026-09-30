/**
 * Blip subflows (`FlowType.Subflow`): a block whose id starts with `subflow:` hands the contact to
 * the subflow named by its `shortNameOfSubflow`; the subflow's `end` block (`State.End`) hands it
 * back and the calling block's exits decide where the caller goes next. Blip's `FlowManager` keeps a
 * per-input queue of calling block ids and swaps `context.Flow`; across inputs the contact's position
 * lives in context variables with Blip's own names, so imported scripts and commands keep working:
 *
 * - `stateId@{flowId}` (Blip `stateid@`): the saved block of each flow. While a subflow runs, the
 *   caller keeps pointing at its `subflow:` block, which is how the return finds it.
 * - `currentFlowSession@{flowId}`: the short name of the subflow running under `flowId`; absent or
 *   empty = that flow itself. A subflow calling another subflow stores its own, so the chain nests.
 *
 * `set`/`delete /contexts/{contact}/currentFlowSession@{flowId}` are plain context commands: they
 * take effect on the next input, as in Blip.
 */

import type { Context } from './context.js';
import {
  contextGetVariable,
  deleteFlowSession,
  deleteStateId,
  deleteStatePreviousId,
  flowSessionKey,
  getFlowSession,
  getStateId,
  setFlowSession,
  setStateId,
  stateSaved,
} from './context.js';
import type { FlowBlip, State } from './modelos.js';
import { runtimeSubflow, subflowShortName, validateFlow } from './modelos.js';

/** One level of the running chain: the flow, and the short name that opened it (null for the bot). */
export interface FlowSession {
  flow: FlowBlip;
  shortName: string | null;
}

/**
 * Where the contact is, read from persisted variables without an engine context: the innermost
 * flow of the session chain, its saved block, and the subflow short name (null in the bot's flow).
 * The `api` uses it for decisions taken before the engine runs (a closed ticket re-entering a
 * `desk:` block that lives in a subflow).
 */
export function activeFlowSession(
  variables: Record<string, string>,
  root: FlowBlip,
): { flow: FlowBlip; stateId: string | null; subflow: string | null } {
  let flow = root;
  let subflow: string | null = null;
  const seen = new Set([root.id]);
  for (;;) {
    const shortName = variables[flowSessionKey(flow.id)];
    const next = shortName ? runtimeSubflow(root, shortName) : null;
    if (!shortName || !next || seen.has(next.id)) break;
    seen.add(next.id);
    flow = next;
    subflow = shortName;
  }
  return { flow, stateId: stateSaved(variables, flow.id), subflow };
}

/**
 * Restore the session chain at the start of an input and point `context.flow` at its innermost
 * flow. A session naming a subflow the bot no longer has (a newer version removed it), or one
 * already open (a cycle), is dropped and the contact stays in the calling flow. Each level's saved
 * block and session are renewed, so `builder:stateExpiration` counts inactivity in the whole chain.
 */
export function openFlowSessions(context: Context): FlowSession[] {
  const root = context.flow;
  const sessions: FlowSession[] = [{ flow: root, shortName: null }];
  for (;;) {
    const current = sessions[sessions.length - 1]!;
    context.flow = current.flow;
    const shortName = getFlowSession(context);
    if (!shortName) {
      // An empty session is Blip's "back to the main flow": nothing left to keep.
      if (contextGetVariable(context, flowSessionKey(current.flow.id)) !== null) deleteFlowSession(context);
      break;
    }
    const subflow = runtimeSubflow(root, shortName);
    if (!subflow || sessions.some((s) => s.flow.id === subflow.id)) {
      deleteFlowSession(context);
      break;
    }
    // The caller's block and session are renewed here; the engine renews the innermost block.
    const caller = getStateId(context);
    if (caller !== null) setStateId(context, caller);
    setFlowSession(context, shortName);
    sessions.push({ flow: subflow, shortName });
  }
  if (sessions.length > 1) context.rootFlow = root;
  return sessions;
}

/**
 * `RedirectToSubflowAsync`: the calling block already is the caller's saved block; record the
 * session under the caller, switch `context.flow` to the subflow and start at its root.
 */
export function enterSubflow(context: Context, sessions: FlowSession[], caller: State): State {
  const root = sessions[0]!.flow;
  const shortName = subflowShortName(caller);
  if (!shortName) {
    throw new SubflowError(`O bloco de subfluxo '${caller.id}' não indica qual subfluxo chamar.`);
  }
  const subflow = runtimeSubflow(root, shortName);
  if (!subflow) {
    throw new SubflowError(
      `O subfluxo '${shortName}' chamado pelo bloco '${caller.id}' não existe neste fluxo.`,
    );
  }
  if (sessions.some((s) => s.flow.id === subflow.id)) {
    throw new SubflowError(
      `O subfluxo '${shortName}' já está em execução: um subfluxo não pode chamar a si mesmo.`,
    );
  }
  validateFlow(subflow, root);
  setFlowSession(context, shortName);
  sessions.push({ flow: subflow, shortName });
  context.flow = subflow;
  context.rootFlow = root;
  // A new visit starts clean, even if an older one left a block behind.
  deleteStateId(context);
  return subflow.states.find((s) => s.root)!;
}

/**
 * `RedirectToParentFlowAsync`: forget the subflow's saved blocks and the caller's session, switch
 * back to the caller and return its saved (`subflow:`) block, whose exits decide the next block. A
 * caller without a saved block (its state expired or a script deleted it) resumes at its root.
 */
export function returnToCaller(context: Context, sessions: FlowSession[]): State {
  if (sessions.length < 2) {
    throw new SubflowError(
      `O bloco '${getStateId(context) ?? ''}' é de fim de subfluxo, mas este fluxo não foi chamado como subfluxo.`,
    );
  }
  deleteStateId(context);
  deleteStatePreviousId(context);
  sessions.pop();
  const caller = sessions[sessions.length - 1]!.flow;
  context.flow = caller;
  if (sessions.length === 1) delete context.rootFlow;
  deleteFlowSession(context);
  const callerId = getStateId(context);
  return caller.states.find((s) => s.id === callerId) ?? caller.states.find((s) => s.root)!;
}

/** The short name of the innermost running subflow, or null in the bot's own flow. */
export const currentSubflow = (sessions: readonly FlowSession[]): string | null =>
  sessions[sessions.length - 1]?.shortName ?? null;

/** A subflow the engine cannot enter or leave (Blip throws `FlowConstructionException`). */
export class SubflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeSubfluxo';
  }
}
