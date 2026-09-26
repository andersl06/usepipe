/**
 * `@pipe/core` holds pure Pipe business rules: no database, HTTP, or implicit clock; callers pass the reference instant. A calculation error here becomes a wrong report number customers use for staffing decisions.
 */
export * from './comum/tipos.js';
export * from './comum/time.js';
export * from './telefone/index.js';
export * from './metrics/index.js';
export * from './effort/index.js';
export * from './score/index.js';
export * from './distribution/index.js';
export * from './sla/index.js';
export * from './conversation/index.js';
export * from './window/index.js';
export * from './flow/index.js';
/*
 * `./analise` is intentionally absent from the barrel: its `Intervalo` means calendar days, while SLA `Intervalo` means instants. Import `@pipe/core/analise` explicitly.
 */
