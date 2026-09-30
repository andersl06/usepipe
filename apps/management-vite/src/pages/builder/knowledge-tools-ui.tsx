import { useId, useState } from 'react';
import { Campo } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { motivoDe } from '../../lib/rest';
import { KNOWLEDGE_BASES_API, KNOWLEDGE_BASES_PATH, knowledgeDocumentsApi, knowledgeTags, type KnowledgeBase, type KnowledgeDocument } from '../../lib/knowledge';
import type { AcaoDoEditor, Block } from './model';
import { comCampo, fieldValue } from './actions-of-block';
import { knowledgeSelection, withKnowledgeSelection, toggleKnowledgeBase, toggleKnowledgeDocument, mcpServers, saveMcpServer, removeMcpServer, type KnowledgeSelection } from './ai-agent-tools';

export function KnowledgeFields({ acao, onMudar, secretNames }: {
  acao: AcaoDoEditor;
  onMudar: (acao: AcaoDoEditor) => void;
  secretNames: string[] | null;
}) {
  const uid = useId();
  const selection = knowledgeSelection(acao);
  const bases = useRead<KnowledgeBase[]>(KNOWLEDGE_BASES_API);
  const [browseBase, setBrowseBase] = useState(selection.catalogs[0] ?? selection.documents[0]?.baseId ?? '');
  const docs = useRead<KnowledgeDocument[]>(browseBase ? knowledgeDocumentsApi(browseBase) : null);
  const [error, setError] = useState('');
  function update(changes: Partial<KnowledgeSelection>) {
    try { onMudar(withKnowledgeSelection(acao, { ...selection, ...changes })); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revise a seleção.'); }
  }
  function gesture(change: () => AcaoDoEditor) {
    try { onMudar(change()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revise a seleção.'); }
  }
  const tags = [...new Set((docs.data ?? []).flatMap((d) => d.tags))];
  return <section className="bl-agent-secao bl-knowledge" aria-label="Base de conhecimento">
    <h4>Base de conhecimento</h4>
    <p className="bl-ajuda">Selecione bases inteiras ou documentos específicos. Sem seleção, a consulta usa todas as bases ativas da conta.</p>
    <a href={KNOWLEDGE_BASES_PATH} target="_blank" rel="noreferrer">Gerenciar bases e documentos</a>
    {bases.isLoading ? <p role="status">Carregando bases…</p> : null}
    {bases.isError ? <p role="alert">{motivoDe(bases.error, 'Não foi possível carregar as bases.')} <button type="button" onClick={() => void bases.refetch()}>Tentar novamente</button></p> : null}
    {bases.data?.length === 0 ? <p className="bl-ajuda">Nenhuma base criada na conta.</p> : null}
    <fieldset className="bl-knowledge-list"><legend>Bases</legend>{bases.data?.map((base) => <label key={base.id}>
      <input type="checkbox" checked={selection.catalogs.includes(base.id)} disabled={!base.active && !selection.catalogs.includes(base.id)} onChange={(e) => gesture(() => toggleKnowledgeBase(acao, base.id, e.target.checked))} />
      {base.name}{base.active ? '' : ' (inativa)'}
    </label>)}</fieldset>
    {selection.catalogs.filter((id) => bases.data && !bases.data.some((b) => b.id === id)).map((id) => <p key={id} className="bl-agent-aviso">Base indisponível: {id} <button type="button" onClick={() => update({ catalogs: selection.catalogs.filter((v) => v !== id) })}>Remover seleção</button></p>)}
    <label className="bl-campo"><span className="sub">Documentos da base</span><select className="campo" value={browseBase} onChange={(e) => setBrowseBase(e.target.value)}>
      <option value="">Escolha uma base para listar documentos</option>
      {bases.data?.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
    </select></label>
    {docs.isLoading ? <p role="status">Carregando documentos…</p> : null}
    {docs.isError ? <p role="alert">{motivoDe(docs.error, 'Não foi possível carregar os documentos.')} <button type="button" onClick={() => void docs.refetch()}>Tentar novamente</button></p> : null}
    {browseBase && docs.data?.length === 0 ? <p className="bl-ajuda">Nenhum documento nesta base.</p> : null}
    {docs.data?.length ? <fieldset className="bl-knowledge-list"><legend>Documentos</legend>{docs.data.map((doc) => <label key={doc.id}>
      <input type="checkbox" checked={selection.documents.some((d) => d.id === doc.id)} disabled={!doc.active && !selection.documents.some((d) => d.id === doc.id)} onChange={(e) => gesture(() => toggleKnowledgeDocument(acao, { id: doc.id, baseId: doc.baseId, active: doc.active }, e.target.checked))} />
      <span>{doc.title} · {doc.passages} trechos{doc.active ? '' : ' (inativo)'}</span>
    </label>)}</fieldset> : null}
    {selection.documents.length ? <div className="bl-ajuda">{selection.documents.length} documento(s) selecionado(s)
      {selection.documents.map((doc) => <button key={doc.id} type="button" className="bl-link" onClick={() => update({ documents: selection.documents.filter((d) => d.id !== doc.id) })}>Remover {docs.data?.find((d) => d.id === doc.id)?.title ?? doc.id}</button>)}
    </div> : null}
    {tags.length ? <fieldset className="bl-knowledge-list"><legend>Tags disponíveis</legend>{tags.map((tag) => <label key={tag}><input type="checkbox" checked={selection.tags.includes(tag)} onChange={(e) => update({ tags: e.target.checked ? [...selection.tags, tag] : selection.tags.filter((t) => t !== tag) })} />{tag}</label>)}</fieldset> : null}
    <label className="bl-campo"><span className="sub">Tags (separadas por vírgula)</span><Campo key={selection.tags.join(',')} defaultValue={selection.tags.join(', ')} onBlur={(e) => {
      try { update({ tags: knowledgeTags(e.target.value) }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tags inválidas.'); }
    }} /><span className="bl-ajuda">A consulta considera documentos com pelo menos uma das tags selecionadas.</span></label>
    <div className="bl-agent-linha">
      <label className="bl-campo"><span className="sub">Quantidade de trechos</span><Campo type="number" min={1} max={20} step={1} value={fieldValue(acao, 'top_k') || fieldValue(acao, 'topK')} placeholder="5" onChange={(e) => onMudar(comCampo(acao, 'top_k', e.target.value))} /></label>
      <label className="bl-campo"><span className="sub">Confiança mínima (0 a 1)</span><Campo type="number" min={0} max={1} step={0.01} value={fieldValue(acao, 'minimumScore')} placeholder="0" onChange={(e) => onMudar(comCampo(acao, 'minimumScore', e.target.value))} /></label>
    </div>
    <label className="bl-campo"><span className="sub">Chave de embeddings (variável sensível)</span><Campo value={selection.apiKeySecret} list={`${uid}-secrets`} placeholder="OPENAI_API_KEY" onChange={(e) => onMudar(comCampo(acao, 'apiKeySecret', e.target.value))} />
      <datalist id={`${uid}-secrets`}>{secretNames?.map((name) => <option key={name} value={name} />)}</datalist>
      <span className="bl-ajuda">Informe o nome da variável sensível, sem o valor da chave. Sem uma chave OpenAI, a busca usa o texto dos documentos.</span>
    </label>
    {selection.apiKeySecret && secretNames && !secretNames.includes(selection.apiKeySecret) ? <p className="bl-agent-aviso">A variável sensível {selection.apiKeySecret} ainda não existe neste fluxo.</p> : null}
    {error ? <p role="alert" className="bl-agent-aviso">{error}</p> : null}
  </section>;
}

interface HeaderRow { header: string; secret: string }
interface McpForm { previous?: string; code: string; url: string; headers: HeaderRow[] }

export function McpConnections({ block, onMudar, secretNames }: {
  block: Block;
  onMudar: (block: Block) => void;
  secretNames: string[] | null;
}) {
  const uid = useId();
  const servers = mcpServers(block);
  const [form, setForm] = useState<McpForm | null>(null);
  const [error, setError] = useState('');
  function open(server?: (typeof servers)[number]) {
    setForm(server ? { previous: server.code, code: server.code, url: server.url, headers: Object.entries(server.secretHeaders).map(([header, secret]) => ({ header, secret })) } : { code: '', url: '', headers: [] });
    setError('');
  }
  return <section className="bl-section bl-agent-secao" aria-label="Servidores MCP">
    <h4>Conectar MCP</h4>
    <p className="bl-ajuda">Conecte ferramentas externas por uma URL HTTPS pública usando Streamable HTTP.</p>
    {servers.length === 0 ? <p className="bl-ajuda">Nenhum servidor conectado.</p> : null}
    {servers.map((server) => <article key={server.code} className="bl-agent-mcp">
      <b>{server.code}</b><p className="bl-ajuda bl-agent-mcp-url">{server.url}</p>
      <p className="bl-ajuda">{Object.entries(server.secretHeaders).map(([header, name]) => `${header}: variável sensível ${name}`).join(' · ') || 'Sem cabeçalhos sensíveis'}</p>
      {server.transport !== 'streamable-http' ? <p className="bl-agent-aviso">{server.transport === 'sse' ? 'SSE legado' : server.transport}: este transporte não é executado. Edite a conexão para usar Streamable HTTP.</p> : null}
      <div className="bl-agent-linha"><button type="button" className="bl-botao-contorno" onClick={() => open(server)}>Editar conexão</button><button type="button" className="bl-botao-contorno" onClick={() => { onMudar(removeMcpServer(block, server.code)); if (form?.previous === server.code) setForm(null); }}>Excluir conexão</button></div>
    </article>)}
    <button type="button" className="bl-botao-contorno" onClick={() => open()}>Conectar MCP</button>
    {form ? <form className="bl-agent-mcp" onSubmit={(e) => {
      e.preventDefault();
      if (new Set(form.headers.map((r) => r.header.trim().toLowerCase())).size !== form.headers.length) { setError('Não repita o mesmo cabeçalho HTTP.'); return; }
      const result = saveMcpServer(block, { code: form.code, url: form.url, secretHeaders: Object.fromEntries(form.headers.map((r) => [r.header, r.secret])) }, form.previous);
      if (!result.ok) setError(result.error);
      else { onMudar(result.block); setForm(null); setError(''); }
    }}>
      <label className="bl-campo"><span className="sub">Nome do servidor</span><Campo required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="minhas_ferramentas" /></label>
      <label className="bl-campo"><span className="sub">URL do servidor MCP</span><Campo required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://servidor.exemplo/mcp" /></label>
      <p className="bl-ajuda">Transporte: Streamable HTTP. Cabeçalhos sensíveis usam nomes de variáveis do fluxo.</p>
      {form.headers.map((row, i) => <div key={i} className="bl-agent-linha">
        <label className="bl-campo"><span className="sub">Cabeçalho HTTP</span><Campo required value={row.header} placeholder="Authorization" onChange={(e) => setForm({ ...form, headers: form.headers.map((r, j) => j === i ? { ...r, header: e.target.value } : r) })} /></label>
        <label className="bl-campo"><span className="sub">Variável sensível</span><Campo required list={`${uid}-secrets`} value={row.secret} placeholder="MCP_TOKEN" onChange={(e) => setForm({ ...form, headers: form.headers.map((r, j) => j === i ? { ...r, secret: e.target.value } : r) })} /></label>
        <button type="button" className="bl-link" aria-label={`Remover cabeçalho ${i + 1}`} onClick={() => setForm({ ...form, headers: form.headers.filter((_, j) => j !== i) })}>Remover</button>
      </div>)}
      <datalist id={`${uid}-secrets`}>{secretNames?.map((name) => <option key={name} value={name} />)}</datalist>
      <button type="button" className="bl-botao-contorno" onClick={() => setForm({ ...form, headers: [...form.headers, { header: '', secret: '' }] })}>Adicionar cabeçalho sensível</button>
      {error ? <p role="alert" className="bl-agent-aviso">{error}</p> : null}
      <div className="bl-agent-linha"><button type="submit" className="bl-botao-contorno">Salvar conexão</button><button type="button" className="bl-link" onClick={() => { setForm(null); setError(''); }}>Cancelar</button></div>
    </form> : null}
  </section>;
}
