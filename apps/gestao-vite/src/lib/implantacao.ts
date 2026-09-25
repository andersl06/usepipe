import type { DeploymentSignals } from './passos-da-implantacao';

/**
 * Os sinais do assistente de implantação, lidos do banco pelo papel da
 * aplicação, com a RLS do tenant da sessão. Uma transação, consultas curtas e
 * EM SÉRIE — `Promise.all` dentro do `comTenant` apaga o `pipe.tenant_id`.
 *
 * O que cada passo significa mora em `passos-da-implantacao.ts`; aqui só se
 * pergunta ao banco.
 */

export interface DeploymentChannel {
  id: string;
  nome: string;
  ativo: boolean;
  numero: string | null;
  reauthorizationPending: boolean;
}

export interface Deployment {
  signals: DeploymentSignals;
  channels: DeploymentChannel[];
}
