import { useEffect, useState } from 'react';
import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { ConfirmModal, Modal } from '@pipe/ui/modal';
import { Select } from '@pipe/ui/select';
import { ShellModule, useContact } from '../contact';
import { LateralDeConteudos } from '../contents/tela';
import '../contents/conteudos.css';
import './recursos.css';
import {
  NAME_ERROR_MESSAGE,
  RESOURCE_KIND_LABEL,
  RESOURCE_MIME,
  contentError,
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
 * of type `roteador`, so `contents/resources` sits in the shared contact routes).
 *
 * Layout follows Blip's page: the Conteúdos side menu (Modelos de Mensagem / Recursos), a header (title,
 * info button, "Adicionar Novo") and a centered container with a vertical list of cards. Each card is
 * read-only (key 20% / type 23% / content 57%, edit and delete revealed on hover) or editing in place
 * (26% / 26% / 48%). Blip shows no search box on this page, so none is rendered.
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
    <div className="rc-item rc-item--edition">
      <div className="rc-info">
        <div className="rc-key">
          <label className="rc-label" htmlFor="rc-edit-key">
            Chave
          </label>
          <Campo
            id="rc-edit-key"
            value={name}
            placeholder="Insira a chave do recurso aqui"
            onBlur={() => setTouched(true)}
            onChange={(e) => setName(e.target.value)}
          />
          {touched && nameProblem ? <Etiqueta tom="erro">{NAME_ERROR_MESSAGE[nameProblem]}</Etiqueta> : null}
        </div>
        <div className="rc-type">
          <label className="rc-label" htmlFor="rc-edit-type">
            Tipo
          </label>
          <Select id="rc-edit-type" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>
            <option value="text">{RESOURCE_KIND_LABEL.text}</option>
            <option value="json">{RESOURCE_KIND_LABEL.json}</option>
          </Select>
        </div>
        <div className="rc-content">
          <label className="rc-label" htmlFor="rc-edit-content">
            Conteúdo
          </label>
          <textarea
            id="rc-edit-content"
            className="campo rc-textarea"
            rows={3}
            spellCheck={false}
            placeholder="Insira o conteúdo do recurso aqui"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {contentProblem ? <Etiqueta tom="erro">{contentProblem}</Etiqueta> : null}
          {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        </div>
      </div>
      <div className="rc-actions rc-actions--edition">
        <button
          type="button"
          className="rc-icon-button rc-icon-button--primary"
          aria-label="Salvar"
          title="Salvar"
          onClick={() => void submit()}
          disabled={saving}
        >
          <IconePortal nome="concluido" tamanho={24} />
        </button>
        <button
          type="button"
          className="rc-icon-button"
          aria-label="Cancelar"
          title="Cancelar"
          onClick={onCancel}
          disabled={saving}
        >
          <IconePortal nome="fechar" tamanho={24} />
        </button>
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
    <div className="rc-item rc-item--view">
      <div className="rc-info">
        <div className="rc-key">
          <span className="rc-label">Chave</span>
          <span className="rc-value">{resource.name}</span>
        </div>
        <div className="rc-type">
          <span className="rc-label">Tipo</span>
          <span className="rc-value">{typeLabel(resource.type)}</span>
        </div>
        <div className="rc-content">
          <span className="rc-label">Conteúdo</span>
          <span className="rc-value rc-value--content">{truncateContent(resource.value)}</span>
        </div>
      </div>
      <div className="rc-actions">
        <button
          type="button"
          className="rc-icon-button"
          aria-label={`Editar ${resource.name}`}
          title="Editar"
          onClick={onEdit}
        >
          <IconePortal nome="editar" tamanho={24} />
        </button>
        <button
          type="button"
          className="rc-icon-button"
          aria-label={`Excluir ${resource.name}`}
          title="Excluir"
          onClick={onDelete}
        >
          <IconePortal nome="lixeira" tamanho={24} />
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
          <header className="ct-cabecalho" id="resources-header">
            <div className="cnt-header-section">
              <div className="ct-cabecalho-linha">
                <div className="ct-cabecalho-titulo">
                  <h1 className="rc-title">Recursos</h1>
                  <button
                    type="button"
                    className="rc-icon-button rc-icon-button--info"
                    aria-label="Ver informações sobre recursos"
                    aria-expanded={helpOpen}
                    title="Ver informações sobre recursos"
                    onClick={() => setHelpOpen((open) => !open)}
                  >
                    <IconePortal nome="informacao" tamanho={24} />
                  </button>
                </div>
                <div className="cnt-header-actions">
                  <button
                    type="button"
                    className="ct-botao ct-botao--principal"
                    onClick={() => setEditing('new')}
                    disabled={editing === 'new'}
                  >
                    <IconePortal nome="mais" tamanho={24} />
                    <span>Adicionar Novo</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="cnt-container rc-container">
            {helpOpen ? (
              <div className="ct-paper rc-help">
                <p>
                  Adicione e altere recursos do seu chatbot. Os recursos podem ser utilizados como conteúdo das
                  mensagens enviadas pelo chatbot, através de <code>{'{{resource.<chave>}}'}</code>. Para um recurso
                  do tipo JSON, use <code>{'{{resource.<chave>@<propriedade>}}'}</code>.
                </p>
                <button type="button" className="rc-link" onClick={() => setImporting(true)}>
                  Importar recursos
                </button>
              </div>
            ) : null}

            {aviso ? <Etiqueta tom="sucesso">{aviso}</Etiqueta> : null}
            {loadError ? <Etiqueta tom="erro">{loadError}</Etiqueta> : null}
            {resources === null && !loadError ? <p className="bl-ajuda">Carregando recursos…</p> : null}

            {editing === 'new' ? (
              <div className="ct-paper rc-paper">
                <ResourceEditor
                  initial={null}
                  onCancel={() => setEditing(null)}
                  save={(input) => createFlowResource(flowId, input)}
                  onSaved={afterSave}
                />
              </div>
            ) : null}
            {(resources ?? []).map((resource) => (
              <div key={resource.id} className="ct-paper rc-paper">
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
              </div>
            ))}
            {resources && resources.length === 0 && editing !== 'new' ? (
              <div className="bl-functions-empty">
                <p className="sub">Você ainda não adicionou nenhum recurso.</p>
                <p className="bl-ajuda">Clique no botão &ldquo;Adicionar Novo&rdquo; para adicionar recursos.</p>
              </div>
            ) : null}
          </div>

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
