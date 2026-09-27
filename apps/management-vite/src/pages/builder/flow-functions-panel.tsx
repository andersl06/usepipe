import { Suspense, lazy, useEffect, useState } from 'react';
import type { FlowFunction, FlowFunctionInput } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { ModalConfirmation } from '../registrations/_modal';
import { filterFlowFunctions, functionCallSnippet } from './flow-functions';
import {
  createFlowFunction,
  deleteFlowFunction,
  listFlowFunctions,
  updateFlowFunction,
} from './flow-functions-gravar';

/**
 * The engine's "Biblioteca de funções" (D-22): reachable from the Configuration panel's "Funções"
 * tab (management: list, search, create/edit, delete) and from `panel-actions.tsx`, both as the
 * `ExecuteBlipFunction` action's "Definição da função" field (`FlowFunctionSelect`) and as the
 * script actions' "insert a library call" helper over the code field (`FlowFunctionInsertPicker`).
 * All three share the search-by-name-or-description list (`FlowFunctionSearch`) and the create/edit
 * form (`FlowFunctionForm`), reusing the lazy Monaco editor from `code-editor.tsx` (02-16) for the
 * function's own source — the same engine `ExecuteScriptV2` already runs on (D-22).
 */

const CodeEditor = lazy(() => import('./code-editor'));
const FUNCTION_TEMPLATE = 'function minhaFuncao() {\n  return;\n}\n';

/* ------------------------------------------------------------------ form */

function ParametersEditor({
  parameters,
  onMudar,
}: {
  parameters: string[];
  onMudar: (parameters: string[]) => void;
}) {
  return (
    <div className="bl-cabecalhos">
      {parameters.map((nome, indice) => (
        <div className="bl-header-row" key={indice}>
          <Campo
            value={nome}
            placeholder="Nome do parâmetro"
            aria-label={`Parâmetro ${indice + 1}`}
            onChange={(e) =>
              onMudar(parameters.map((p, i) => (i === indice ? e.target.value : p)))
            }
          />
          <button
            type="button"
            className="iconbtn"
            aria-label="Remover parâmetro"
            onClick={() => onMudar(parameters.filter((_, i) => i !== indice))}
          >
            <ManagementIcon nome="lixeira" tamanho={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="bl-adicionar-cabecalho"
        onClick={() => onMudar([...parameters, ''])}
      >
        + Adicionar parâmetro
      </button>
    </div>
  );
}

function FlowFunctionForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: FlowFunction | null;
  onCancel: () => void;
  onSaved: (fn: FlowFunction) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parameters, setParameters] = useState<string[]>(initial?.parameters ?? []);
  const [code, setCode] = useState(initial?.code ?? FUNCTION_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar(): Promise<void> {
    setSaving(true);
    setError(null);
    const input: FlowFunctionInput = {
      name: name.trim(),
      description: description.trim() || null,
      parameters: parameters.map((p) => p.trim()).filter(Boolean),
      code,
    };
    const r = initial
      ? await updateFlowFunction(initial.id, input)
      : await createFlowFunction(input);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved(r.value);
  }

  return (
    <div className="bl-aba-corpo bl-functions-form">
      <h4 className="bl-section-title">{initial ? 'Editar função' : 'Criar função'}</h4>
      <label className="bl-campo">
        <span className="sub">Nome</span>
        <Campo value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="bl-campo">
        <span className="sub">Descrição</span>
        <textarea
          className="campo bl-campo-longo"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="bl-campo">
        <span className="sub">Parâmetros</span>
        <ParametersEditor parameters={parameters} onMudar={setParameters} />
      </label>
      <label className="bl-campo">
        <span className="sub">Código-fonte</span>
        <Suspense
          fallback={
            <textarea
              className="campo bl-campo-codigo"
              rows={10}
              spellCheck={false}
              aria-label="Código-fonte da função"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          }
        >
          <CodeEditor ariaLabel="Código-fonte da função" value={code} onChange={setCode} />
        </Suspense>
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

/* -------------------------------------------------------------- library panel */

export function FlowFunctionsPanel() {
  const [functions, setFunctions] = useState<FlowFunction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FlowFunction | 'new' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FlowFunction | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const r = await listFlowFunctions();
    if (r.ok) {
      setFunctions(r.value);
      setLoadError(null);
    } else {
      setLoadError(r.error);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (editing) {
    return (
      <FlowFunctionForm
        initial={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setAviso(editing === 'new' ? 'Função criada.' : 'Função salva.');
          setEditing(null);
          void reload();
        }}
      />
    );
  }

  const filtered = functions ? filterFlowFunctions(functions, search) : [];

  return (
    <div className="bl-aba-corpo">
      <h4 className="bl-section-title">Biblioteca de funções</h4>
      <Campo
        value={search}
        placeholder="Pesquisar função"
        aria-label="Pesquisar função"
        onChange={(e) => setSearch(e.target.value)}
      />
      {aviso ? <Etiqueta tom="sucesso">{aviso}</Etiqueta> : null}
      {loadError ? <Etiqueta tom="erro">{loadError}</Etiqueta> : null}
      {functions === null && !loadError ? <p className="bl-ajuda">Carregando funções…</p> : null}
      {functions && functions.length === 0 ? (
        <div className="bl-functions-empty">
          <p className="sub">Crie sua primeira função</p>
          <p className="bl-ajuda">Você ainda não tem funções na sua biblioteca.</p>
        </div>
      ) : null}
      {functions && functions.length > 0 && filtered.length === 0 ? (
        <p className="bl-ajuda">Nenhuma função encontrada.</p>
      ) : null}
      {filtered.length > 0 ? (
        <ul className="bl-functions-list">
          {filtered.map((fn) => (
            <li key={fn.id}>
              <div className="bl-functions-item">
                <div>
                  <span className="bl-variable-name">{fn.name}</span>
                  {fn.description ? <p className="sub">{fn.description}</p> : null}
                </div>
                <div className="bl-functions-item-actions">
                  <button type="button" className="iconbtn" aria-label={`Editar ${fn.name}`} title="Editar" onClick={() => setEditing(fn)}>
                    <ManagementIcon nome="lapis" tamanho={18} />
                  </button>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={`Excluir ${fn.name}`}
                    title="Excluir"
                    onClick={() => setRemoveTarget(fn)}
                  >
                    <ManagementIcon nome="lixeira" tamanho={18} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="bl-mais" onClick={() => setEditing('new')}>
        Criar função
      </button>

      <ModalConfirmation
        aberto={removeTarget !== null}
        titulo="Excluir função"
        message={`Excluir a função "${removeTarget?.name}"? Ações que a chamam deixam de funcionar.`}
        error={removeError}
        confirmando={removing}
        onConfirmar={async () => {
          if (!removeTarget) return;
          setRemoving(true);
          setRemoveError(null);
          const r = await deleteFlowFunction(removeTarget.id);
          setRemoving(false);
          if (!r.ok) {
            setRemoveError(r.error);
            return;
          }
          setRemoveTarget(null);
          setAviso('Função excluída.');
          void reload();
        }}
        onCancelar={() => {
          setRemoveTarget(null);
          setRemoveError(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- pickers (panel-actions.tsx) */

function FlowFunctionSearch({ onPick }: { onPick: (fn: FlowFunction) => void }) {
  const [functions, setFunctions] = useState<FlowFunction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let ativo = true;
    void listFlowFunctions().then((r) => {
      if (!ativo) return;
      if (r.ok) setFunctions(r.value);
      else setError(r.error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const filtered = functions ? filterFlowFunctions(functions, search) : [];

  return (
    <div className="bl-functions-picker">
      <Campo
        value={search}
        placeholder="Pesquisar função"
        aria-label="Pesquisar função"
        onChange={(e) => setSearch(e.target.value)}
      />
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      {functions && functions.length === 0 ? (
        <p className="bl-ajuda">Você ainda não tem funções na sua biblioteca.</p>
      ) : null}
      {functions && functions.length > 0 && filtered.length === 0 ? (
        <p className="bl-ajuda">Nenhuma função encontrada.</p>
      ) : null}
      {filtered.length > 0 ? (
        <ul className="bl-functions-picker-list">
          {filtered.map((fn) => (
            <li key={fn.id}>
              <button type="button" className="bl-functions-picker-item" onClick={() => onPick(fn)}>
                {fn.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** `ExecuteBlipFunction`'s "Definição da função": pick an existing function or create one inline. */
export function FlowFunctionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (functionId: string) => void;
}) {
  const [selected, setSelected] = useState<FlowFunction | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(!value);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    let ativo = true;
    void listFlowFunctions().then((r) => {
      if (!ativo || !r.ok) return;
      setSelected(r.value.find((fn) => fn.id === value) ?? null);
    });
    return () => {
      ativo = false;
    };
  }, [value]);

  if (creating) {
    return (
      <FlowFunctionForm
        initial={null}
        onCancel={() => setCreating(false)}
        onSaved={(fn) => {
          setCreating(false);
          setOpen(false);
          setSelected(fn);
          onChange(fn.id);
        }}
      />
    );
  }

  return (
    <div className="bl-functions-select">
      {selected ? (
        <div className="bl-functions-selected">
          <span className="bl-variable-name">{selected.name}</span>
          <button type="button" className="bl-botao-contorno" onClick={() => setOpen((v) => !v)}>
            Trocar
          </button>
        </div>
      ) : null}
      {open ? (
        <>
          <FlowFunctionSearch
            onPick={(fn) => {
              onChange(fn.id);
              setSelected(fn);
              setOpen(false);
            }}
          />
          <button type="button" className="bl-adicionar-cabecalho" onClick={() => setCreating(true)}>
            + Criar função
          </button>
        </>
      ) : null}
    </div>
  );
}

/** The script actions' code-field helper: inserts `nome(param1, param2)` at the end of the source. */
export function FlowFunctionInsertPicker({ onInsert }: { onInsert: (snippet: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bl-functions-insert">
      <button type="button" className="bl-botao-contorno" onClick={() => setOpen((v) => !v)}>
        Inserir função da biblioteca
      </button>
      {open ? (
        <FlowFunctionSearch
          onPick={(fn) => {
            onInsert(functionCallSnippet(fn));
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
