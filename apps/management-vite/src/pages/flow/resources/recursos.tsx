import { useEffect, useState } from 'react';
import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { ManagementIcon } from '../../../components/icones-management';
import { ShellModule, useContact } from '../contact';
import { LateralDeConteudos } from '../contents/tela';
import '../contents/conteudos.css';
import { ModalConfirmation, Modal } from '../../registrations/_modal';
import { filterResources, nameError, parseImportedResources, NAME_ERROR_MESSAGE } from './regras';
import { createFlowResource, deleteFlowResource, listFlowResources, updateFlowResource } from './gravar';

/**
 * Blip "Recursos" (menu `contents`, permission key `resources`, `portal.js`'s `ContentController`):
 * a per-flow key/value store read by the builder as `{{resource.<name>}}`. Pipe's "Conteúdos" item
 * already shows WhatsApp templates (`contents/conteudos.tsx`) — a Pipe-specific screen with no Blip
 * counterpart at that address — so Recursos gets its own top-level item instead of replacing it
 * (`pages/flow/itens.ts`); both stay reachable, and both are gated by the same `resources`
 * permission Blip itself uses for its "Conteúdos" tab.
 */

function ValueField({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const isJson = type.trim().toLowerCase().endsWith('json');
  const invalid = isJson && value.trim() !== '' && (() => {
    try {
      JSON.parse(value);
      return false;
    } catch {
      return true;
    }
  })();
  return (
    <>
      <textarea
        className="campo bl-campo-longo"
        rows={6}
        spellCheck={false}
        aria-label="Conteúdo do recurso"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid ? <Etiqueta tom="erro">Este conteúdo deve ser um JSON válido.</Etiqueta> : null}
    </>
  );
}

function ResourceForm({
  initial,
  onCancel,
  onSaved,
  save,
}: {
  initial: FlowResource | null;
  onCancel: () => void;
  onSaved: (resource: FlowResource) => void;
  save: (input: FlowResourceInput) => Promise<{ ok: true; value: FlowResource } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'text/plain');
  const [value, setValue] = useState(initial?.value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchedName, setTouchedName] = useState(false);

  const erroNome = nameError(name);

  async function salvar(): Promise<void> {
    setTouchedName(true);
    if (erroNome) return;
    setSaving(true);
    setError(null);
    const r = await save({ name: name.trim(), type: type.trim() || 'text/plain', value });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved(r.value);
  }

  return (
    <div className="cl-form">
      <h4 className="bl-section-title">{initial ? 'Editar recurso' : 'Novo recurso'}</h4>
      <label className="bl-campo">
        <span className="sub">Chave</span>
        <Campo
          value={name}
          placeholder="Insira a chave do recurso aqui"
          onBlur={() => setTouchedName(true)}
          onChange={(e) => setName(e.target.value)}
        />
        {touchedName && erroNome ? <Etiqueta tom="erro">{NAME_ERROR_MESSAGE[erroNome]}</Etiqueta> : null}
      </label>
      <label className="bl-campo">
        <span className="sub">Tipo</span>
        <Campo
          value={type}
          list="pipe-resource-types"
          placeholder="text/plain"
          onChange={(e) => setType(e.target.value)}
        />
        <datalist id="pipe-resource-types">
          <option value="text/plain" />
          <option value="application/json" />
        </datalist>
      </label>
      <label className="bl-campo">
        <span className="sub">Conteúdo</span>
        <ValueField type={type} value={value} onChange={setValue} />
      </label>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao onClick={onCancel} disabled={saving}>
          Cancelar
        </Botao>
        <Botao variante="primario" onClick={() => void salvar()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Botao>
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

  return (
    <ShellModule ativo="Conteúdos">
      <div className="ct-shell">
      <LateralDeConteudos ativo="resources" />
      <section className="ct-miolo" id="main-content-area">
      <div className="board-head">
        <h2>Recursos</h2>
      </div>
      <p className="sub">
        Adicione e altere recursos do seu chatbot. Os recursos podem ser utilizados com conteúdo das mensagens
        enviadas pelo chatbot, através de <code>{'{{resource.<chave>}}'}</code>.
      </p>

      {editing ? (
        <ResourceForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          save={(input) =>
            editing === 'new' ? createFlowResource(flowId, input) : updateFlowResource(flowId, editing.id, input)
          }
          onSaved={() => {
            setAviso(editing === 'new' ? 'Recurso salvo com sucesso!' : 'Recurso salvo com sucesso!');
            setEditing(null);
            void reload();
          }}
        />
      ) : (
        <>
          <div className="cl-actions" style={{ justifyContent: 'space-between' }}>
            <Campo
              value={search}
              placeholder="Pesquise por um recurso"
              aria-label="Pesquise por um recurso"
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="cl-actions">
              <Botao onClick={() => setImporting(true)}>Importar recursos</Botao>
              <Botao variante="primario" onClick={() => setEditing('new')}>
                Adicionar novo
              </Botao>
            </div>
          </div>

          {aviso ? <Etiqueta tom="sucesso">{aviso}</Etiqueta> : null}
          {loadError ? <Etiqueta tom="erro">{loadError}</Etiqueta> : null}
          {resources === null && !loadError ? <p className="bl-ajuda">Carregando recursos…</p> : null}
          {resources && resources.length === 0 ? (
            <div className="bl-functions-empty">
              <p className="sub">Você ainda não adicionou nenhum recurso.</p>
              <p className="bl-ajuda">
                Clique no botão &ldquo;Adicionar novo&rdquo; para adicionar recursos.
              </p>
            </div>
          ) : null}
          {resources && resources.length > 0 && filtered.length === 0 ? (
            <p className="bl-ajuda">Nenhum recurso encontrado.</p>
          ) : null}
          {filtered.length > 0 ? (
            <ul className="bl-functions-list">
              {filtered.map((resource) => (
                <li key={resource.id}>
                  <div className="bl-functions-item">
                    <div>
                      <span className="bl-variable-name">{resource.name}</span>
                      <p className="sub">{resource.type}</p>
                    </div>
                    <div className="bl-functions-item-actions">
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label={`Editar ${resource.name}`}
                        title="Editar"
                        onClick={() => setEditing(resource)}
                      >
                        <ManagementIcon nome="lapis" tamanho={18} />
                      </button>
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label={`Excluir ${resource.name}`}
                        title="Excluir"
                        onClick={() => setRemoveTarget(resource)}
                      >
                        <ManagementIcon nome="lixeira" tamanho={18} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <ImportModal
        aberto={importing}
        flowId={flowId}
        onFechar={() => setImporting(false)}
        onImported={() => void reload()}
      />

      <ModalConfirmation
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
