/**
 * `@pipe/core` — regras de negócio puras do Pipe.
 *
 * Sem banco, sem HTTP, sem relógio implícito: toda função recebe o instante de
 * referência por parâmetro. É o pacote onde erro de cálculo vira número errado
 * em relatório que o cliente usa para decidir sobre gente.
 */
export * from './comum/tipos.js';
export * from './comum/tempo.js';
export * from './telefone/index.js';
export * from './metrics/index.js';
export * from './effort/index.js';
export * from './score/index.js';
export * from './distribution/index.js';
export * from './sla/index.js';
export * from './conversation/index.js';
export * from './window/index.js';
export * from './fluxo/index.js';
/* `./analise` NÃO entra no índice: o `Intervalo` dela (dias de calendário) não
   é o `Intervalo` da SLA (instantes). Quem precisa importa `@pipe/core/analise`. */
