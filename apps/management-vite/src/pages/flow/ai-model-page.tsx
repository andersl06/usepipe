import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FlowAiModel, FlowAiModelInput, FlowSecret, MyPermissionsInFlow } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { ContactBars, contactPath, useContact } from './contact';
import { useRead } from '../../lib/query';
import { aiModelApi, saveAiModel } from '../../lib/flow-ai-model';
import { AiModelForm } from './ai-model-form';
import { aiModelErrors } from './ai-model-logic';
import './ai-model.css';

export function AiModelPage() {
  const { contact } = useContact();
  const read = useRead<FlowAiModel>(aiModelApi(contact.id));
  const permissions = useRead<MyPermissionsInFlow>(`/v1/management/flows/${contact.id}/team/i`);
  const secrets = useRead<FlowSecret[]>(`/v1/management/flows/${contact.id}/secrets`);
  const canWrite = !!permissions.data && (permissions.data.editsByAccount || permissions.data.permissoes['builder'] === 'escrever');
  return <div className="pt-app"><ContactBars ativo="Inteligência artificial" />
    <main className="pt-conteudo ai-model-page">
      <header><h1>Inteligência artificial</h1><p>Configure o modelo do bot e os assistentes de AI Answers.</p>
        <a href={contactPath(contact, 'templates/builder')} target="_blank" rel="noopener noreferrer">Abrir Builder e Variáveis sensíveis</a>
      </header>
      {read.error ? <p role="alert">Não foi possível carregar o modelo: {read.error.message} <Botao onClick={() => void read.refetch()}>Tentar novamente</Botao></p>
        : read.data ? <AiModelEditor key={contact.id} initial={read.data} canWrite={canWrite} secretNames={secrets.data?.map((s) => s.name) ?? []} />
          : <p role="status">Carregando modelo…</p>}
      {permissions.error ? <p role="alert">Não foi possível verificar a permissão de edição: {permissions.error.message}</p> : null}
      {secrets.error ? <p role="alert">Não foi possível consultar os nomes das variáveis sensíveis: {secrets.error.message}</p> : null}
    </main>
  </div>;
}

/** Keep the local draft during cache refreshes; a successful PUT replaces it with the normalized model. */
function AiModelEditor({ initial, canWrite, secretNames }: { initial: FlowAiModel; canWrite: boolean; secretNames: string[] }) {
  const query = useQueryClient();
  const [draft, setDraft] = useState<FlowAiModelInput>(initial);
  const [saved, setSaved] = useState<FlowAiModelInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errors = aiModelErrors(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    if (!canWrite || busy || errors.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await saveAiModel(initial.flowId, draft);
      if (!result.ok) { setError(result.error); return; }
      setDraft(result.value); setSaved(result.value);
      query.setQueryData(['api', aiModelApi(initial.flowId)], result.value);
      setNotice('Modelo de IA salvo. As alterações já são usadas pelo teste e pela execução do fluxo.');
    } finally { setBusy(false); }
  }
  return <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
    {!canWrite ? <p className="sub">Modo de leitura. A edição requer permissão de escrita no Builder.</p> : null}
    <div className="ai-model-toolbar">
      <Botao type="submit" disabled={!canWrite || busy || !dirty || errors.length > 0}>{busy ? 'Salvando…' : 'Salvar modelo'}</Botao>
      <Botao type="button" variante="padrao" disabled={busy || !dirty} onClick={() => { setDraft(saved); setError(''); setNotice(''); }}>Descartar alterações</Botao>
      <span role="status">{dirty ? 'Alterações não salvas' : 'Modelo salvo'}</span>
    </div>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {errors.length ? <div role="alert"><p>Revise antes de salvar:</p><ul>{errors.map((message, i) => <li key={i}>{message}</li>)}</ul></div> : null}
    <fieldset className="ai-model-editor" disabled={!canWrite || busy}>
      <AiModelForm model={draft} secretNames={secretNames} onChange={(next) => { setDraft(next); setNotice(''); }} />
    </fieldset>
  </form>;
}
