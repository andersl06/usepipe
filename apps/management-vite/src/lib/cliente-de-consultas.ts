import { QueryClient } from '@tanstack/react-query';

/**
 * O cache de leituras da `api`, único para o aplicativo.
 *
 * Vive num módulo (e não só no `main.tsx`) para as ações de formulário
 * invalidarem as leituras sem passar por hook — é o `revalidatePath` de antes.
 *
 * `staleTime` de 30 s: navegar entre telas do mesmo contato não repete a
 * leitura; a tela que precisa de dado fresco (o Monitoramento, o Log) pede.
 */
export const clienteDeConsultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
