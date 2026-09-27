import type { AcaoDoEditor, Block, Mapa } from './model';
import { fieldValue } from './actions-of-block';

/**
 * The editor's "Biblioteca de variáveis" (`$ctrl.openVarLib()`, left-side panel with the "Variáveis do sistema" and "Variáveis do usuário" tabs, full structure found in `portal.js`). There, both lists come from an account-level service; here that service doesn't exist — so:
 *
 * - "Variáveis do usuário" is what THIS flow actually references: the name of every `SetVariable`/`DeleteVariable` (block or global action), every `context` variable in a condition, and the variable of each "Entrada do usuário" — real data from the drawing, not a separate registry;
 * - "Variáveis do sistema" is the fixed list of sources with a provider in the Pipe engine (`FONTES_SUPORTADAS` from `@pipe/core/fluxo/contexto.ts`), with the property names the engine actually reads (`provedorDeEntrada`, `provedorDeContato`, etc.) — not Blip's system list (`bucket`, `resource`, `tunnel`… have no provider here and would be lying).
 */

export interface SystemVariable {
  nome: string;
  description: string;
}

/** As propriedades que os provedores do motor (`contexto.ts`) de fato respondem. */
export const VARIABLES_OF_SYSTEM: readonly SystemVariable[] = [
  { nome: 'input.content', description: 'O conteúdo da última mensagem recebida.' },
  { nome: 'input.type', description: 'O tipo (MIME) da última mensagem recebida.' },
  { nome: 'contact.name', description: 'O nome do contato.' },
  { nome: 'contact.phoneNumber', description: 'O telefone do contato.' },
  { nome: 'contact.email', description: 'O e-mail do contato.' },
  { nome: 'contact.extras.<chave>', description: 'Um campo extra do contato.' },
  { nome: 'state.id', description: 'O id do bloco atual.' },
  { nome: 'ticket.id', description: 'O id do atendimento em curso, dentro do bloco Humano.' },
  {
    nome: 'input.content@tags',
    description:
      'As etiquetas marcadas no atendimento encerrado (lista de nomes). Disponível no bloco seguinte quando o encerramento foi pelo atendente ou por inatividade do cliente; não disponível quando o cliente encerra (D-12).',
  },
  {
    nome: 'input.content@sequentialId',
    description:
      'O número sequencial do atendimento encerrado, exibido na tela. Mesma disponibilidade de input.content@tags (D-12).',
  },
  {
    nome: 'input.content@team',
    description: 'A fila do atendimento encerrado. Mesma disponibilidade de input.content@tags (D-12).',
  },
  {
    nome: 'input.content@agentIdentity',
    description:
      'O e-mail do atendente responsável pelo atendimento encerrado. Mesma disponibilidade de input.content@tags (D-12).',
  },
  {
    nome: 'input.content@openDate',
    description: 'A data de abertura do atendimento encerrado. Mesma disponibilidade de input.content@tags (D-12).',
  },
  {
    nome: 'input.content@closeDate',
    description:
      'A data de encerramento do atendimento encerrado. Mesma disponibilidade de input.content@tags (D-12).',
  },
  {
    nome: 'input.content@closedBy',
    description:
      'Quem encerrou o atendimento (atendente, cliente ou inatividade). Mesma disponibilidade de input.content@tags (D-12).',
  },
] as const;

function actionsAdd(actions: AcaoDoEditor[] | undefined, nomes: Set<string>): void {
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

/** Every `context` variable this flow creates or reads, in alphabetical order. */
export function userVariables(mapa: Mapa, global: Record<string, unknown>): string[] {
  const nomes = new Set<string>();
  for (const block of Object.values(mapa)) blockAdd(block, nomes);
  const globalWithActions = global as { $enteringCustomActions?: AcaoDoEditor[]; $leavingCustomActions?: AcaoDoEditor[] };
  actionsAdd(globalWithActions.$enteringCustomActions, nomes);
  actionsAdd(globalWithActions.$leavingCustomActions, nomes);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

/** The search filter for each panel tab: no accents, case-insensitive. */
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

export function systemFilterVariables(
  variables: readonly SystemVariable[],
  search: string,
): SystemVariable[] {
  const alvo = normalizar(search.trim());
  if (!alvo) return [...variables];
  return variables.filter((v) => normalizar(v.nome).includes(alvo) || normalizar(v.description).includes(alvo));
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
