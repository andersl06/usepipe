/**
 * Tipos partilhados entre a `api` e os fronts.
 *
 * A regra que dá sentido ao pacote: **um conceito, uma definição**. Se a tela e
 * a API discordam sobre o que é um plano ou sobre o nome de um campo, a
 * divergência só aparece quando alguém troca o nome — e aí em produção.
 *
 * Nada aqui importa banco, HTTP ou React. É contrato, não implementação.
 */
export * from './sessao.js';
export * from './eventos.js';
export * from './gestao-fluxo.js';
export * from './desk.js';
