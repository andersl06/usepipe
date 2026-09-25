/**
 * Consumo de IA — tokens e custo de cada chamada.
 *
 * Toda função deste pacote devolve um `Consumo` junto com o resultado. Quem chama
 * grava em `consumo_ia` (§6 do modelo de dados). Sem isto o produto vende IA no
 * prejuízo: é painel para o cliente e base de cobrança.
 *
 * Modelo desconhecido **estoura** em vez de devolver custo zero. Custo zero
 * silencioso é o defeito clássico do case-sync: sucesso sem fazer o trabalho.
 */

/** Preço de um modelo, em dólares por milhão de tokens. */
export interface PrecoTemplate {
  inboundUsdByMilhao: number;
  outputUsdByMilhao: number;
}

/**
 * Tabela de preços da API da Anthropic (primeira parte, valores de 2026-06).
 * Fica aqui e não em variável de ambiente porque preço errado é erro de cobrança,
 * e erro de cobrança tem que aparecer em teste, não em produção.
 */
export const PRECOS: Readonly<Record<string, PrecoTemplate>> = {
  'claude-sonnet-5': { inboundUsdByMilhao: 2, outputUsdByMilhao: 10 },
  'claude-opus-5': { inboundUsdByMilhao: 5, outputUsdByMilhao: 25 },
  'claude-opus-4-8': { inboundUsdByMilhao: 5, outputUsdByMilhao: 25 },
  'claude-sonnet-4-6': { inboundUsdByMilhao: 3, outputUsdByMilhao: 15 },
  'claude-haiku-4-5': { inboundUsdByMilhao: 1, outputUsdByMilhao: 5 },
  'claude-fable-5-1': { inboundUsdByMilhao: 10, outputUsdByMilhao: 50 },
};

/** Modelo padrão do pacote. Configurável por `PIPE_IA_MODELO`. */
export const TEMPLATE_DEFAULT = 'claude-sonnet-5';

export class TemplateWithoutPrecoError extends Error {
  constructor(readonly template: string) {
    super(
      `Modelo "${template}" não tem preço na tabela de \`PRECOS\`. ` +
        'Cadastre o preço antes de usar: custo zero silencioso vira prejuízo.',
    );
    this.name = 'ErroModeloSemPreco';
  }
}

/**
 * Espelha as colunas de `consumo_ia`. `custoCentavos` é **fracionário de
 * propósito**: uma chamada custa muito menos que um centavo. Acumule o período
 * inteiro e arredonde só na hora de gravar, com `arredondarCentavos`.
 */
export interface Consumo {
  template: string;
  tokensInbound: number;
  tokensSaida: number;
  custoCentavos: number;
}

/** Custo em centavos de dólar, sem arredondar. */
export function calcularCusto(template: string, tokensInbound: number, tokensSaida: number): number {
  const preco = PRECOS[template];
  if (!preco) throw new TemplateWithoutPrecoError(template);
  const usd =
    (tokensInbound / 1_000_000) * preco.inboundUsdByMilhao +
    (tokensSaida / 1_000_000) * preco.outputUsdByMilhao;
  return usd * 100;
}

/** Monta o `Consumo` de uma chamada a partir dos tokens devolvidos pela API. */
export function consumoDe(template: string, tokensInbound: number, tokensSaida: number): Consumo {
  return {
    template,
    tokensInbound,
    tokensSaida,
    custoCentavos: calcularCusto(template, tokensInbound, tokensSaida),
  };
}

/**
 * Soma consumos do mesmo modelo. Modelos diferentes viram linhas diferentes em
 * `consumo_ia` — por isso a soma recusa misturar modelos.
 */
export function somarConsumo(consumos: readonly Consumo[]): Consumo[] {
  const byTemplate = new Map<string, Consumo>();
  for (const c of consumos) {
    const acumulado = byTemplate.get(c.template);
    if (!acumulado) {
      byTemplate.set(c.template, { ...c });
      continue;
    }
    acumulado.tokensInbound += c.tokensInbound;
    acumulado.tokensSaida += c.tokensSaida;
    acumulado.custoCentavos += c.custoCentavos;
  }
  return [...byTemplate.values()];
}

/** Arredonda para o `integer` de `consumo_ia.custo_centavos`, nunca para baixo de zero. */
export function arredondarCentavos(custoCentavos: number): number {
  return Math.max(0, Math.round(custoCentavos));
}
