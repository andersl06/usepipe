import { QueryClient } from '@tanstack/react-query';

/**
 * Application-wide `api` read cache lives in a module rather than only `main.tsx`, letting form actions invalidate reads without a hook as former `revalidatePath` did. A 30s `staleTime` avoids refetching while moving between screens for one contact; Monitoring and Log request fresh data.
 */
export const clienteDeConsultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
