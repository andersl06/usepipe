/**
 * Signals for the deployment assistant, read from the database. The steps themselves (order,
 * labels, actions) live only in `apps/management-vite/src/lib/passos-of-deployment.ts` — this
 * file used to duplicate that logic with its own `montarPassos`, but nothing ever imported it
 * (the front computes its own steps from these signals plus the tenant's primary flow, which the
 * API does not know here). Removed rather than fixed: dead code with a broken `/canais` link is
 * still a broken link waiting for a caller.
 */

export interface SignalsOfDeployment {
  adminEntrou: boolean;
  channelsConnected: number;
  /** Ligados, mas marcados para reautorização (webhook que falhou, número pendente na Meta). */
  channelsPending: number;
  convites: number;
  /** Usuários ativos, o administrador incluído. */
  members: number;
  queuesActive: number;
  queuesWithAgent: number;
  lastImport: {
    id: string;
    state: string;
    accepted: number;
    rejeitados: number;
    temFalhas: boolean;
  } | null;
  conversationHandled: boolean;
}
