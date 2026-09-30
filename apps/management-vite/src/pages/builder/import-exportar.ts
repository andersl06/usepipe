import { ehExportDoEditor } from '@pipe/core';
import type { Mapa } from './model';
import { lerDesenho } from './model';
import type { SubflowDrawing, Subflows } from './subflows';
import { SUBFLOW_MESSAGES, isSubflowBlock, subflowKey, subflowShortNameOf } from './subflows';

/**
 * "Exportar fluxo" / "Importar fluxo" from the Blip editor — not a standalone button on the pill, it's the "Versões" tab of the "Configuração" panel (`portal.js`, `BuilderConfigurationVersionsView.html`: `$ctrl.exportFlow()` downloads `{flow, globalActions}` as `.json`; `$ctrl.importFlow()` reads a matching `.json`, validates it and swaps the draft, with a confirmation warning first).
 *
 * The format matches on both sides: `DesenhoDoBuilder` (`{fluxo, globais}`) IS `{flow, globalActions}` with translated names — which is why you can export from here and reopen it in the Blip editor, and vice versa. File validation reuses `ehExportDoEditor` from `@pipe/core` (the same guard the engine uses to know whether a JSON is an editor export) and `lerDesenho` itself (the same read used for normal loading, so a block without a position also gets a spot on the grid).
 */

export const MESSAGES_OF_IMPORT = {
  arquivoInvalido: 'O arquivo especificado não contém um fluxo válido para importação',
  semRaiz: 'O arquivo especificado não contém um fluxo válido para importação',
  disclaimer: 'Ao importar o fluxo, a sua versão atual será substituída. Deseja continuar?',
  /**
   * Blip's text for a failure after the "Sim" confirmation (F-2.1). Pipe's import is a synchronous,
   * client-side dispatch (`builder.tsx`'s `onImport`) with no failure mode after `validateImport`
   * already passed, so this stays unreachable until import goes through the API.
   */
  erroAoCarregar: 'Não foi possível importar o fluxo',
} as const;

export type ImportResult =
  | { ok: true; mapa: Mapa; global: Record<string, unknown>; subfluxos: Subflows }
  | { ok: false; error: string };

const flowOf = (mapa: Mapa): Record<string, unknown> => {
  const flow: Record<string, unknown> = {};
  for (const block of Object.values(mapa)) flow[block.id] = block;
  return flow;
};

/**
 * O texto do `.json` a baixar — `flow`/`globalActions`, como o "Exportar" deles. With subflows
 * (P13) the file also carries `subflows: { <shortName>: { flow, globalActions } }`, the bundle the
 * engine import reads (`blipReadFlow`), so the download reopens here with its subflows. The Blip
 * editor exports each subflow separately; it ignores the extra key.
 */
export function exportText(mapa: Mapa, global: Record<string, unknown>, subfluxos: Subflows = {}): string {
  const bundle = Object.fromEntries(
    Object.entries(subfluxos).map(([shortName, s]) => [
      shortName,
      { flow: flowOf(s.mapa), globalActions: s.global, configuration: s.configuracao },
    ]),
  );
  return JSON.stringify(
    {
      flow: flowOf(mapa),
      globalActions: global,
      ...(Object.keys(bundle).length > 0 ? { subflows: bundle } : {}),
    },
    null,
    2,
  );
}

/** "Baixar subfluxo": one subflow as its own editor export, like Blip's subflow export. */
export function exportSubflowText(subflow: SubflowDrawing): string {
  return JSON.stringify(
    { flow: flowOf(subflow.mapa), globalActions: subflow.global, configuration: subflow.configuracao },
    null,
    2,
  );
}

/** A subflow editor export read into a drawing, or null when it is not one (no root). */
function readSubflowExport(json: unknown): SubflowDrawing | null {
  if (!ehExportDoEditor(json)) return null;
  const global = (json.globalActions as Record<string, unknown> | null) ?? {};
  const mapa = lerDesenho({ flow: json.flow, globals: global });
  if (!Object.values(mapa).some((block) => block.root)) return null;
  const configuration = (json as { configuration?: unknown }).configuration;
  return {
    mapa,
    global,
    configuracao:
      configuration && typeof configuration === 'object' && !Array.isArray(configuration)
        ? (configuration as Record<string, string>)
        : {},
  };
}

/**
 * "Carregar subfluxo" inside a subflow canvas: a Blip subflow export (editor format) replaces
 * that subflow's drawing. Blip's own check has the same wording for a file that is not one.
 */
export function validateSubflowImport(
  texto: string,
): { ok: true; subflow: SubflowDrawing } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, error: SUBFLOW_MESSAGES.importacaoInvalida };
  }
  const subflow = readSubflowExport(json);
  return subflow ? { ok: true, subflow } : { ok: false, error: SUBFLOW_MESSAGES.importacaoInvalida };
}

/** Lowercased flow name without characters that would break a file name. */
function safeName(flowName: string): string {
  const seguro = flowName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return seguro || 'fluxo';
}

/** `${shortName}.json` — the current draft's export file name. */
export function nameOfFileOfExport(flowName: string): string {
  return `${safeName(flowName)}.json`;
}

/**
 * `${shortName}-v{version}-{date}.json` for an old version's export (D-16): the version number and
 * publish date tell two exports of the same flow apart. `date` accepts `publicadaEm`/`criadoEm` as
 * returned by the `api` (ISO string) or null when the version has neither yet.
 */
export function nameOfFileOfExportedVersion(
  flowName: string,
  version: number,
  date: string | null,
): string {
  const dia = date?.slice(0, 10);
  return `${safeName(flowName)}-v${version}${dia ? `-${dia}` : ''}.json`;
}

/**
 * Reads and validates the imported `.json`; returns the map and global actions ready for the caller to apply. It isn't `despachar({tipo:'carregar'})` — that would mark sujo:false and the imported flow would never be saved (see `builder.tsx`, which uses `aplicar`/`aplicarGlobais`, the same gestures as any edit).
 */
export function validateImport(texto: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, error: MESSAGES_OF_IMPORT.arquivoInvalido };
  }
  if (!ehExportDoEditor(json)) return { ok: false, error: MESSAGES_OF_IMPORT.arquivoInvalido };
  const global = (json.globalActions as Record<string, unknown> | null) ?? {};
  const mapa = lerDesenho({ flow: json.flow, globals: global });
  if (!Object.values(mapa).some((block) => block.root)) {
    return { ok: false, error: MESSAGES_OF_IMPORT.semRaiz };
  }
  // Subflows bundled in the file (`subflows: { <shortName>: <editor export> }`, P13).
  const bundled = (json as { subflows?: unknown }).subflows;
  const subfluxos: Subflows = {};
  if (bundled && typeof bundled === 'object' && !Array.isArray(bundled)) {
    for (const [shortName, exportado] of Object.entries(bundled)) {
      const subflow = readSubflowExport(exportado);
      if (!subflow) return { ok: false, error: `${SUBFLOW_MESSAGES.importacaoInvalida}: '${shortName}'` };
      subfluxos[shortName] = subflow;
    }
  }
  return { ok: true, mapa, global, subfluxos };
}

/**
 * The subflows a just-imported flow calls but did not bring (Blip exports each subflow in its own
 * file). The Builder names them in the import toast; each can then be loaded from its block.
 */
export function missingSubflows(mapa: Mapa, subfluxos: Subflows): string[] {
  const names = new Set<string>();
  for (const block of Object.values(mapa)) {
    if (!isSubflowBlock(block)) continue;
    const shortName = subflowShortNameOf(block);
    if (shortName && !subflowKey(subfluxos, shortName)) names.add(shortName);
  }
  return [...names];
}
