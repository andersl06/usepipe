import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@pipe/ui/api';

/**
 * Expose an `api` read as loading, error, and data screen state through TanStack Query, as specified in `2026-09-07-arquitetura-de-front.md` §2. The path is the cache key, so screens requesting the same path share data and invalidation targets that path.
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
