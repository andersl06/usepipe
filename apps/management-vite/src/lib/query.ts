import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';

/**
 * Expose an `api` read as loading/error/data state through TanStack Query (`2026-09-07-arquitetura-de-front.md` Section 2). Path is the cache key, so screens requesting the same path share data and invalidation targets it.
 */
export function useRead<T>(
  caminho: string | null,
  options: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<T, Error>({
    queryKey: ['api', caminho],
    queryFn: () => api.get<T>(caminho as string),
    enabled: caminho !== null && (options.enabled ?? true),
    ...options,
  });
}
