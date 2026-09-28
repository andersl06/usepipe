import type { AcaoDoEditor, Block, Mapa } from './model';
import { fieldValue } from './actions-of-block';
import type { SystemVariable } from './system-variables';

/**
 * The editor's "Biblioteca de variáveis" (`$ctrl.openVarLib()`, left-side panel with the "Biblioteca de
 * variáveis" and "Minhas variáveis" tabs, full structure found in `portal.js`). The system tab's catalog
 * lives in `system-variables.ts` (Blip's 118 names/descriptions, D-56 item 2); this file is "Minhas
 * variáveis" — what THIS flow actually references (every `SetVariable`/`DeleteVariable` name, every
 * `context` variable in a condition, `responseStatusVariable`/`responseBodyVariable`/`outputVariable`
 * from HTTP/script/template/function actions, each "Entrada do usuário" variable, and the flow's
 * `configuration` keys) — real data from the drawing, not a separate account-level registry.
 */

const OUTPUT_VARIABLE_FIELDS = ['variable', 'outputVariable', 'responseStatusVariable', 'responseBodyVariable'] as const;

function actionsAdd(actions: AcaoDoEditor[] | undefined, nomes: Set<string>): void {
  for (const acao of actions ?? []) {
    for (const key of OUTPUT_VARIABLE_FIELDS) {
      const nome = fieldValue(acao, key).trim();
      if (nome) nomes.add(nome);
    }
    for (const condition of acao.conditions ?? []) {
      if (condition.source === 'context' && condition.variable?.trim()) nomes.add(condition.variable.trim());
    }
  }
}

function blockAdd(block: Block, nomes: Set<string>): void {
  actionsAdd(block.$enteringCustomActions, nomes);
  actionsAdd(block.$leavingCustomActions, nomes);
  for (const item of block.$contentActions ?? []) {
    if (item.input?.variable?.trim()) nomes.add(item.input.variable.trim());
    for (const condition of item.input?.conditions ?? []) {
      if (condition.source === 'context' && condition.variable?.trim()) nomes.add(condition.variable.trim());
    }
  }
  for (const saida of block.$conditionOutputs ?? []) {
    for (const condition of saida.conditions ?? []) {
      if (condition.source === 'context' && condition.variable?.trim()) nomes.add(condition.variable.trim());
    }
  }
}

/**
 * Every `context` variable this flow creates or reads, plus its `configuration` keys as `config.<chave>`
 * (the same `{{config.Chave}}` syntax the Configuração panel's help text uses) and its
 * `recurso_do_fluxo` rows as `resource.<nome>`, in alphabetical order.
 */
export function userVariables(
  mapa: Mapa,
  global: Record<string, unknown>,
  configuration: Record<string, string> = {},
  resourceNames: readonly string[] = [],
): string[] {
  const nomes = new Set<string>();
  for (const block of Object.values(mapa)) blockAdd(block, nomes);
  const globalWithActions = global as { $enteringCustomActions?: AcaoDoEditor[]; $leavingCustomActions?: AcaoDoEditor[] };
  actionsAdd(globalWithActions.$enteringCustomActions, nomes);
  actionsAdd(globalWithActions.$leavingCustomActions, nomes);
  for (const chave of Object.keys(configuration)) nomes.add(`config.${chave}`);
  for (const nome of resourceNames) nomes.add(`resource.${nome}`);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

/** The search filter for the destination picker and other accent-insensitive lookups in this file. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterVariables(nomes: readonly string[], search: string): string[] {
  const alvo = normalizar(search.trim());
  if (!alvo) return [...nomes];
  return nomes.filter((nome) => normalizar(nome).includes(alvo));
}

/**
 * Case-insensitive but accent-SENSITIVE substring match — the reference's AngularJS `filter:` behind the
 * variable library's two searches (F-3.1: "sem diferenciar maiúsculas, mas sensível a acento"). Kept apart
 * from `normalizar` above, whose accent stripping stays deliberate for `filterVariables`/`filterDestinations`.
 */
function includesLibrary(texto: string, termo: string): boolean {
  return texto.toLowerCase().includes(termo.toLowerCase());
}

/** "Biblioteca de variáveis" tab search: matches the name or the description. */
export function systemFilterVariables(
  variables: readonly SystemVariable[],
  search: string,
): SystemVariable[] {
  const termo = search.trim();
  if (!termo) return [...variables];
  return variables.filter((v) => includesLibrary(v.nome, termo) || includesLibrary(v.descricao, termo));
}

/** "Minhas variáveis" tab search: matches the name only, same rule as `systemFilterVariables`. */
export function userLibraryFilter(nomes: readonly string[], search: string): string[] {
  const termo = search.trim();
  if (!termo) return [...nomes];
  return nomes.filter((nome) => includesLibrary(nome, termo));
}

/**
 * The block-destination search behind `DestinationPicker` (`destination-picker.tsx`): same no-accent/case-insensitive
 * filter, matching by title or id. Kept here — not in `destination-picker.tsx` — so it can be unit-tested without
 * loading the React component tree (`@pipe/ui`'s barrel pulls in JSX the `node:test` runner's transform can't
 * execute standalone); the same split this file already makes from `panel-variables.tsx`.
 */
export function filterDestinations(blocos: readonly Block[], busca: string): Block[] {
  const alvo = normalizar(busca.trim());
  if (!alvo) return [...blocos];
  return blocos.filter((b) => normalizar(b.$title ?? '').includes(alvo) || normalizar(b.id).includes(alvo));
}
