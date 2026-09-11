/**
 * Schema do Pipe, módulo a módulo, na ordem de dependência do modelo de dados.
 * Duas chaves estrangeiras cruzam módulos em círculo (`fila.horario_id` → Gestão e
 * `contato.conta_id` → CRM) e por isso nascem na migration 0003, fora do schema.
 */
export * from './comum.js';
export * from './identidade.js';
export * from './conversas.js';
export * from './gestao.js';
export * from './crm.js';
export * from './monitoria.js';
export * from './automacao.js';
export * from './implantacao.js';
