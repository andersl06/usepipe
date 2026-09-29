import { useEffect, useState } from 'react';
import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { ConfirmModal, Modal } from '@pipe/ui/modal';
import { Select } from '@pipe/ui/select';
import { ManagementIcon } from '../../../components/icones-management';
import { ShellModule, useContact } from '../contact';
import { LateralDeConteudos } from '../contents/tela';
import '../contents/conteudos.css';
import './recursos.css';
import {
  NAME_ERROR_MESSAGE,
  RESOURCE_KIND_LABEL,
  RESOURCE_MIME,
  contentError,
  filterResources,
  kindOfType,
  nameError,
  parseImportedResources,
  truncateContent,
  typeLabel,
  type ResourceKind,
} from './regras';
import { createFlowResource, deleteFlowResource, listFlowResources, updateFlowResource } from './gravar';

/**
 * "Recursos" (menu `contents`, permission key `resources`): a per-flow key/value store read by the
 * builder as `{{resource.<name>}}`. The same screen serves flows and routers (a router is a flow row
 * of type `roteador`, so `contents/resources` sits in the shared contact routes). Each resource is a
 * card: read-only (key, type, truncated content, edit/delete) or editing in place.
 */

type SaveResult = { ok: true; value: FlowResource } | { ok: false; error: string };

function ResourceEditor({
  initial,
  onCancel,
  onSaved,
  save,
}: {
  initial: FlowResource | null;
  onCancel: () => void;
  onSaved: (resource: FlowResource) => void;
  save: (input: FlowResourceInput) => Promise<SaveResult>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ResourceKind>(initial ? kindOfType(initial.type) : 'text');
  const [value, setValue] = useState(initial?.value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameProblem = nameError(name);
  const contentProblem = contentError(kind, value);

  async function submit(): Promise<void> {
    setTouched(true);
    if (nameProblem || contentProblem) return;
    setSaving(true);
    setError(null);
    const r = await save({ name: name.trim(), type: RESOURCE_MIME[kind], value });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved(r.value);
  }

  return (
    <div className="rc-editing">
      <div className="rc-edit-row">
        <label className="rc-field rc-field--key">
          <span className="rc-label">Chave</span>
          <Campo
            value={name}
            placeholder="Insira a chave do recurso aqui"
            aria-label="Chave do recurso"
            onBlur={() => setTouched(true)}
            onChange={(e) => setName(e.target.value)}
          />
          {touched && nameProblem ? <Etiqueta tom="erro">{NAME_ERROR_MESSAGE[nameProblem]}</Etiqueta> : null}
        </label>
        <div className="rc-field rc-field--type">
          <span className="rc-label">Tipo</span>
          <Select aria-label="Tipo do recurso" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>
            <option value="text">{RESOURCE_KIND_LABEL.text}</option>
            <option value="json">{RESOURCE_KIND_LABEL.json}</option>
          </Select>
        </div>
      </div>
      <label className="rc-field">
        <span className="rc-label">Conteúdo</span>
        <textarea
          className="campo bl-campo-longo"
          rows={6}
          spellCheck={false}
          aria-label="Conteúdo do recurso"
          placeholder="Insira o conteúdo do recurso aqui"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {contentProblem ? <Etiqueta tom="erro">{contentProblem}</Etiqueta> : null}
      </label>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao onClick={onCancel} disabled={saving}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={() => void submit()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </div>
  );
}

function ResourceView({
  resource,
  onEdit,
  onDelete,
}: {
  resource: FlowResource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rc-view">
      <div className="rc-col rc-col--key">
        <span className="rc-label">Chave</span>
        <span className="rc-key">{resource.name}</span>
      </div>
      <div className="rc-col rc-col--type">
        <span className="rc-label">Tipo</span>
        <span>{typeLabel(resource.type)}</span>
      </div>
      <div className="rc-col rc-col--content">
        <span className="rc-label">Conteúdo</span>
        <span className="rc-content">{truncateContent(resource.value)}</span>
      </div>
      <div className="rc-actions">
        <button type="button" className="iconbtn" aria-label={`Editar ${resource.name}`} title="Editar" onClick={onEdit}>
          <ManagementIcon nome="lapis" tamanho={18} />
        </button>
        <button
          type="button"
          className="iconbtn"
          aria-label={`Excluir ${resource.name}`}
          title="Excluir"
          onClick={onDelete}
        >
          <ManagementIcon nome="lixeira" tamanho={18} />
        </button>
      </div>
    </div>
  );
}

function ImportModal({
  aberto,
  onFechar,
  onImported,
  flowId,
}: {
  aberto: boolean;
  onFechar: () => void;
  onImported: () => void;
  flowId: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  async function importar(): Promise<void> {
    const parsed = parseImportedResources(text);
    if (!parsed.ok) {
      setResult({ created: 0, errors: [parsed.error] });
      return;
    }
    setBusy(true);
    let created = 0;
    const errors = [...parsed.errors];
    for (const item of parsed.items) {
      const r = await createFlowResource(flowId, item);
      if (r.ok) created += 1;
      else errors.push(`"${item.name}": ${r.error}`);
    }
    setBusy(false);
    setResult({ created, errors });
    if (created > 0) onImported();
  }

  return (
    <Modal aberto={aberto} titulo="Importar recursos" onFechar={onFechar}>
      <p className="sub">
        Cole um JSON exportado do Blip (lista de <code>key</code>/<code>type</code>/<code>content</code>) ou um
        objeto simples <code>{'{ "nome": "valor" }'}</code>.
      </p>
      <textarea
        className="campo bl-campo-longo bl-campo-codigo"
        rows={10}
        spellCheck={false}
        aria-label="JSON de recursos a importar"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {result ? (
        <>
          {result.created > 0 ? <Etiqueta tom="sucesso">{result.created} recurso(s) importado(s).</Etiqueta> : null}
          {result.errors.map((erro, i) => (
            <Etiqueta key={i} tom="erro">{erro}</Etiqueta>
          ))}
        </>
      ) : null}
      <div className="cl-actions">
        <Botao onClick={onFechar} disabled={busy}>
          Fechar
        </Botao>
        <Botao variante="primario" onClick={() => void importar()} disabled={busy || !text.trim()}>
          {busy ? 'Importando…' : 'Importar'}
        </Botao>
      </div>
    </Modal>
  );
}

export function PageResources() {
  const { contact } = useContact();
  const flowId = contact.id;
  const [resources, setResources] = useState<FlowResource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FlowResource | 'new' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FlowResource | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  async function reload(): Promise<void> {
    const r = await listFlowResources(flowId);
    if (r.ok) {
      setResources(r.value);
      setLoadError(null);
    } else {
      setLoadError(r.error);
    }
  }

  useEffect(() => {
    void reload();
  }, [flowId]);

  const filtered = resources ? filterResources(resources, search) : [];

  function afterSave(): void {
    setAviso('Recurso salvo com sucesso!');
    setEditing(null);
    void reload();
  }

  return (
    <ShellModule ativo="Conteúdos">
      <div className="ct-shell">
        <LateralDeConteudos ativo="resources" />
        <section className="ct-miolo" id="main-content-area">
          <header className="rc-header">
            <div className="rc-title-row">
              <h1 className="ct-titulo">Recursos</h1>
              <button
                type="button"
                className="iconbtn"
                aria-label="Ver documentação"
                aria-expanded={helpOpen}
                title="Ver documentação"
                onClick={() => setHelpOpen((open) => !open)}
              >
                <ManagementIcon nome="ajuda" tamanho={20} />
              </button>
            </div>
            <div className="rc-header-actions">
              <Botao onClick={() => setHelpOpen((open) => !open)}>Ver documentação</Botao>
              <Botao onClick={() => setImporting(true)}>Importar recursos</Botao>
              <Botao variante="primario" onClick={() => setEditing('new')} disabled={editing === 'new'}>
                Adicionar Novo
              </Botao>
            </div>
          </header>
          {helpOpen ? (
            <p className="sub rc-help">
              Adicione e altere recursos do seu chatbot. Os recursos podem ser utilizados como conteúdo das
              mensagens enviadas pelo chatbot, através de <code>{'{{resource.<chave>}}'}</code>. Para um recurso do
              tipo JSON, use <code>{'{{resource.<chave>@<propriedade>}}'}</code>.
            </p>
          ) : null}
          <Campo
            value={search}
            placeholder="Pesquise por um recurso"
            aria-label="Pesquise por um recurso"
            onChange={(e) => setSearch(e.target.value)}
          />

          {aviso ? <Etiqueta tom="sucesso">{aviso}</Etiqueta> : null}
          {loadError ? <Etiqueta tom="erro">{loadError}</Etiqueta> : null}
          {resources === null && !loadError ? <p className="bl-ajuda">Carregando recursos…</p> : null}

          <ul className="rc-list">
            {editing === 'new' ? (
              <li className="ct-paper rc-card">
                <ResourceEditor
                  initial={null}
                  onCancel={() => setEditing(null)}
                  save={(input) => createFlowResource(flowId, input)}
                  onSaved={afterSave}
                />
              </li>
            ) : null}
            {filtered.map((resource) => (
              <li key={resource.id} className="ct-paper rc-card">
                {editing !== null && editing !== 'new' && editing.id === resource.id ? (
                  <ResourceEditor
                    initial={resource}
                    onCancel={() => setEditing(null)}
                    save={(input) => updateFlowResource(flowId, resource.id, input)}
                    onSaved={afterSave}
                  />
                ) : (
                  <ResourceView
                    resource={resource}
                    onEdit={() => setEditing(resource)}
                    onDelete={() => setRemoveTarget(resource)}
                  />
                )}
              </li>
            ))}
          </ul>
          {resources && resources.length === 0 && editing !== 'new' ? (
            <div className="bl-functions-empty">
              <p className="sub">Você ainda não adicionou nenhum recurso.</p>
              <p className="bl-ajuda">Clique no botão &ldquo;Adicionar Novo&rdquo; para adicionar recursos.</p>
            </div>
          ) : null}
          {resources && resources.length > 0 && filtered.length === 0 ? (
            <p className="bl-ajuda">Nenhum recurso encontrado.</p>
          ) : null}

          <ImportModal
            aberto={importing}
            flowId={flowId}
            onFechar={() => setImporting(false)}
            onImported={() => void reload()}
          />

          <ConfirmModal
            aberto={removeTarget !== null}
            titulo="Excluir recurso"
            message={`Excluir o recurso "${removeTarget?.name}"? Fluxos que o referenciam deixam de encontrá-lo.`}
            error={removeError}
            confirmando={removing}
            onConfirmar={async () => {
              if (!removeTarget) return;
              setRemoving(true);
              setRemoveError(null);
              const r = await deleteFlowResource(flowId, removeTarget.id);
              setRemoving(false);
              if (!r.ok) {
                setRemoveError(r.error);
                return;
              }
              setRemoveTarget(null);
              setAviso('Recurso excluído com sucesso!');
              void reload();
            }}
            onCancelar={() => {
              setRemoveTarget(null);
              setRemoveError(null);
            }}
          />
        </section>
      </div>
    </ShellModule>
  );
}
