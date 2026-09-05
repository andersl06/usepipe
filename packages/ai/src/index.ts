/**
 * `@pipe/ai` — resumo, classificação e avaliação de atendimento com IA.
 *
 * Funções tipadas, sem acesso a banco: recebem dados, devolvem resultado. Quem
 * persiste é quem chama — em `classificacao_conversa`, `avaliacao`,
 * `resposta_avaliacao` e `consumo_ia` (§6 do modelo de dados).
 *
 * Toda chamada devolve `Consumo` com tokens e custo. Toda saída é validada por
 * esquema: resposta fora do formato falha explicitamente em vez de virar registro
 * silenciosamente errado.
 *
 * A régua de qualidade é a `bancada/`: nenhuma mudança de prompt entra sem passar
 * por ela contra o conjunto de referência.
 */
export * from './consumo/index.js';
export * from './cliente/index.js';
export * from './transcricao/index.js';
export * from './prompts/index.js';
export * from './resumo/index.js';
export * from './classificacao/index.js';
export * from './avaliacao/index.js';
export * from './bancada/index.js';
