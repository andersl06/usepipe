import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Botao, Campo } from '@pipe/ui';
import Link from '../../components/link';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { useEu } from '../../context/session';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import { motivoDe, type Resultado } from '../../lib/rest';
import {
  KNOWLEDGE_BASES_API, createKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase,
  knowledgeDocumentsApi, getKnowledgeDocument, saveKnowledgeDocument, deleteKnowledgeDocument,
  readKnowledgeFile, type KnowledgeBase, type KnowledgeDocument, type KnowledgeDocumentDraft,
} from '../../lib/knowledge';
import './knowledge.css';

/** Tenant catalog, reached through the account panel's Configurações gerais (02-55 / P15). */
export function KnowledgeBasesPage() {
  const eu = useEu();
  const shell = portalUseShell();
  const allowed = eu.permissions.includes('automacao.fluxo.editar');
  const bases = useRead<KnowledgeBase[]>(allowed ? KNOWLEDGE_BASES_API : null);
  const [selected, setSelected] = useState<string | null>(null);
  const documents = useRead<KnowledgeDocument[]>(allowed && selected ? knowledgeDocumentsApi(selected) : null);
  const [baseForm, setBaseForm] = useState<{ id?: string; name: string } | null>(null);
  const [documentForm, setDocumentForm] = useState<(KnowledgeDocumentDraft & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const base = bases.data?.find((b) => b.id === selected);

  if (!allowed) return <Navigate to="/application/tenant" replace />;

  async function run<T>(operation: () => Promise<Resultado<T>>, success: (value: T) => void) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await operation();
      if (result.ok) { success(result.value); setNotice('Alterações salvas.'); }
      else setError(result.error);
    } finally { setBusy(false); }
  }

  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const result = await readKnowledgeFile(file);
      setDocumentForm((draft) => draft ? { ...draft, body: result.body, title: draft.title || result.title } : draft);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.'); }
    finally { setBusy(false); }
  }

  return <div className="pt-app">
    <BarraDoPortal data={shell} />
    <main className="pt-conteudo kb-page">
      <header className="kb-heading">
        <Link href="/application/tenant">← Painel do contrato</Link>
        <h1>Base de conhecimento</h1>
        <p>Organize os documentos da conta que os agentes podem consultar durante o atendimento.</p>
      </header>
      {error ? <p role="alert" className="kb-error">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="kb-layout" aria-busy={busy}>
        <section className="kb-card" aria-label="Bases de conhecimento">
          <header className="kb-row"><h2>Bases</h2><Botao disabled={busy} onClick={() => { setBaseForm({ name: '' }); setError(''); }}>Criar base</Botao></header>
          {bases.isLoading ? <p role="status">Carregando bases…</p> : null}
          {bases.isError ? <div role="alert"><p>{motivoDe(bases.error, 'Não foi possível carregar as bases.')}</p><Botao onClick={() => void bases.refetch()}>Tentar novamente</Botao></div> : null}
          {bases.data?.length === 0 ? <p>Nenhuma base criada. Crie uma base para adicionar documentos.</p> : null}
          <ul className="kb-bases">{bases.data?.map((b) => <li key={b.id}>
            <button type="button" aria-pressed={selected === b.id} disabled={busy} onClick={() => { setSelected(b.id); setDocumentForm(null); setError(''); setNotice(''); }}>
              <b>{b.name}</b><span>{b.documents} documento(s){b.active ? '' : ' · Inativa'}</span>
            </button>
          </li>)}</ul>
          {baseForm ? <form onSubmit={(e) => { e.preventDefault(); void run(() => baseForm.id ? updateKnowledgeBase(baseForm.id, { name: baseForm.name }) : createKnowledgeBase(baseForm.name), (created) => { setSelected(created.id); setDocumentForm(null); setBaseForm(null); }); }}>
            <fieldset disabled={busy}>
              <legend>{baseForm.id ? 'Renomear base' : 'Criar base'}</legend>
              <label>Nome da base<Campo autoFocus required maxLength={120} value={baseForm.name} onChange={(e) => setBaseForm({ ...baseForm, name: e.target.value })} /></label>
              <div className="kb-row"><Botao type="submit">Salvar base</Botao><Botao type="button" onClick={() => setBaseForm(null)}>Cancelar</Botao></div>
            </fieldset>
          </form> : null}
        </section>
        <section className="kb-card" aria-label="Documentos da base">
          {!base ? <p>Selecione uma base para gerenciar os documentos.</p> : <>
            <header><h2>{base.name}</h2><div className="kb-row">
              <Botao disabled={busy} onClick={() => setBaseForm({ id: base.id, name: base.name })}>Renomear base</Botao>
              <Botao disabled={busy} onClick={() => void run(() => updateKnowledgeBase(base.id, { active: !base.active }), () => undefined)}>{base.active ? 'Desativar base' : 'Ativar base'}</Botao>
              <Botao disabled={busy} onClick={() => { if (window.confirm(`Excluir a base “${base.name}” e todos os seus documentos?`)) void run(() => deleteKnowledgeBase(base.id), () => { setSelected(null); setDocumentForm(null); setBaseForm(null); }); }}>Excluir base</Botao>
            </div></header>
            <div className="kb-row"><h3>Documentos</h3><Botao disabled={busy} onClick={() => { setDocumentForm({ title: '', body: '', tags: '' }); setError(''); }}>Adicionar documento</Botao></div>
            {documents.isLoading ? <p role="status">Carregando documentos…</p> : null}
            {documents.isError ? <div role="alert"><p>{motivoDe(documents.error, 'Não foi possível carregar os documentos.')}</p><Botao onClick={() => void documents.refetch()}>Tentar novamente</Botao></div> : null}
            {documents.data?.length === 0 ? <p>Nenhum documento nesta base. Cole um texto ou envie um arquivo .txt ou .md.</p> : null}
            <ul className="kb-documents">{documents.data?.map((doc) => <li key={doc.id}>
              <div><b>{doc.title}</b><p>{doc.passages} trechos · {doc.embedded} indexados · Versão {doc.version}{doc.active ? '' : ' · Inativo'}</p><p>{doc.tags.join(', ') || 'Sem tags'}</p></div>
              <div className="kb-row">
                <Botao disabled={busy} onClick={() => void run(() => getKnowledgeDocument(base.id, doc.id), (detail) => { setDocumentForm({ id: detail.id, title: detail.title, body: detail.body, tags: detail.tags.join(', ') }); })}>Editar documento</Botao>
                <Botao disabled={busy} onClick={() => { if (window.confirm(`Excluir o documento “${doc.title}”?`)) void run(() => deleteKnowledgeDocument(base.id, doc.id), () => { if (documentForm?.id === doc.id) setDocumentForm(null); }); }}>Excluir documento</Botao>
              </div>
            </li>)}</ul>
            {documentForm ? <form onSubmit={(e) => { e.preventDefault(); void run(() => saveKnowledgeDocument(base.id, documentForm, documentForm.id), () => setDocumentForm(null)); }}>
              <fieldset disabled={busy}>
                <legend>{documentForm.id ? 'Editar documento' : 'Adicionar documento'}</legend>
                <label>Título<Campo required maxLength={200} value={documentForm.title} onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })} /></label>
                <label>Arquivo .txt ou .md<Campo type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} /></label>
                <label>Texto do documento<textarea className="campo" required rows={12} maxLength={500000} placeholder="Cole ou digite o conteúdo do documento" value={documentForm.body} onChange={(e) => setDocumentForm({ ...documentForm, body: e.target.value })} /></label>
                <label>Tags (separadas por vírgula)<Campo value={documentForm.tags} onChange={(e) => setDocumentForm({ ...documentForm, tags: e.target.value })} /></label>
                <div className="kb-row"><Botao type="submit">Salvar documento</Botao><Botao type="button" onClick={() => setDocumentForm(null)}>Cancelar</Botao></div>
              </fieldset>
            </form> : null}
          </>}
        </section>
      </div>
    </main>
  </div>;
}
