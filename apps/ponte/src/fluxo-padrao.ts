/**
 * O fluxo padrão do Builder mora em `@pipe/core` (`fluxo/padrao.ts`) desde que a
 * tela do Builder da Gestão passou a servi-lo também (`GET /v1/gestao/fluxos/:id/
 * builder`). Este arquivo fica como reexportação para quem já importava daqui — o
 * teste `tests/fluxo-padrao.test.ts` inclusive, que continua provando que o padrão
 * é publicável sem mexer em nada.
 */
export { ACOES_GLOBAIS_PADRAO, FLUXO_PADRAO } from '@pipe/core';
