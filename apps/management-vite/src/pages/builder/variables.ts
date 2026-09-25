import type { AcaoDoEditor, Block, Mapa } from './model';
import { fieldValue } from './actions-of-block';

/**
 * A "Biblioteca de variáveis" do editor (`$ctrl.openVarLib()`, painel à
 * esquerda com as abas "Variáveis do sistema" e "Variáveis do usuário",
 * estrutura completa achada em `portal.js`). Lá, as duas listas vêm de um
 * serviço da conta; aqui não existe esse serviço — então:
 *
 * - "Variáveis do usuário" é o que ESTE fluxo de fato referencia: o nome de
 *   toda `SetVariable`/`DeleteVariable` (bloco ou ação global), toda variável
 *   de `context` numa condição, e a variável de cada "Entrada do usuário" —
 *   dado real do desenho, não um cadastro à parte;
 * - "Variáveis do sistema" é a lista fixa das fontes com provedor no motor do
 *   Pipe (`FONTES_SUPORTADAS` de `@pipe/core/fluxo/contexto.ts`), com os
 *   nomes de propriedade que o motor realmente lê (`provedorDeEntrada`,
 *   `provedorDeContato`, etc.) — não é a lista de sistema da Blip (`bucket`,
 *   `resource`, `tunnel`… não têm provedor aqui e ficariam mentindo).
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

/** Toda variável de `context` que este fluxo cria ou lê, em ordem alfabética. */
export function userVariables(mapa: Mapa, global: Record<string, unknown>): string[] {
  const nomes = new Set<string>();
  for (const block of Object.values(mapa)) blockAcrescentar(block, nomes);
  const globalWithActions = global as { $enteringCustomActions?: AcaoDoEditor[]; $leavingCustomActions?: AcaoDoEditor[] };
  actionsAcrescentar(globalWithActions.$enteringCustomActions, nomes);
  actionsAcrescentar(globalWithActions.$leavingCustomActions, nomes);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

/** O filtro de busca de cada aba do painel: sem acento, sem caixa. */
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
