/**
 * Build template parameters with the MEDIA HEADER OFFSET. `referencias-blip/pesquisa/regras-blip.md` §1.4: when a template header contains an image, video, or document, media takes send position 1 and every body variable shifts by one from its declared `{{n}}` number. A wrong offset can silently send the client's name where a protocol number belongs. Pipe stores values by position, as campaigns, MCP, and API supply them; Cloud API expects separate `header` and `body` components. This file is the product's only interpretation of that numbering.
 */

export type CabecalhoTemplate = 'nenhum' | 'texto' | 'imagem' | 'video' | 'documento';

const HEADER_OF_MEDIA: readonly CabecalhoTemplate[] = ['imagem', 'video', 'documento'];

export function headerHasMedia(cabecalho: CabecalhoTemplate): boolean {
  return HEADER_OF_MEDIA.includes(cabecalho);
}

/** Number of positions media consumes before the body: one with media, zero otherwise. */
export function offset(cabecalho: CabecalhoTemplate): number {
  return headerHasMedia(cabecalho) ? 1 : 0;
}

/**
 * Actual send position of the body variable `n` (`{{n}}`, starting at 1). Call this instead of adding one manually elsewhere.
 */
export function positionOfVariable(indiceNoCorpo: number, cabecalho: CabecalhoTemplate): number {
  return indiceNoCorpo + offset(cabecalho);
}

export interface TemplateParaEnvio {
  nome: string;
  idioma: string;
  cabecalhoTipo: CabecalhoTemplate;

  variables: readonly string[];
}

export interface ParametroCloudApi {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string };
}

export interface ComponentCloudApi {
  type: 'header' | 'body';
  parameters: ParametroCloudApi[];
}

export class ParametroMissingError extends Error {
  readonly codigo = 'template_parametro_faltando' as const;
  readonly position: number;

  constructor(position: number, oQue: string) {
    super(`Template sem valor para a posição ${position} (${oQue}).`);
    this.name = 'ParametroFaltandoErro';
    this.position = position;
  }
}

const TIPO_DE_PARAMETRO: Readonly<Record<string, 'image' | 'video' | 'document'>> = {
  imagem: 'image',
  video: 'video',
  documento: 'document',
};

/**
 * Translate Pipe's positional map into Cloud API components. `valores` is keyed by SEND position, with the offset already applied, as supplied to campaigns and MCP. Callers holding only body values use `posicoesDoCorpo` to find each send position.
 */
export function assembleComponents(
  template: TemplateParaEnvio,
  values: Readonly<Record<string, string>>,
): ComponentCloudApi[] {
  const components: ComponentCloudApi[] = [];

  if (headerHasMedia(template.cabecalhoTipo)) {
    const link = values['1'];
    if (!link) throw new ParametroMissingError(1, `mídia do cabeçalho (${template.cabecalhoTipo})`);
    const tipo = TIPO_DE_PARAMETRO[template.cabecalhoTipo];
    if (!tipo) throw new ParametroMissingError(1, 'cabeçalho de mídia desconhecido');
    components.push({ type: 'header', parameters: [{ type: tipo, [tipo]: { link } }] });
  }

  const doCorpo: ParametroCloudApi[] = [];
  template.variables.forEach((nome, indice) => {
    const position = positionOfVariable(indice + 1, template.cabecalhoTipo);
    const value = values[String(position)];
    if (value === undefined) throw new ParametroMissingError(position, nome);
    doCorpo.push({ type: 'text', text: value });
  });
  if (doCorpo.length > 0) components.push({ type: 'body', parameters: doCorpo });

  return components;
}


export function positionsOfBody(template: TemplateParaEnvio): Map<number, string> {
  const mapa = new Map<number, string>();
  template.variables.forEach((nome, indice) => {
    mapa.set(positionOfVariable(indice + 1, template.cabecalhoTipo), nome);
  });
  return mapa;
}
