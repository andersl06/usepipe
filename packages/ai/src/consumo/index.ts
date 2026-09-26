/**
 * AI usage tracks tokens and cost per call. Each package function returns `Consumo` alongside its result; callers store it in `consumo_ia` (§6 of the data model) for the customer dashboard and billing, avoiding unbilled AI usage. Unknown models fail instead of silently returning zero cost, the same false-success failure mode seen in case-sync.
 */

/** Model price in dollars per million tokens. */
export interface PrecoTemplate {
  inboundUsdByMilhao: number;
  outputUsdByMilhao: number;
}

/**
 * Anthropic API prices for the first set of models, as of 2026-06. Prices live here instead of an environment variable so billing errors are caught by tests rather than in production.
 */
export const PRECOS: Readonly<Record<string, PrecoTemplate>> = {
  'claude-sonnet-5': { inboundUsdByMilhao: 2, outputUsdByMilhao: 10 },
  'claude-opus-5': { inboundUsdByMilhao: 5, outputUsdByMilhao: 25 },
  'claude-opus-4-8': { inboundUsdByMilhao: 5, outputUsdByMilhao: 25 },
  'claude-sonnet-4-6': { inboundUsdByMilhao: 3, outputUsdByMilhao: 15 },
  'claude-haiku-4-5': { inboundUsdByMilhao: 1, outputUsdByMilhao: 5 },
  'claude-fable-5-1': { inboundUsdByMilhao: 10, outputUsdByMilhao: 50 },
};

/** Package default model, configurable through `PIPE_IA_MODELO`. */
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
 * Mirrors `consumo_ia` columns. `custoCentavos` is intentionally fractional because a call can cost far less than one cent; accumulate the whole period and round only when writing with `arredondarCentavos`.
 */
export interface Consumo {
  template: string;
  tokensInbound: number;
  tokensSaida: number;
  custoCentavos: number;
}

/** Cost in US cents, without rounding. */
export function calcularCusto(template: string, tokensInbound: number, tokensSaida: number): number {
  const preco = PRECOS[template];
  if (!preco) throw new TemplateWithoutPrecoError(template);
  const usd =
    (tokensInbound / 1_000_000) * preco.inboundUsdByMilhao +
    (tokensSaida / 1_000_000) * preco.outputUsdByMilhao;
  return usd * 100;
}


export function consumoDe(template: string, tokensInbound: number, tokensSaida: number): Consumo {
  return {
    template,
    tokensInbound,
    tokensSaida,
    custoCentavos: calcularCusto(template, tokensInbound, tokensSaida),
  };
}

/**
 * Adds usage for the same model. Different models require separate `consumo_ia` rows, so this rejects mixing them.
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

/** Rounds for `consumo_ia.custo_centavos` integer storage, never below zero. */
export function arredondarCentavos(custoCentavos: number): number {
  return Math.max(0, Math.round(custoCentavos));
}
