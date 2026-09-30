/**
 * `@pipe/ai` provides typed AI summaries, classification, and ticket evaluation without database access. Callers persist results in `classificacao_conversa`, `avaliacao`, `resposta_avaliacao`, and `consumo_ia` (§6 of the data model). Every call returns token and cost usage; schema-invalid output fails explicitly rather than becoming a silently wrong record. Prompt changes must pass the `bancada/` reference-set evaluation.
 */
export * from './consumo/index.js';
export * from './cliente/index.js';
export * from './transcription/index.js';
export * from './prompts/index.js';
export * from './resumo/index.js';
export * from './classification/index.js';
export * from './evaluation/index.js';
export * from './bancada/index.js';
export * from './agente/index.js';
export * from './embeddings/index.js';
