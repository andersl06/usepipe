import type { ConditionBlip } from '@pipe/core';
import { VARIABLE_OF_FORWARDING } from '@pipe/core';
import type { DesenhoDoBuilder } from '@pipe/contracts';

/**
 * The Builder's drawing as the SCREEN holds it: the block map in the Blip editor's format (`{ <id>: estado }` with `$contentActions`, `$conditionOutputs`, `$defaultOutput`…), which is what `GET /v1/gestao/fluxos/:id/builder` returns and what `PUT` receives back — the `ExportDoEditor` from `@pipe/core`, with `flow` called `fluxo` and `globalActions` called `globais` (`DesenhoDoBuilder`).
 *
 * Everything here is a pure function over that map: create, rename, move, duplicate, delete a block; link and unlink two blocks; and assemble what goes in the `PUT`. Components only call these and store the result. Nothing mutates the received map — every gesture returns a new map, which is what undo/redo stacks.
 *
 * The rules copied from the Blip editor (`portal.js`, `BuilderStateService`, and the jsPlumb `bind`s in `setConectionsListeners`):
 * - a new block is born with a "Entrada do usuário" (no bypass), title "Novo bloco", and a default output to the `fallback` block (when one exists);
 * - the "Humano" block is `desk:<uuid>` version 3.0.0: `ForwardToDesk` on entry, `LeavingFromDesk` after the state change, the entry waits for `desk_forwardToDeskState_status = Success`, and the three "Saídas de atendimento" are born without a destination;
 * - dragging from one block's output to another creates ONE new output condition (no condition) targeting the destination; if one already exists for the same destination → nothing happens (the editor deletes the repeated arrow); 25 is the limit;
 * - deleting the arrow removes the FIRST output condition to that destination — on "Saídas de atendimento" only the destination is cleared, the output stays;
 * - the default output isn't drawn ("The arrow linking blocks will not be displayed");
 * - Início (root), `fallback`, and `end` can't be deleted ("It's not possible to delete this state").
 */

/* ----------------------------------------------------------------- tipos */

export interface AcaoDoEditor {
  $id?: string;
  $title?: string;
  type: string;
  settings?: Record<string, unknown>;
  conditions?: ConditionBlip[];
  [extensao: string]: unknown;
}

export interface InboundValidation {
  rule: string;
  regex?: string | null;
  type?: string | null;
  error?: string | null;
}

export interface EditorInbound {
  bypass?: boolean;
  variable?: string | null;
  validation?: InboundValidation | null;
  conditions?: ConditionBlip[];
  expiration?: string | null;
  [extensao: string]: unknown;
}

export interface ItemDeConteudo {
  action?: AcaoDoEditor;
  input?: EditorInbound;
  [extensao: string]: unknown;
}

export interface SaidaDoEditor {
  $id?: string;
  stateId?: string;
  typeOfStateId?: string;
  conditions?: ConditionBlip[];
  $isDeskOutput?: boolean;
  $isDeskDefaultOutput?: boolean;
  [extensao: string]: unknown;
}

export interface Block {
  id: string;
  root?: boolean;
  $title?: string;
  $position?: { top?: string; left?: string };
  $tags?: unknown[];
  $contentActions?: ItemDeConteudo[];
  $conditionOutputs?: SaidaDoEditor[];
  $defaultOutput?: { stateId?: string; [extensao: string]: unknown } | null;
  $enteringCustomActions?: AcaoDoEditor[];
  $leavingCustomActions?: AcaoDoEditor[];
  $afterStateChangedActions?: AcaoDoEditor[];
  deskStateVersion?: string;
  [extensao: string]: unknown;
}

export type Mapa = Record<string, Block>;

export interface Position {
  top: number;
  left: number;
}

/** An arrow on the canvas: from one block to another. */
export interface Aresta {
  de: string;
  para: string;
}

/* ------------------------------------------------------------- constantes */

export const TITULO_PADRAO = 'Novo bloco';
export const TITLE_OF_ATTENDANCE = 'Atendimento humano';
export const LABEL_OF_INBOUND = 'Entrada do usuário';
export const LIMITE_DE_SAIDAS = 25;
export const ID_DO_FALLBACK = 'fallback';
export const ID_DO_FIM = 'end';
export const PREFIX_OF_ATTENDANCE = 'desk:';
export const VERSION_OF_BLOCK_OF_ATTENDANCE = '3.0.0';

export const MESSAGES = {
  limiteDeSaidas: 'Limite de 25 condições de saída atingidos',
  naoExclui: 'Não é possível deletar este estado',
  fimNaoLiga: "Um bloco de 'Fim' não se conecta com um próximo bloco. Ele deve ser sempre o último.",
} as const;

/** The `Ticket` that Desk returns to the attendance block when the attendance ends. */
const TIPO_DO_TICKET = 'application/vnd.iris.ticket+json';

/** The three "Saídas de atendimento" (attendance outputs) of the `desk:` block, in the editor's order. */
export const OUTPUTS_OF_ATTENDANCE = [
  { status: 'ClosedAttendant', rotulo: 'ticket finalizado pelo atendente' },
  { status: 'ClosedClient', rotulo: 'ticket finalizado pelo cliente' },
  { status: 'ClosedClientInactivity', rotulo: 'ticket finalizado por inatividade do cliente' },
] as const;

/* -------------------------------------------------------------- utilidades */

export const gerarId = (): string => crypto.randomUUID();

const copiar = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Formato privado para copiar blocos entre pontos do mesmo Builder. */
const MARCADOR_DE_AREA_DE_TRANSFERENCIA = 'pipe-builder:block/v1:';

export const ehAttendance = (id: string): boolean => id.startsWith(PREFIX_OF_ATTENDANCE);

const px = (value: string | undefined, padrao: number): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : padrao;
};

export function positionOf(block: Block): Position {
  return { top: px(block.$position?.top, 40), left: px(block.$position?.left, 40) };
}

/** O editor da Blip nunca deixa um bloco em coordenada negativa (`checkNegative`). */
export function positionAsText(position: Position): { top: string; left: string } {
  return {
    top: `${Math.max(0, Math.round(position.top))}px`,
    left: `${Math.max(0, Math.round(position.left))}px`,
  };
}

/** The root of the drawing, if there is exactly one. */
export function raizDe(mapa: Mapa): Block | null {
  const raizes = Object.values(mapa).filter((b) => b.root);
  return raizes.length === 1 ? raizes[0]! : null;
}

/** A entrada de um bloco (o item `input` de `$contentActions`), se houver. */
export function inboundOf(block: Block): EditorInbound | null {
  return block.$contentActions?.find((c) => c.input)?.input ?? null;
}

/* ---------------------------------------------------------- ler e montar */

/** What came from the `GET`, with the guarantee that every block carries its own id. */
/**
 * Where the first block without a position lands, and the spacing between them. `left` starts far from the edge because the canvas toolbar lives there — a block at 40 would be born hidden behind it.
 */
const ARRANJO = { left: 160, top: 96, passoX: 300, passoY: 180, porLinha: 4 } as const;

/**
 * A flow that never went through this editor (imported, or published some other way) arrives with `$position` empty on every block, and they'd all be born stacked at the same point. Whoever has no position gets one, in a grid, in map order.
 */
function arrangeWithoutPosition(mapa: Mapa): void {
  const withoutPosition = Object.values(mapa).filter((b) => !b.$position?.top && !b.$position?.left);
  withoutPosition.forEach((block, i) => {
    block.$position = positionAsText({
      left: ARRANJO.left + (i % ARRANJO.porLinha) * ARRANJO.passoX,
      top: ARRANJO.top + Math.floor(i / ARRANJO.porLinha) * ARRANJO.passoY,
    });
  });
}

export function lerDesenho(desenho: DesenhoDoBuilder): Mapa {
  const mapa: Mapa = {};
  for (const [codigo, bruto] of Object.entries(desenho.flow)) {
    if (!bruto || typeof bruto !== 'object') continue;
    const block = copiar(bruto) as Block;
    if (typeof block.id !== 'string' || !block.id) block.id = codigo;
    mapa[codigo] = block;
  }
  arrangeWithoutPosition(mapa);
  return mapa;
}

/**
 * What goes in the `PUT /v1/gestao/fluxos/:id/builder`: the block map as it stands — the editor's format IS what the `api` stores in `bloco.conteudo.original` — plus the global actions. Only the map's key is checked against the `id`, so a block renamed from outside never goes out under two names.
 */
export function montarDesenho(mapa: Mapa, global: Record<string, unknown>): DesenhoDoBuilder {
  const flow: Record<string, unknown> = {};
  for (const block of Object.values(mapa)) flow[block.id] = copiar(block);
  return { flow, globals: copiar(global) };
}

/* ------------------------------------------------------------- os blocos */

/** The card the editor draws for a message or an input. */
export function card(id: string, tipo: string, conteudo: unknown, lado: 'left' | 'right') {
  return {
    document: { id, type: tipo, content: conteudo },
    editable: true,
    deletable: true,
    position: lado,
    editing: false,
  };
}

/** The "Entrada do usuário" (user input) every new block comes with. */
export function newInbound(id = gerarId()): ItemDeConteudo {
  return {
    input: {
      bypass: false,
      $cardContent: card(id, 'text/plain', LABEL_OF_INBOUND, 'right'),
      $invalid: false,
    },
    $invalid: false,
  };
}

function esqueleto(id: string, titulo: string, position: Position): Block {
  return {
    id,
    root: false,
    $title: titulo,
    $position: positionAsText(position),
    $tags: [],
    $contentActions: [],
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    $inputSuggestions: [],
    $defaultOutput: null,
    $invalidContentActions: false,
    $invalidOutputs: false,
    $invalidCustomActions: false,
    $invalid: false,
  };
}

/** The default output of a new block: `fallback`, like in the editor — if one exists. */
function saidaPadraoInicial(mapa: Mapa): Block['$defaultOutput'] {
  return mapa[ID_DO_FALLBACK] ? { stateId: ID_DO_FALLBACK, $invalid: false } : null;
}

/** "Padrão" from the NOVO BLOCO menu (`createContentState`). */
export function newBlock(mapa: Mapa, position: Position, id = gerarId()): Block {
  return {
    ...esqueleto(id, TITULO_PADRAO, position),
    $contentActions: [newInbound(`${id}-entrada`)],
    $defaultOutput: saidaPadraoInicial(mapa),
  };
}

/** "Humano" do menu NOVO BLOCO (`createDeskStateWithForwardAndLeaving`). */
export function attendanceNewBlock(mapa: Mapa, position: Position, id = gerarId()): Block {
  const codigo = `${PREFIX_OF_ATTENDANCE}${id}`;
  const attendanceOutputs: SaidaDoEditor[] = OUTPUTS_OF_ATTENDANCE.map((s) => ({
    $id: `${id}-${s.status}`,
    $isDeskOutput: true,
    conditions: [
      { source: 'context', variable: 'input.type', comparison: 'equals', values: [TIPO_DO_TICKET] },
      { source: 'context', variable: 'input.content@status', comparison: 'equals', values: [s.status] },
    ],
  }));
  attendanceOutputs.push({
    $id: `${id}-erro`,
    $isDeskOutput: true,
    $isDeskDefaultOutput: true,
    conditions: [
      { source: 'context', variable: VARIABLE_OF_FORWARDING, comparison: 'equals', values: ['Error'] },
    ],
    ...(mapa[ID_DO_FALLBACK] ? { stateId: ID_DO_FALLBACK } : {}),
    $invalid: false,
  });
  const inbound = newInbound(`${id}-entrada`);
  inbound.input!.conditions = [
    { source: 'context', variable: VARIABLE_OF_FORWARDING, comparison: 'equals', values: ['Success'] },
  ];
  return {
    ...esqueleto(codigo, TITLE_OF_ATTENDANCE, position),
    deskStateVersion: VERSION_OF_BLOCK_OF_ATTENDANCE,
    $contentActions: [inbound],
    $enteringCustomActions: [{ $id: `${id}-forward`, type: 'ForwardToDesk', settings: {}, conditions: [] }],
    $afterStateChangedActions: [
      { $id: `${id}-leaving`, type: 'LeavingFromDesk', settings: {}, conditions: [] },
    ],
    $conditionOutputs: attendanceOutputs,
    // Once the attendance ends, the conversation returns to this same block by default.
    $defaultOutput: { stateId: codigo, $invalid: false },
  };
}

export function addBlock(mapa: Mapa, block: Block): Mapa {
  return { ...mapa, [block.id]: block };
}

export function renameBlock(mapa: Mapa, id: string, titulo: string): Mapa {
  const block = mapa[id];
  if (!block) return mapa;
  return { ...mapa, [id]: { ...block, $title: titulo } };
}

export function moveBlock(mapa: Mapa, id: string, position: Position): Mapa {
  const block = mapa[id];
  if (!block) return mapa;
  return { ...mapa, [id]: { ...block, $position: positionAsText(position) } };
}

/** Replaces the whole block — what the panel does when editing content, actions, and outputs. */
export function replaceBlock(mapa: Mapa, block: Block): Mapa {
  return { ...mapa, [block.id]: block };
}

/** "Duplicar" from the context menu: a copy with a new id, "[Cópia]" in the title, 20px to the side. */
function blockCopy(origem: Block, position: Position, novoId = gerarId()): Block {
  const copia = copiar(origem);
  copia.id = ehAttendance(origem.id) ? `${PREFIX_OF_ATTENDANCE}${novoId}` : novoId;
  copia.root = false;
  copia.$title = `${origem.$title ?? TITULO_PADRAO} [Cópia]`;
  copia.$position = positionAsText(position);
  for (const saida of copia.$conditionOutputs ?? []) {
    delete saida.$id;
    delete saida.$connId;
    if (saida.stateId === origem.id) saida.stateId = copia.id;
  }
  if (copia.$defaultOutput?.stateId === origem.id) {
    copia.$defaultOutput = { ...copia.$defaultOutput, stateId: copia.id };
  }
  return copia;
}

/** "Duplicar" conserva o deslocamento curto que o editor mostra ao lado do original. */
export function duplicateBlock(mapa: Mapa, id: string, novoId = gerarId()): Mapa {
  const origem = mapa[id];
  if (!origem) return mapa;
  const position = positionOf(origem);
  const copia = blockCopy(origem, { top: position.top + 20, left: position.left + 20 }, novoId);
  return { ...mapa, [copia.id]: copia };
}

export function copiedBlockText(block: Block): string {
  return `${MARCADOR_DE_AREA_DE_TRANSFERENCIA}${JSON.stringify(block)}`;
}

export function copiedTextBlock(texto: string): Block | null {
  if (!texto.startsWith(MARCADOR_DE_AREA_DE_TRANSFERENCIA)) return null;
  try {
    const value: unknown = JSON.parse(texto.slice(MARCADOR_DE_AREA_DE_TRANSFERENCIA.length));
    if (!value || typeof value !== 'object' || typeof (value as Block).id !== 'string') return null;
    return copiar(value as Block);
  } catch {
    return null;
  }
}

/** "Colar" (paste) creates a copy at the click position and never overwrites the original. */
export function pasteBlock(mapa: Mapa, origem: Block, position: Position, novoId = gerarId()): Mapa {
  const copia = blockCopy(origem, position, novoId);
  return { ...mapa, [copia.id]: copia };
}

/** Início, Exceções, and Fim can't be removed — same as in the editor. */
export function podeExcluir(mapa: Mapa, id: string): boolean {
  const block = mapa[id];
  if (!block) return false;
  return !block.root && id !== ID_DO_FALLBACK && id !== ID_DO_FIM;
}

/**
 * Deletes the block and whatever pointed to it: a regular output condition disappears, a "Saída de atendimento" is left without a destination, the default output becomes empty.
 */
export function deleteBlock(mapa: Mapa, id: string): Mapa {
  if (!podeExcluir(mapa, id)) return mapa;
  const novo: Mapa = {};
  for (const block of Object.values(mapa)) {
    if (block.id === id) continue;
    novo[block.id] = desligarDe(block, id, true);
  }
  return novo;
}

/* -------------------------------------------------------------- as setas */

/** The output without its destination — what the editor does with a disabled "Saída de atendimento". */
export function withoutDestination(saida: SaidaDoEditor): SaidaDoEditor {
  const resto = { ...saida };
  delete resto.stateId;
  return resto;
}

/** The arrows to draw: one per (source, destination) pair, only outputs whose destination exists. */
export function arestasDe(mapa: Mapa): Aresta[] {
  const vistas = new Set<string>();
  const arestas: Aresta[] = [];
  for (const block of Object.values(mapa)) {
    for (const saida of block.$conditionOutputs ?? []) {
      if (!saida.stateId || saida.$isDeskDefaultOutput || !mapa[saida.stateId]) continue;
      const key = `${block.id}\u0000${saida.stateId}`;
      if (vistas.has(key)) continue;
      vistas.add(key);
      arestas.push({ de: block.id, para: saida.stateId });
    }
  }
  return arestas;
}

export type ConnectionResult = { ok: true; mapa: Mapa } | { ok: false; error: string };

/** Dragged from `de`'s output to `para`: a new output condition is born targeting `para`. */
export function ligar(mapa: Mapa, de: string, para: string, id = gerarId()): ConnectionResult {
  const origem = mapa[de];
  if (!origem || !mapa[para]) return { ok: false, error: 'Bloco não encontrado.' };
  if (de === ID_DO_FIM) return { ok: false, error: MESSAGES.fimNaoLiga };
  const saidas = origem.$conditionOutputs ?? [];
  if (saidas.some((s) => s.stateId === para)) return { ok: true, mapa };
  if (saidas.length >= LIMITE_DE_SAIDAS) return { ok: false, error: MESSAGES.limiteDeSaidas };
  const nova: SaidaDoEditor = {
    $id: id,
    stateId: para,
    typeOfStateId: 'state',
    conditions: [],
    $invalid: false,
  };
  return { ok: true, mapa: { ...mapa, [de]: { ...origem, $conditionOutputs: [...saidas, nova] } } };
}

/**
 * The first output from `bloco` to `alvo` loses its link: an attendance output is left without a destination, the others disappear. With `tudo`, ALL outputs to `alvo` (what deleting the destination block needs).
 */
function desligarDe(block: Block, alvo: string, tudo: boolean): Block {
  const saidas = block.$conditionOutputs ?? [];
  const padrao = block.$defaultOutput?.stateId === alvo;
  if (!saidas.some((s) => s.stateId === alvo) && !(tudo && padrao)) return block;
  let feito = false;
  const restantes: SaidaDoEditor[] = [];
  for (const saida of saidas) {
    if (saida.stateId !== alvo || (feito && !tudo)) {
      restantes.push(saida);
      continue;
    }
    feito = true;
    if (saida.$isDeskOutput) restantes.push(withoutDestination(saida));
  }
  return {
    ...block,
    $conditionOutputs: restantes,
    ...(tudo && padrao ? { $defaultOutput: null } : {}),
  };
}

/** Deleted the arrow from `de` to `para`. */
export function desligar(mapa: Mapa, de: string, para: string): Mapa {
  const origem = mapa[de];
  if (!origem) return mapa;
  return { ...mapa, [de]: desligarDe(origem, para, false) };
}
