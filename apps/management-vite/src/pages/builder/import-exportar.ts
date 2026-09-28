import { ehExportDoEditor } from '@pipe/core';
import type { Mapa } from './model';
import { lerDesenho } from './model';

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
  | { ok: true; mapa: Mapa; global: Record<string, unknown> }
  | { ok: false; error: string };

/** O texto do `.json` a baixar — `flow`/`globalActions`, como o "Exportar" deles. */
export function exportText(mapa: Mapa, global: Record<string, unknown>): string {
  const flow: Record<string, unknown> = {};
  for (const block of Object.values(mapa)) flow[block.id] = block;
  return JSON.stringify({ flow, globalActions: global }, null, 2);
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
  return { ok: true, mapa, global };
}
