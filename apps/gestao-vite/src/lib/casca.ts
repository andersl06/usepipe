import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEu, useSession } from '../contexto/sessao';
import { api } from './api';
import { useRead } from './consulta';

/**
 * A casca do portal: quem está logado, a conta em vigor e a lista do seletor.
 *
 * É o `CascaDoPortal` de `apps/gestao/src/lib/portal.ts`, montado no navegador
 * a partir do que a `api` já responde — `GET /v1/eu` (o contexto de sessão) e
 * `GET /v1/contas/minhas`. Nenhum endpoint novo.
 */
export interface AccountInLista {
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
  accounts: AccountInLista[];
  canCreate: boolean;
}

export function portalUseShell(): PortalShell {
  const eu = useEu();
  // A lista do seletor não derruba a tela: sem ela, o seletor mostra só a conta em vigor.
  const accounts = useRead<AccountInLista[]>('/v1/accounts/my', { staleTime: 5 * 60_000 });
  return {
    user: { nome: eu.user.nome, email: eu.user.email, avatarUrl: eu.user.avatarUrl },
    tenant: { nome: eu.tenant.nome, slug: eu.tenant.slug, plano: eu.tenant.plano },
    accounts: accounts.data ?? [],
    canCreate: eu.permissions.includes('automacao.fluxo.editar'),
  };
}

/**
 * Trocar de conta: `POST /v1/contas/trocar` emite o cookie novo direto no
 * navegador; depois a sessão é relida e a pessoa vai para o portal da conta
 * NOVA — o que ela quer ver depois de trocar é o que existe do outro lado.
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

/** Sair: encerra na `api`, esquece tudo que estava em cache e volta à entrada. */
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
