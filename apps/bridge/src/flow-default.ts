/**
 * The Builder's default flow has lived in `@pipe/core` (`fluxo/padrao.ts`) since the Management Builder also began serving it (`GET /v1/gestao/fluxos/:id/builder`). This file remains a re-export for existing importers, including `tests/fluxo-padrao.test.ts`, which proves the default is publishable unchanged.
 */
export { ACTIONS_GLOBAL_DEFAULT, FLOW_DEFAULT } from '@pipe/core';
