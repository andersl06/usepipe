/**
 * `ExecuteScriptV2` `context` object (Blip SDK `Actions/ExecuteScriptV2/Functions/Context`):
 * `getVariableAsync` reads like `{{...}}` (every source, `@property` included), `setVariableAsync`
 * and `deleteVariableAsync` write flow context variables like `SetVariable`/`DeleteVariable`.
 * The API sandbox exposes these three functions inside the isolate; production and the Builder test
 * run build them here, from the same `Context`, so both behave the same.
 */
import {
  deleteVariable,
  getVariable,
  setVariable,
  type Context,
  type ScriptVariables,
} from './context.js';

/** Longest variable name a script may write (the persisted map is not a document store). */
export const MAX_SCRIPT_VARIABLE_NAME = 256;

/**
 * Names a script may write or delete. `#` is reserved for engine keys (`EXPIRATIONS_KEY`), and
 * `__proto__` would not be stored as an own key of the variables map.
 */
function writableName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error('O nome da variável é obrigatório.');
  if (n.length > MAX_SCRIPT_VARIABLE_NAME) {
    throw new Error(`O nome da variável excede ${MAX_SCRIPT_VARIABLE_NAME} caracteres.`);
  }
  if (n.includes('#') || n === '__proto__') {
    throw new Error(`Nome de variável reservado: '${n}'.`);
  }
  return n;
}

export function scriptVariables(context: Context): ScriptVariables {
  return {
    // No `VariableOptions`: `secret.*` reads as null here, as everywhere outside ProcessHttp (P11).
    get: (name) => getVariable(context, name.trim()),
    set: (name, value, expirationSeconds) => {
      const seconds = expirationSeconds !== undefined && Number.isFinite(expirationSeconds) && expirationSeconds > 0
        ? expirationSeconds
        : undefined;
      setVariable(context, writableName(name), value, seconds);
    },
    delete: (name) => deleteVariable(context, writableName(name)),
  };
}
