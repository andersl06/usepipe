import type { SinaisDaImplantacao } from './passos-da-implantacao';

/**
 * Os sinais do assistente de implantação, lidos do banco pelo papel da
 * aplicação, com a RLS do tenant da sessão. Uma transação, consultas curtas e
 * EM SÉRIE — `Promise.all` dentro do `comTenant` apaga o `pipe.tenant_id`.
 *
 * O que cada passo significa mora em `passos-da-implantacao.ts`; aqui só se
 * pergunta ao banco.
 */

export interface CanalDaImplantacao {
  id: string;
  nome: string;
  ativo: boolean;
  numero: string | null;
  reautorizacaoPendente: boolean;
}

export interface Implantacao {
  sinais: SinaisDaImplantacao;
  canais: CanalDaImplantacao[];
}
