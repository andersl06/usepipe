import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEu, useSession } from '../context/session';
import { api } from './api';
import { useRead } from './query';

/**
 * Portal shell combines the signed-in user, current account, and account-selector list. This is browser-mounted `CascaDoPortal` from `apps/gestao/src/lib/portal.ts`, built from existing `api` responses `GET /v1/eu` and `GET /v1/contas/minhas`; no new endpoint is needed.
 */
export interface AccountInList {
  tenantId: string;
  nome: string;
  slug: string;
  plano: string;
  emVigor: boolean;
  onboardingConcluido: boolean;
  pessoal: boolean;
}

export interface PortalShell {
  user: { nome: string; email: string; avatarUrl: string | null };
  tenant: { nome: string; slug: string; plano: string };
  accounts: AccountInList[];
  canCreate: boolean;
}

export function portalUseShell(): PortalShell {
  const eu = useEu();
  // Failure to load account choices must not bring down the screen; show only the current account in the selector.
  const accounts = useRead<AccountInList[]>('/v1/accounts/my', { staleTime: 5 * 60_000 });
  return {
    user: { nome: eu.user.nome, email: eu.user.email, avatarUrl: eu.user.avatarUrl },
    tenant: { nome: eu.tenant.nome, slug: eu.tenant.slug, plano: eu.tenant.plano },
    accounts: accounts.data ?? [],
    canCreate: eu.permissions.includes('automacao.fluxo.editar'),
  };
}

/**
 * `POST /v1/contas/trocar` issues a new cookie to the browser. Then reread session state and navigate to the NEW account's Portal, where the person's new context is visible.
 */
export function accountUseSwitch() {
  const { atualizar } = useSession();
  const navegar = useNavigate();
  const queue = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => api.post('/v1/accounts/exchange', { tenantId }),
    onSuccess: async () => {
      await atualizar();
      queue.clear();
      navegar('/portal');
    },
    onError: () => navegar('/portal?error=troca'),
  });
}

/** Sign out through `api`, clear cached data, and return to sign-in. */
export function useSair() {
  const { sair } = useSession();
  const navegar = useNavigate();
  const queue = useQueryClient();
  return async () => {
    await sair();
    queue.clear();
    navegar('/entrar', { replace: true });
  };
}
