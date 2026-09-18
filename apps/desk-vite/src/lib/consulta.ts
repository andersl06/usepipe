import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';

/**
 * Uma leitura da `api` como estado de tela: carregando, erro, dado.
 *
 * É o TanStack Query da spec (`2026-09-07-arquitetura-de-front.md` §2) por
 * trás de um nome só. A chave é o caminho: duas telas que pedem a mesma coisa
 * dividem o cache, e invalidar é invalidar o caminho.
 */
export function useLeitura<T>(
  caminho: string | null,
  opcoes: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<T, Error>({
    queryKey: ['api', caminho],
    queryFn: () => api.get<T>(caminho as string),
    enabled: caminho !== null && (opcoes.enabled ?? true),
    ...opcoes,
  });
}
