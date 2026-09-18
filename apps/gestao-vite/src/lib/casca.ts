import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEu, useSessao } from '../contexto/sessao';
import { api } from './api';
import { useLeitura } from './consulta';

/**
 * A casca do portal: quem está logado, a conta em vigor e a lista do seletor.
 *
 * É o `CascaDoPortal` de `apps/gestao/src/lib/portal.ts`, montado no navegador
 * a partir do que a `api` já responde — `GET /v1/eu` (o contexto de sessão) e
 * `GET /v1/contas/minhas`. Nenhum endpoint novo.
 */
export interface ContaNaLista {
  tenantId: string;
  nome: string;
  slug: string;
  plano: string;
  emVigor: boolean;
  onboardingConcluido: boolean;
  pessoal: boolean;
}

export interface CascaDoPortal {
  usuario: { nome: string; email: string; avatarUrl: string | null };
  tenant: { nome: string; slug: string; plano: string };
  contas: ContaNaLista[];
  podeCriar: boolean;
}

export function useCascaDoPortal(): CascaDoPortal {
  const eu = useEu();
  // A lista do seletor não derruba a tela: sem ela, o seletor mostra só a conta em vigor.
  const contas = useLeitura<ContaNaLista[]>('/v1/contas/minhas', { staleTime: 5 * 60_000 });
  return {
    usuario: { nome: eu.usuario.nome, email: eu.usuario.email, avatarUrl: eu.usuario.avatarUrl },
    tenant: { nome: eu.tenant.nome, slug: eu.tenant.slug, plano: eu.tenant.plano },
    contas: contas.data ?? [],
    podeCriar: eu.permissoes.includes('automacao.fluxo.editar'),
  };
}

/**
 * Trocar de conta: `POST /v1/contas/trocar` emite o cookie novo direto no
 * navegador; depois a sessão é relida e a pessoa vai para o portal da conta
 * NOVA — o que ela quer ver depois de trocar é o que existe do outro lado.
 */
export function useTrocarDeConta() {
  const { atualizar } = useSessao();
  const navegar = useNavigate();
  const fila = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => api.post('/v1/contas/trocar', { tenantId }),
    onSuccess: async () => {
      await atualizar();
      fila.clear();
      navegar('/portal');
    },
    onError: () => navegar('/portal?erro=troca'),
  });
}

/** Sair: encerra na `api`, esquece tudo que estava em cache e volta à entrada. */
export function useSair() {
  const { sair } = useSessao();
  const navegar = useNavigate();
  const fila = useQueryClient();
  return async () => {
    await sair();
    fila.clear();
    navegar('/entrar', { replace: true });
  };
}
