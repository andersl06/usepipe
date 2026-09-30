import type { ReactNode } from 'react';
import type { FlowAiModel } from '@pipe/contracts';
import { Botao } from '@pipe/ui';

/**
 * Once a model has loaded, the editor stays mounted: a failed background refetch only shows an alert
 * beside it (TanStack keeps the last data), so unsaved edits are never discarded by a read error.
 * The editor keeps the same element position whether or not the alert is shown.
 */
export function AiModelReadView({ data, error, retry, children }: { data: FlowAiModel | undefined; error: Error | null; retry: () => void; children: (data: FlowAiModel) => ReactNode }) {
  const retryButton = <Botao type="button" variante="padrao" onClick={retry}>Tentar novamente</Botao>;
  if (data) return <>
    {error ? <p role="alert">Não foi possível atualizar o modelo: {error.message}. Suas alterações não salvas foram mantidas. {retryButton}</p> : null}
    {children(data)}
  </>;
  if (error) return <p role="alert">Não foi possível carregar o modelo: {error.message} {retryButton}</p>;
  return <p role="status">Carregando modelo…</p>;
}
