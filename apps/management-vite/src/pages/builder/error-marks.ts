import type { BlockError } from '@pipe/contracts';
import type { Block, Mapa } from './model';
import { cardsOf, contentErrorsOfCard } from './conteudo';
import { outputErrors } from './conditions';
import { actionErrors } from './actions-of-block';
import { aiAgentErrors } from './ai-agent-block';

/**
 * The Blip screen's `$invalid` per block, the same rules `validation.ts` reads to word the
 * panel's error text, but here every source counts — including the output/ProcessHttp cases the
 * flow alert used to exclude (D-56: paridade completa) — because this is what paints the node
 * red, not what the flow-wide banner used to list.
 */
export interface BlockMarks {
  node: boolean;
  contentCards: Set<number>;
  outputs: Set<number>;
  defaultOutput: boolean;
  actions: Set<string>;
  messages: string[];
}

export function blockMarks(block: Block, mapa: Mapa, engineMessages: string[] = []): BlockMarks {
  const messages: string[] = [];
  const existe = (id: string): boolean => id in mapa;

  const contentCards = new Set<number>();
  for (const c of cardsOf(block)) {
    const erros = contentErrorsOfCard(c);
    if (erros.length > 0) {
      contentCards.add(c.indice);
      messages.push(...erros);
    }
  }

  const outputs = new Set<number>();
  (block.$conditionOutputs ?? []).forEach((saida, indice) => {
    const erros = outputErrors(saida, existe);
    if (erros.length > 0) {
      outputs.add(indice);
      messages.push(...erros);
    }
  });

  let defaultOutput = false;
  const padrao = block.$defaultOutput?.stateId;
  if (padrao && !existe(padrao) && !/^{{.*}}$/.test(padrao)) {
    defaultOutput = true;
    messages.push(`O estado de destino '${padrao}' da saída não existe.`);
  }

  const actions = new Set<string>();
  [...(block.$enteringCustomActions ?? []), ...(block.$leavingCustomActions ?? [])].forEach(
    (acao, indice) => {
      const erros = actionErrors(acao);
      if (erros.length > 0) {
        actions.add(acao.$id ?? String(indice));
        messages.push(...erros);
      }
    },
  );

  // AI agent block (P14): model, instructions, memory, handoffs and tools.
  const agentMessages = aiAgentErrors(block);
  messages.push(...agentMessages);

  messages.push(...engineMessages);

  const node =
    contentCards.size > 0 ||
    outputs.size > 0 ||
    defaultOutput ||
    actions.size > 0 ||
    agentMessages.length > 0 ||
    engineMessages.length > 0;

  return { node, contentCards, outputs, defaultOutput, actions, messages };
}

/** Block ids the Publish gate blocks on: the screen's `$invalid` plus whatever the `api` already flagged. */
export function invalidBlocks(mapa: Mapa, apiErrors: BlockError[] = []): Set<string> {
  const messagesByBlock: Record<string, string[]> = {};
  for (const e of apiErrors) {
    if (!e.block) continue;
    (messagesByBlock[e.block] ??= []).push(e.mensagem);
  }
  const invalid = new Set<string>();
  for (const [id, block] of Object.entries(mapa)) {
    if (blockMarks(block, mapa, messagesByBlock[id] ?? []).node) invalid.add(id);
  }
  return invalid;
}
