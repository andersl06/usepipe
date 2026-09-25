import { ehExportDoEditor } from '@pipe/core';
import type { Mapa } from './modelo';
import { lerDesenho } from './modelo';

/**
 * "Exportar fluxo" / "Importar fluxo" do editor da Blip — não é botão solto
 * na pílula, é a aba "Versões" do painel "Configuração" (`portal.js`,
 * `BuilderConfigurationVersionsView.html`: `$ctrl.exportFlow()` baixa
 * `{flow, globalActions}` como `.json`; `$ctrl.importFlow()` lê um `.json`
 * igual, valida e troca o rascunho, com um aviso de confirmação antes).
 *
 * O formato batido é o mesmo dos dois lados: `DesenhoDoBuilder` (`{fluxo,
 * globais}`) É `{flow, globalActions}` com os nomes traduzidos — por isso dá
 * pra exportar daqui e reabrir no editor da Blip, e vice-versa. A validação
 * de arquivo reaproveita `ehExportDoEditor` de `@pipe/core` (o mesmo guard
 * que o motor usa pra saber se um JSON é um export do editor) e o próprio
 * `lerDesenho` (a mesma leitura do carregamento normal, então um bloco sem
 * posição também ganha lugar na grade).
 */

export const MESSAGES_OF_IMPORT = {
  arquivoInvalido: 'O arquivo especificado não contém uma sequência de importação válida.',
  semRaiz: 'O arquivo especificado não contém uma sequência de importação válida.',
  disclaimer: 'Quando você importar o fluxo, a versão atual será substituída. Deseja continuar?',
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

/** `${shortName}.json` — sem caracteres que quebrem o nome do arquivo. */
export function nameOfFileOfExport(flowName: string): string {
  const seguro = flowName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${seguro || 'fluxo'}.json`;
}

/**
 * Lê e valida o `.json` importado; devolve o mapa e as ações globais prontos
 * pro chamador aplicar. Não é `despachar({tipo:'carregar'})` — isso marcaria
 * sujo:false e o fluxo importado nunca seria salvo (ver `builder.tsx`, que usa
 * `aplicar`/`aplicarGlobais`, os mesmos gestos de qualquer edição).
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
  const mapa = lerDesenho({ flow: json.flow, global });
  if (!Object.values(mapa).some((block) => block.root)) {
    return { ok: false, error: MESSAGES_OF_IMPORT.semRaiz };
  }
  return { ok: true, mapa, global };
}
