/**
 * Montagem de parâmetro de template, com o **deslocamento por mídia no cabeçalho**.
 *
 * `referencias-blip/pesquisa/regras-blip.md` §1.4: quando o template tem imagem, vídeo ou
 * documento no cabeçalho, a mídia ocupa a posição **1** e toda variável do corpo
 * desliza +1 em relação à numeração declarada em `{{n}}`. Errar isso não dá erro:
 * o cliente recebe o nome dele no lugar do protocolo, e ninguém percebe.
 *
 * O Pipe guarda os valores por posição (é o formato que campanha, MCP e API usam).
 * A Cloud API, por outro lado, quer componentes separados — `header` com o parâmetro
 * dele, `body` com os dele. A tradução entre os dois é este arquivo, e é o único
 * lugar do produto onde a numeração é interpretada.
 */

export type CabecalhoTemplate = 'nenhum' | 'texto' | 'imagem' | 'video' | 'documento';

const CABECALHO_DE_MIDIA: readonly CabecalhoTemplate[] = ['imagem', 'video', 'documento'];

export function cabecalhoTemMidia(cabecalho: CabecalhoTemplate): boolean {
  return CABECALHO_DE_MIDIA.includes(cabecalho);
}

/** Quantas posições a mídia consome antes do corpo: 1 quando há mídia, 0 quando não. */
export function deslocamento(cabecalho: CabecalhoTemplate): number {
  return cabecalhoTemMidia(cabecalho) ? 1 : 0;
}

/**
 * Posição real de disparo da n-ésima variável do corpo (`{{n}}`, `n` começando em 1).
 * É a função que o resto do produto deve chamar em vez de somar 1 na mão.
 */
export function posicaoDeVariavel(indiceNoCorpo: number, cabecalho: CabecalhoTemplate): number {
  return indiceNoCorpo + deslocamento(cabecalho);
}

export interface TemplateParaEnvio {
  nome: string;
  idioma: string;
  cabecalhoTipo: CabecalhoTemplate;
  /** Nomes das variáveis do corpo, na ordem de `{{1}}`, `{{2}}`, … */
  variaveis: readonly string[];
}

export interface ParametroCloudApi {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string };
}

export interface ComponenteCloudApi {
  type: 'header' | 'body';
  parameters: ParametroCloudApi[];
}

export class ParametroFaltandoErro extends Error {
  readonly codigo = 'template_parametro_faltando' as const;
  readonly posicao: number;

  constructor(posicao: number, oQue: string) {
    super(`Template sem valor para a posição ${posicao} (${oQue}).`);
    this.name = 'ParametroFaltandoErro';
    this.posicao = posicao;
  }
}

const TIPO_DE_PARAMETRO: Readonly<Record<string, 'image' | 'video' | 'document'>> = {
  imagem: 'image',
  video: 'video',
  documento: 'document',
};

/**
 * Traduz o mapa posicional do Pipe para os componentes da Cloud API.
 *
 * `valores` é chaveado pela posição **de disparo** (com o deslocamento já aplicado),
 * que é como a campanha e o MCP recebem do cliente. Quem só tem os valores do corpo
 * usa `posicoesDoCorpo` para descobrir onde cada um vai.
 */
export function montarComponentes(
  template: TemplateParaEnvio,
  valores: Readonly<Record<string, string>>,
): ComponenteCloudApi[] {
  const componentes: ComponenteCloudApi[] = [];

  if (cabecalhoTemMidia(template.cabecalhoTipo)) {
    const link = valores['1'];
    if (!link) throw new ParametroFaltandoErro(1, `mídia do cabeçalho (${template.cabecalhoTipo})`);
    const tipo = TIPO_DE_PARAMETRO[template.cabecalhoTipo];
    if (!tipo) throw new ParametroFaltandoErro(1, 'cabeçalho de mídia desconhecido');
    componentes.push({ type: 'header', parameters: [{ type: tipo, [tipo]: { link } }] });
  }

  const doCorpo: ParametroCloudApi[] = [];
  template.variaveis.forEach((nome, indice) => {
    const posicao = posicaoDeVariavel(indice + 1, template.cabecalhoTipo);
    const valor = valores[String(posicao)];
    if (valor === undefined) throw new ParametroFaltandoErro(posicao, nome);
    doCorpo.push({ type: 'text', text: valor });
  });
  if (doCorpo.length > 0) componentes.push({ type: 'body', parameters: doCorpo });

  return componentes;
}

/** Nome da variável do corpo por posição de disparo — o que a tela mostra ao operador. */
export function posicoesDoCorpo(template: TemplateParaEnvio): Map<number, string> {
  const mapa = new Map<number, string>();
  template.variaveis.forEach((nome, indice) => {
    mapa.set(posicaoDeVariavel(indice + 1, template.cabecalhoTipo), nome);
  });
  return mapa;
}
