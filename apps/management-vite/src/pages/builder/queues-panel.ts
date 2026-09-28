import { ehAttendance, type Mapa } from './model';
import { ordenarRegras, type QueueRule } from '../../lib/rule-queue';

/**
 * Pure state and rules for the Builder's embedded queue panel (D-56 item 4, reverting D-15):
 * whether the pill's warning fires, the create-form validation, search filtering, and the
 * page/create/rules mode machine. Nothing here touches the network — `panel-queues.tsx` wires
 * these to `useRead`/`toggleQueue`/`saveQueue`.
 */

/** True when the flow has at least one attendance block (`desk:<uuid>`, `model.ts`'s `PREFIX_OF_ATTENDANCE`). */
export function hasAttendanceBlock(mapa: Mapa): boolean {
  return Object.keys(mapa).some(ehAttendance);
}

interface QueueForName {
  name: string;
}

/**
 * `'reservado'` is a sentinel, not display text: the caller shows it as the toast "Ops! Não é
 * possível criar fila com este nome." (source's reserved-name behavior) instead of a field
 * message, the same way the other two strings ARE the field message shown as-is.
 */
export type QueueNameError = 'Você precisa dar um nome para essa fila' | 'Já existe uma fila com esse nome.' | 'reservado';

export function queueNameError(nome: string, filas: QueueForName[]): QueueNameError | null {
  const trimmed = nome.trim();
  if (trimmed === '') return 'Você precisa dar um nome para essa fila';
  if (trimmed.toUpperCase() === 'DIRECT_TRANSFER') return 'reservado';
  const duplicada = filas.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (duplicada) return 'Já existe uma fila com esse nome.';
  return null;
}

/** Name match, accent-sensitive but case-insensitive (Blip's queue search has no accent folding). */
export function filterQueues<T extends { name: string }>(filas: T[], termo: string): T[] {
  const t = termo.trim().toLowerCase();
  if (t === '') return filas;
  return filas.filter((f) => f.name.toLowerCase().includes(t));
}

export interface QueuesPage<T> {
  visiveis: T[];
  total: number;
  temMais: boolean;
}

const POR_PAGINA = 100;

/** `paginas` is how many pages of 100 are currently shown, starting at 1; "Carregar mais" increments it. */
export function pageQueues<T>(filas: T[], paginas: number): QueuesPage<T> {
  const limite = Math.max(1, paginas) * POR_PAGINA;
  const visiveis = filas.slice(0, limite);
  return { visiveis, total: filas.length, temMais: visiveis.length < filas.length };
}

/** The rules that belong to one queue, in evaluation order — same order `ordenarRegras` gives the engine. */
export function queueRules(regras: readonly QueueRule[], filaId: string): QueueRule[] {
  return ordenarRegras(regras.filter((r) => r.queueDestinationId === filaId));
}

export type RenameBlockReason = 'atendentes' | 'regras' | 'permissao';

/**
 * The queue-rules header's pencil only opens the rename field when nothing depends on the queue's
 * identity yet: no agents linked, no rules pointing at it, and the caller can write. Priority
 * (atendentes > regras > permissao) matches the source's toast copy — an agent-having queue keeps
 * the "atendentes" message even if it also has rules.
 */
export function renameBlockReason(
  fila: { agents: readonly unknown[] },
  qtdRegras: number,
  podeGravar: boolean,
): RenameBlockReason | null {
  if (fila.agents.length > 0) return 'atendentes';
  if (qtdRegras > 0) return 'regras';
  if (!podeGravar) return 'permissao';
  return null;
}

const NOME_CURTO = 'Nome precisa ter ao menos 3 caracteres.';

export type QueueRenameError = typeof NOME_CURTO | QueueNameError;

/** Same rules as `queueNameError`, plus the rename field's own minimum length. */
export function queueRenameError(nome: string, outrasFilas: QueueForName[]): QueueRenameError | null {
  if (nome.trim().length < 3) return NOME_CURTO;
  return queueNameError(nome, outrasFilas);
}

export type QueuesPanelMode = { modo: 'lista' } | { modo: 'criar' } | { modo: 'regras'; id: string };

export type QueuesPanelAction =
  | { tipo: 'abrirCriar' }
  | { tipo: 'criada'; id: string }
  | { tipo: 'editar'; id: string }
  | { tipo: 'voltar' };

export function queuesPanelReducer(state: QueuesPanelMode, action: QueuesPanelAction): QueuesPanelMode {
  switch (action.tipo) {
    case 'abrirCriar':
      return { modo: 'criar' };
    case 'criada':
      return { modo: 'regras', id: action.id };
    case 'editar':
      return { modo: 'regras', id: action.id };
    case 'voltar':
      return { modo: 'lista' };
    default:
      return state;
  }
}
