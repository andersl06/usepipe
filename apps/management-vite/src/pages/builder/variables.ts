import type { AcaoDoEditor, Block, Mapa } from './model';
import { fieldValue } from './actions-of-block';

/**
 * The editor's "Biblioteca de variáveis" (`$ctrl.openVarLib()`, left-side panel with the "Variáveis do sistema" and "Variáveis do usuário" tabs, full structure found in `portal.js`). There, both lists come from an account-level service; here that service doesn't exist — so:
 *
 * - "Variáveis do usuário" is what THIS flow actually references: the name of every `SetVariable`/`DeleteVariable` (block or global action), every `context` variable in a condition, and the variable of each "Entrada do usuário" — real data from the drawing, not a separate registry;
 * - "Variáveis do sistema" is the fixed list of sources with a provider in the Pipe engine (`FONTES_SUPORTADAS` from `@pipe/core/fluxo/contexto.ts`), with the property names the engine actually reads (`provedorDeEntrada`, `provedorDeContato`, etc.) — not Blip's system list (`bucket`, `resource`, `tunnel`… have no provider here and would be lying).
 */

export interface SistemaVariable {
  nome: string;
  description: string;
}

/** As propriedades que os provedores do motor (`contexto.ts`) de fato respondem. */
export const VARIABLES_OF_SISTEMA: readonly SistemaVariable[] = [
  { nome: 'input.content', description: 'O conteúdo da última mensagem recebida.' },
  { nome: 'input.type', description: 'O tipo (MIME) da última mensagem recebida.' },
  { nome: 'contact.name', description: 'O nome do contato.' },
  { nome: 'contact.phoneNumber', description: 'O telefone do contato.' },
  { nome: 'contact.email', description: 'O e-mail do contato.' },
  { nome: 'contact.extras.<chave>', description: 'Um campo extra do contato.' },
  { nome: 'state.id', description: 'O id do bloco atual.' },
  { nome: 'ticket.id', description: 'O id do atendimento em curso, dentro do bloco Humano.' },
] as const;

function actionsAcrescentar(actions: AcaoDoEditor[] | undefined, nomes: Set<string>): void {
  for (const acao of actions ?? []) {
    if (acao.type === 'SetVariable' || acao.type === 'DeleteVariable') {
      const nome = fieldValue(acao, 'variable').trim();
      if (nome) nomes.add(nome);
    }
    for (const condition of acao.conditions ?? []) {
      if (condition.source === 'context' && condition.variable?.trim()) nomes.add(condition.variable.trim());
    }
  }
}

function blockAcrescentar(block: Block, nomes: Set<string>): void {
  actionsAcrescentar(block.$enteringCustomActions, nomes);
  actionsAcrescentar(block.$leavingCustomActions, nomes);
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

/** Every `context` variable this flow creates or reads, in alphabetical order. */
export function userVariables(mapa: Mapa, global: Record<string, unknown>): string[] {
  const nomes = new Set<string>();
  for (const block of Object.values(mapa)) blockAcrescentar(block, nomes);
  const globalWithActions = global as { $enteringCustomActions?: AcaoDoEditor[]; $leavingCustomActions?: AcaoDoEditor[] };
  actionsAcrescentar(globalWithActions.$enteringCustomActions, nomes);
  actionsAcrescentar(globalWithActions.$leavingCustomActions, nomes);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

/** The search filter for each panel tab: no accents, case-insensitive. */
function normalizar(texto: string): string {
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

export function sistemaFiltrarVariables(
  variables: readonly SistemaVariable[],
  search: string,
): SistemaVariable[] {
  const alvo = normalizar(search.trim());
  if (!alvo) return [...variables];
  return variables.filter((v) => normalizar(v.nome).includes(alvo) || normalizar(v.description).includes(alvo));
}
