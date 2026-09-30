import { createContext, useContext, type ReactNode } from 'react';
import type { FlowAiModelInput, FlowSecret } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { useRead } from '../../lib/query';
import { aiModelApi } from '../../lib/flow-ai-model';

export const AiModelContext = createContext<{ model: FlowAiModelInput | null; editorPath?: string; loading?: boolean; refreshing?: boolean; refresh?: () => void; error?: string; secretNames?: string[] }>({ model: null });

/**
 * Assistants are edited in another tab ("Editar assistente"), and a save there only updates that tab's
 * cache. The Builder's copy therefore refetches whenever the window regains focus, overriding the
 * app-wide 30s stale time and disabled focus refetch; the picker also offers an explicit refresh.
 */
export const BUILDER_AI_MODEL_QUERY = { staleTime: 0, refetchOnWindowFocus: true } as const;

export function BuilderAiModelProvider({ flowId, editorPath, children }: { flowId: string; editorPath: string; children: ReactNode }) {
  const read = useRead<FlowAiModelInput>(aiModelApi(flowId), BUILDER_AI_MODEL_QUERY);
  const secrets = useRead<FlowSecret[]>(`/v1/management/flows/${flowId}/secrets`, BUILDER_AI_MODEL_QUERY);
  const refresh = () => { void read.refetch(); void secrets.refetch(); };
  return <AiModelContext.Provider value={{
    model: read.data ?? null, editorPath, loading: read.isPending, refreshing: read.isFetching && !read.isPending, refresh,
    error: read.error?.message, secretNames: secrets.data?.map((secret) => secret.name),
  }}>{children}</AiModelContext.Provider>;
}

/** Unknown imported IDs stay selected and serialized until the user chooses another assistant. */
export function AssistantPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { model, editorPath, loading, refreshing, refresh, error } = useContext(AiModelContext);
  const assistants = model?.assistants ?? [];
  const missing = !!value && !!model && !assistants.some((x) => x.id === value);
  return <div className="bl-agent-secao">
    <Select rotulo="Assistente" aria-label="Assistente" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      <option value="">Selecione um assistente</option>
      {value && !assistants.some((x) => x.id === value) ? <option value={value}>{value} (importado)</option> : null}
      {assistants.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </Select>
    {loading ? <p role="status">Carregando assistentes…</p> : null}
    {refreshing ? <p role="status">Atualizando assistentes…</p> : null}
    {error ? <p role="alert">Não foi possível carregar os assistentes: {error}</p> : null}
    {missing ? <p role="alert">Este assistente não existe no modelo do fluxo. Selecione outro ou cadastre-o.</p> : null}
    {!loading && model && !assistants.length ? <p>Nenhum assistente cadastrado.</p> : null}
    <p className="sub">Para consultar a resposta e o status da chamada use as variáveis aiAnswers.response e aiAnswers.statusCode. Esta ação não envia a resposta ao contato.</p>
    {editorPath ? <a href={editorPath} target="_blank" rel="noopener noreferrer">Editar assistente</a> : null}
    {editorPath ? <p className="sub">Salvou o assistente em outra aba? A lista é atualizada quando você volta ao Builder.</p> : null}
    {refresh ? <Botao type="button" variante="padrao" disabled={loading || refreshing} onClick={refresh}>Atualizar assistentes</Botao> : null}
  </div>;
}
