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
export interface PrecoModelo {
  entradaUsdPorMilhao: number;
  saidaUsdPorMilhao: number;
}

/**
 * Tabela de preços da API da Anthropic (primeira parte, valores de 2026-06).
 * Fica aqui e não em variável de ambiente porque preço errado é erro de cobrança,
 * e erro de cobrança tem que aparecer em teste, não em produção.
 */
export const PRECOS: Readonly<Record<string, PrecoModelo>> = {
  'claude-sonnet-5': { entradaUsdPorMilhao: 2, saidaUsdPorMilhao: 10 },
  'claude-opus-5': { entradaUsdPorMilhao: 5, saidaUsdPorMilhao: 25 },
  'claude-opus-4-8': { entradaUsdPorMilhao: 5, saidaUsdPorMilhao: 25 },
  'claude-sonnet-4-6': { entradaUsdPorMilhao: 3, saidaUsdPorMilhao: 15 },
  'claude-haiku-4-5': { entradaUsdPorMilhao: 1, saidaUsdPorMilhao: 5 },
  'claude-fable-5-1': { entradaUsdPorMilhao: 10, saidaUsdPorMilhao: 50 },
};

/** Modelo padrão do pacote. Configurável por `PIPE_IA_MODELO`. */
export const MODELO_PADRAO = 'claude-sonnet-5';

export class ErroModeloSemPreco extends Error {
  constructor(readonly modelo: string) {
    super(
      `Modelo "${modelo}" não tem preço na tabela de \`PRECOS\`. ` +
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
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  custoCentavos: number;
}

/** Custo em centavos de dólar, sem arredondar. */
export function calcularCusto(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const preco = PRECOS[modelo];
  if (!preco) throw new ErroModeloSemPreco(modelo);
  const usd =
    (tokensEntrada / 1_000_000) * preco.entradaUsdPorMilhao +
    (tokensSaida / 1_000_000) * preco.saidaUsdPorMilhao;
  return usd * 100;
}

/** Monta o `Consumo` de uma chamada a partir dos tokens devolvidos pela API. */
export function consumoDe(modelo: string, tokensEntrada: number, tokensSaida: number): Consumo {
  return {
    modelo,
    tokensEntrada,
    tokensSaida,
    custoCentavos: calcularCusto(modelo, tokensEntrada, tokensSaida),
  };
}

/**
 * Soma consumos do mesmo modelo. Modelos diferentes viram linhas diferentes em
 * `consumo_ia` — por isso a soma recusa misturar modelos.
 */
export function somarConsumo(consumos: readonly Consumo[]): Consumo[] {
  const porModelo = new Map<string, Consumo>();
  for (const c of consumos) {
    const acumulado = porModelo.get(c.modelo);
    if (!acumulado) {
      porModelo.set(c.modelo, { ...c });
      continue;
    }
    acumulado.tokensEntrada += c.tokensEntrada;
    acumulado.tokensSaida += c.tokensSaida;
    acumulado.custoCentavos += c.custoCentavos;
  }
  return [...porModelo.values()];
}

/** Arredonda para o `integer` de `consumo_ia.custo_centavos`, nunca para baixo de zero. */
export function arredondarCentavos(custoCentavos: number): number {
  return Math.max(0, Math.round(custoCentavos));
}
