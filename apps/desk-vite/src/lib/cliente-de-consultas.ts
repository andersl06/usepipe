import { QueryClient } from '@tanstack/react-query';

/**
 * Application-wide `api` read cache lives in a module rather than only `main.tsx` so form actions can invalidate reads without a hook, replacing the former `revalidatePath` behavior. A 30s `staleTime` avoids refetching while moving between screens for one contact; screens requiring fresh data, such as Monitoring and Log, request it explicitly.
 */
export const clienteDeConsultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
