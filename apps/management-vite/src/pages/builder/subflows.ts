import type { BlockError, DesenhoDoSubfluxo } from '@pipe/contracts';
import { ACTIONS_GLOBAL_DEFAULT } from '@pipe/core';
import type { AcaoDoEditor, Block, Mapa, Position } from './model';
import {
  ID_DO_FIM,
  PREFIX_OF_SUBFLOW,
  deleteBlock,
  esqueleto,
  gerarId,
  lerDesenho,
  newInbound,
  saidaPadraoInicial,
} from './model';
import { ACTIONS_NOT_IN_SUBFLOW, CATALOG_OF_ACTIONS } from './actions-of-block';
import { invalidBlocks } from './error-marks';

/**
 * Subflows in the Builder (P13), on top of the engine and API from 02-51.
 *
 * A `subflow:<uuid>` block of the main flow names a subflow by its `shortNameOfSubflow`. The
 * subflow's own drawing (the editor block map, like the main flow's) travels in
 * `DesenhoDoBuilder.subflows[shortName]`. The subflow starts at its root ("Início") and hands the
 * contact back through its `end` block ("Fim"). The calling block's exits then pick the next block.
 *
 * Rules taken from the Blip editor (behaviour only, D-33):
 * - "+ Criar novo subfluxo" asks for a name and creates the calling block plus a drawing with
 *   "Início" and "Fim";
 * - deleting the calling block deletes the subflow ("Deletar subfluxo");
 * - `Redirect` and `ProcessContentAssistant` are not offered inside a subflow;
 * - errors inside a subflow are shown on the block that calls it.
 *
 * Everything here is pure, so `node --test` covers it without a DOM.
 */

/** One subflow as the screen holds it: the same three parts the main flow has. */
export interface SubflowDrawing {
  mapa: Mapa;
  global: Record<string, unknown>;
  configuracao: Record<string, string>;
}

/** Subflow drawings keyed by short name. */
export type Subflows = Record<string, SubflowDrawing>;

export const SUBFLOW_TITLE_DEFAULT = 'Novo subfluxo';
export const SUBFLOW_ROOT_ID = 'onboarding';

/** Actions Blip does not offer inside a subflow (one list, owned by the actions catalog). */
export const RESTRICTED_IN_SUBFLOW: readonly string[] = ACTIONS_NOT_IN_SUBFLOW;

export const SUBFLOW_MESSAGES = {
  criarTitulo: 'Criar novo subfluxo',
  criarBotao: '+ Criar novo subfluxo',
  nomeObrigatorio: 'Nome do subfluxo: campo obrigatório.',
  excluirTitulo: 'Deletar subfluxo',
  excluirTexto:
    'Tem certeza de que deseja deletar este subfluxo? Fazendo isso, essa tarefa será permanentemente removida e todas as suas configurações serão perdidas.',
  semDesenho: 'Este subfluxo ainda não tem desenho neste fluxo.',
  importacaoInvalida: 'O arquivo especificado não contém um subfluxo válido para importação',
} as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export const isSubflowBlock = (block: Block): boolean => block.id.startsWith(PREFIX_OF_SUBFLOW);

/** The `shortNameOfSubflow` a calling block names, or null when it names none. */
export function subflowShortNameOf(block: Block): string | null {
  const value = block['shortNameOfSubflow'];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The stored key for a short name; the engine compares short names ignoring case. */
export function subflowKey(subflows: Subflows, shortName: string): string | null {
  if (shortName in subflows) return shortName;
  const lower = shortName.toLowerCase();
  return Object.keys(subflows).find((k) => k.toLowerCase() === lower) ?? null;
}

/** The subflow a calling block opens, if its drawing exists. */
export function subflowOfBlock(block: Block, subflows: Subflows): string | null {
  const shortName = subflowShortNameOf(block);
  return shortName ? subflowKey(subflows, shortName) : null;
}

/**
 * A short name for a new subflow: the name without accents, spaces or symbols, in lower case (the
 * engine builds `subflow-{shortName}-{flowId}` from it), made unique within the flow.
 */
export function shortNameFor(title: string, existing: Iterable<string>): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 40) || 'subfluxo';
  const taken = new Set([...existing].map((k) => k.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The name shown for a subflow: the title of the first block that calls it, or its short name. */
export function subflowTitle(mapa: Mapa, shortName: string): string {
  const lower = shortName.toLowerCase();
  const caller = Object.values(mapa).find(
    (b) => isSubflowBlock(b) && subflowShortNameOf(b)?.toLowerCase() === lower,
  );
  return caller?.$title?.trim() || shortName;
}

/** An input that does not wait: the subflow starts, and returns, without a customer message. */
function passingInbound(id: string) {
  const item = newInbound(id);
  item.input!.bypass = true;
  return item;
}

/** A new subflow: "Início" goes straight to "Fim", which hands the contact back to the caller. */
export function newSubflowDrawing(): SubflowDrawing {
  const inicio: Block = {
    ...esqueleto(SUBFLOW_ROOT_ID, 'Início', { top: 120, left: 400 }),
    root: true,
    $contentActions: [passingInbound(`${SUBFLOW_ROOT_ID}-entrada`)],
    $defaultOutput: { stateId: ID_DO_FIM, $invalid: false },
  };
  const fim: Block = {
    ...esqueleto(ID_DO_FIM, 'Fim', { top: 360, left: 400 }),
    end: true,
    $contentActions: [passingInbound(`${ID_DO_FIM}-entrada`)],
  };
  return {
    mapa: { [inicio.id]: inicio, [fim.id]: fim },
    global: { ...ACTIONS_GLOBAL_DEFAULT },
    configuracao: {},
  };
}

/**
 * The calling block, as the Blip editor creates it: `subflow:<uuid>` with `shortNameOfSubflow`,
 * an input, the "Entering subflow" event on entry, and the default output to `fallback` when the
 * flow has one.
 */
export function newSubflowBlock(
  mapa: Mapa,
  position: Position,
  shortName: string,
  title: string,
  id = gerarId(),
): Block {
  const codigo = `${PREFIX_OF_SUBFLOW}${id}`;
  const entering: AcaoDoEditor = {
    $id: `${id}-evento`,
    type: 'TrackEvent',
    settings: {
      category: codigo,
      action: `Entering subflow - ${codigo}`,
      subflowDefaultAction: true,
    },
    conditions: [],
  };
  return {
    ...esqueleto(codigo, title, position),
    shortNameOfSubflow: shortName,
    $contentActions: [newInbound(`${id}-entrada`)],
    $enteringCustomActions: [entering],
    $defaultOutput: saidaPadraoInicial(mapa),
  };
}

/** "+ Criar novo subfluxo": the calling block in `mapa` and a new drawing under its short name. */
export function createSubflow(
  mapa: Mapa,
  subflows: Subflows,
  position: Position,
  title: string,
  id = gerarId(),
): { mapa: Mapa; subflows: Subflows; block: Block; shortName: string } {
  const nome = title.trim() || SUBFLOW_TITLE_DEFAULT;
  const shortName = shortNameFor(nome, Object.keys(subflows));
  const block = newSubflowBlock(mapa, position, shortName, nome, id);
  return {
    mapa: { ...mapa, [block.id]: block },
    subflows: { ...subflows, [shortName]: newSubflowDrawing() },
    block,
    shortName,
  };
}

/** Whether any block of `mapa` other than `exceptId` still calls `shortName`. */
function stillCalled(mapa: Mapa, shortName: string, exceptId: string): boolean {
  const lower = shortName.toLowerCase();
  return Object.values(mapa).some(
    (b) => b.id !== exceptId && isSubflowBlock(b) && subflowShortNameOf(b)?.toLowerCase() === lower,
  );
}

/**
 * "Deletar subfluxo": the calling block goes, and its subflow with it unless another block of the
 * same canvas still calls it (a duplicated calling block shares the subflow).
 */
export function deleteSubflowBlock(
  mapa: Mapa,
  subflows: Subflows,
  id: string,
): { mapa: Mapa; subflows: Subflows } {
  const block = mapa[id];
  const novo = deleteBlock(mapa, id);
  if (!block || novo === mapa) return { mapa, subflows };
  const key = subflowOfBlock(block, subflows);
  if (!key || stillCalled(novo, key, id)) return { mapa: novo, subflows };
  const rest = { ...subflows };
  delete rest[key];
  return { mapa: novo, subflows: rest };
}

/** Replace one subflow's block map (what every edit inside a subflow canvas does). */
export function withSubflowMap(subflows: Subflows, shortName: string, mapa: Mapa): Subflows {
  const current = subflows[shortName];
  if (!current || current.mapa === mapa) return subflows;
  return { ...subflows, [shortName]: { ...current, mapa } };
}

/* ------------------------------------------------------------ read / save */

/** What `GET /builder` brought (`desenho.subflows`), read like the main flow (`lerDesenho`). */
export function readSubflows(raw: Record<string, DesenhoDoSubfluxo> | undefined): Subflows {
  const out: Subflows = {};
  for (const [shortName, desenho] of Object.entries(raw ?? {})) {
    if (!ehObjeto(desenho) || !ehObjeto(desenho.flow)) continue;
    const global = ehObjeto(desenho.globals) ? desenho.globals : { ...ACTIONS_GLOBAL_DEFAULT };
    out[shortName] = {
      mapa: lerDesenho({ flow: desenho.flow, globals: global }),
      global,
      configuracao: ehObjeto(desenho.configuration) ? desenho.configuration : {},
    };
  }
  return out;
}

/** What goes in the `PUT` under `subflows`: every subflow, always (an empty object deletes them). */
export function buildSubflows(subflows: Subflows): Record<string, DesenhoDoSubfluxo> {
  const out: Record<string, DesenhoDoSubfluxo> = {};
  for (const [shortName, d] of Object.entries(subflows)) {
    const flow: Record<string, unknown> = {};
    for (const block of Object.values(d.mapa)) flow[block.id] = JSON.parse(JSON.stringify(block)) as unknown;
    out[shortName] = { flow, globals: d.global, configuration: d.configuracao };
  }
  return out;
}

/* ------------------------------------------------------------------ errors */

const actionLabel = (tipo: string): string =>
  CATALOG_OF_ACTIONS.find((t) => t.tipo === tipo)?.rotulo ?? tipo;

/** Blocks of a subflow using an action Blip does not offer there. */
export function restrictedActionErrors(block: Block): string[] {
  const actions = [
    ...(block.$enteringCustomActions ?? []),
    ...(block.$leavingCustomActions ?? []),
    ...(block.$contentActions ?? []).flatMap((c) => (c.action ? [c.action] : [])),
  ];
  return actions
    .filter((a) => RESTRICTED_IN_SUBFLOW.includes(a.type))
    .map((a) => `A ação '${actionLabel(a.type)}' não pode ser usada dentro de um subfluxo.`);
}

/**
 * The errors to paint inside a subflow canvas: the restricted actions, plus the API's errors for
 * this subflow. The API reports them on the calling block as "Subfluxo '<nome>': <mensagem>"; the
 * inner block is the one the message names (`'id'`, or the loop's "estado <id>"), or the root
 * when the message is about the root.
 */
export function subflowCanvasErrors(mapa: Mapa, shortName: string, apiErrors: BlockError[]): BlockError[] {
  const out: BlockError[] = [];
  for (const block of Object.values(mapa)) {
    for (const mensagem of restrictedActionErrors(block)) out.push({ block: block.id, mensagem });
  }
  const prefix = `subfluxo '${shortName.toLowerCase()}': `;
  const root = Object.values(mapa).find((b) => b.root);
  for (const e of apiErrors) {
    if (!e.mensagem.toLowerCase().startsWith(prefix)) continue;
    const mensagem = e.mensagem.slice(prefix.length);
    const loop = /começando no estado (\S+) que não pede entrada/.exec(mensagem)?.[1];
    const named =
      (loop && mapa[loop] ? loop : null) ??
      Object.keys(mapa).find((id) => mensagem.includes(`'${id}'`)) ??
      (mensagem.includes('raiz') ? root?.id : undefined);
    if (named && !out.some((o) => o.block === named && o.mensagem === mensagem)) {
      out.push({ block: named, mensagem });
    }
  }
  return out;
}

/**
 * The red blocks of a canvas. On the main flow: the screen's rules, the API's errors and the
 * calling blocks of broken subflows (this is also the Publish gate). Inside a subflow: the
 * screen's rules plus `subflowCanvasErrors`.
 */
export function canvasInvalidBlocks(
  mapa: Mapa,
  subflows: Subflows,
  apiErrors: BlockError[],
  openSubflow: string | null = null,
): Set<string> {
  if (openSubflow !== null) {
    return invalidBlocks(mapa, [
      ...subflowCanvasErrors(mapa, openSubflow, apiErrors),
      ...subflowCallerErrors(mapa, subflows),
    ]);
  }
  return invalidBlocks(mapa, [...apiErrors, ...subflowCallerErrors(mapa, subflows)]);
}

/**
 * What the screen flags on the calling blocks of `mapa`, as Blip shows a subflow's problems on the
 * block that calls it: no short name, a subflow without a drawing, or a subflow with an invalid
 * block (the screen's own rules plus the restricted actions).
 */
export function subflowCallerErrors(mapa: Mapa, subflows: Subflows): BlockError[] {
  const out: BlockError[] = [];
  for (const block of Object.values(mapa)) {
    if (!isSubflowBlock(block)) continue;
    const shortName = subflowShortNameOf(block);
    if (!shortName) {
      out.push({ block: block.id, mensagem: `O bloco de subfluxo '${block.id}' não indica qual subfluxo chamar.` });
      continue;
    }
    const key = subflowKey(subflows, shortName);
    if (!key) {
      out.push({
        block: block.id,
        mensagem: `O subfluxo '${shortName}' chamado pelo bloco '${block.id}' não existe neste fluxo.`,
      });
      continue;
    }
    const inner = subflows[key]!.mapa;
    if (invalidBlocks(inner, subflowCanvasErrors(inner, key, [])).size > 0) {
      out.push({ block: block.id, mensagem: `Subfluxo '${key}': um ou mais blocos estão inválidos.` });
    }
  }
  return out;
}
