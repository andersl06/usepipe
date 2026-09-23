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

export const MENSAGENS_DE_IMPORTACAO = {
  arquivoInvalido: 'O arquivo especificado não contém uma sequência de importação válida.',
  semRaiz: 'O arquivo especificado não contém uma sequência de importação válida.',
  disclaimer: 'Quando você importar o fluxo, a versão atual será substituída. Deseja continuar?',
} as const;

export type ResultadoDeImportacao =
  | { ok: true; mapa: Mapa; globais: Record<string, unknown> }
  | { ok: false; erro: string };

/** O texto do `.json` a baixar — `flow`/`globalActions`, como o "Exportar" deles. */
export function textoDeExportacao(mapa: Mapa, globais: Record<string, unknown>): string {
  const flow: Record<string, unknown> = {};
  for (const bloco of Object.values(mapa)) flow[bloco.id] = bloco;
  return JSON.stringify({ flow, globalActions: globais }, null, 2);
}

/** `${shortName}.json` — sem caracteres que quebrem o nome do arquivo. */
export function nomeDoArquivoDeExportacao(nomeDoFluxo: string): string {
  const seguro = nomeDoFluxo
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
export function validarImportacao(texto: string): ResultadoDeImportacao {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: MENSAGENS_DE_IMPORTACAO.arquivoInvalido };
  }
  if (!ehExportDoEditor(json)) return { ok: false, erro: MENSAGENS_DE_IMPORTACAO.arquivoInvalido };
  const globais = (json.globalActions as Record<string, unknown> | null) ?? {};
  const mapa = lerDesenho({ fluxo: json.flow, globais });
  if (!Object.values(mapa).some((bloco) => bloco.root)) {
    return { ok: false, erro: MENSAGENS_DE_IMPORTACAO.semRaiz };
  }
  return { ok: true, mapa, globais };
}
