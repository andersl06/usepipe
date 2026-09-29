import type { Block, Mapa } from './model';
import { contentErrors } from './conteudo';
import { outputErrors } from './conditions';
import { actionErrors } from './actions-of-block';

const ERRORS_OF_DRAFT_OF_OUTPUT = new Set([
  'Definição de saída não preenchida',
  'A condição precisa de valores quando a comparação não é exists nem notExists.',
]);

/**
 * What the SCREEN can flag before sending to the server — the Blip editor's `$invalid`, block by block: required field empty, output without a destination, condition without values, variable with an invalid name. It's the first of the two lists the block's card paints; the second comes from the `api` (the engine's `errosDoFluxo`: root without an input, loop without an input, nonexistent destination), after each save and on the 409 from publishing.
 *
 * The wording is the panel's and the engine's — never two texts for the same problem.
 */

export const LIMITE_DO_TITULO = 50;

export function blockErrors(block: Block, mapa: Mapa): string[] {
  const errors: string[] = [];
  const anotar = (message: string): void => {
    if (!errors.includes(message)) errors.push(message);
  };
  if (!block.$title?.trim()) anotar('Nome do bloco: campo obrigatório.');
  if ((block.$title ?? '').length > LIMITE_DO_TITULO) anotar(`Nome do bloco: no máximo ${LIMITE_DO_TITULO} caracteres.`);
  for (const e of contentErrors(block)) anotar(e);
  const existe = (id: string): boolean => id in mapa;
  for (const saida of block.$conditionOutputs ?? []) {
    for (const e of outputErrors(saida, existe)) {
      // The Builder keeps the incomplete draft on the card, without promoting it to the flow's alert.
      if (!ERRORS_OF_DRAFT_OF_OUTPUT.has(e)) anotar(e);
    }
  }
  const padrao = block.$defaultOutput?.stateId;
  if (padrao && !existe(padrao) && !/^{{.*}}$/.test(padrao)) {
    anotar(`O estado de destino '${padrao}' da saída não existe.`);
  }
  for (const acao of [...(block.$enteringCustomActions ?? []), ...(block.$leavingCustomActions ?? [])]) {
    for (const e of actionErrors(acao)) {
      // The Builder's extraction flags the URL on the ProcessHttp card, without promoting it to the flow's alert.
      if (acao.type === 'ProcessHttp' && e === 'URL: campo obrigatório.') continue;
      anotar(e);
    }
  }
  return errors;
}
