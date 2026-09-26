/**
 * Pipe schema organized by module in data-model dependency order. Two foreign keys cross modules in a cycle (`fila.horario_id` to Management and `contato.conta_id` to CRM), so migration 0003 creates them outside this schema.
 */
export * from './comum.js';
export * from './identity.js';
export * from './conversations.js';
export * from './management.js';
export * from './crm.js';
export * from './quality-review.js';
export * from './automation.js';
export * from './deployment.js';
