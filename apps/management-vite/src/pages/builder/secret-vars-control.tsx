import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { FlowSecret } from '@pipe/contracts';
import { Campo } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { SECRET_VALUE_MASK, secretDraftError } from './secret-variables';
import {
  createFlowSecret,
  deleteFlowSecret,
  listFlowSecrets,
  updateFlowSecret,
} from './secret-variables-gravar';

/**
 * "Variáveis sensíveis" rows (P11). Unlike "Variáveis de configuração" these do not ride on the
 * flow draft: each row saves straight to the encrypted store, and a saved value never comes back
 * (the value field shows a mask and starts empty when edited). The typed value lives only in this
 * component's state until "Salvar" sends it.
 */
export function SecretVarsControl({ flowId }: { flowId: string }) {
  const [saved, setSaved] = useState<FlowSecret[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [novas, setNovas] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    void listFlowSecrets(flowId).then((r) => {
      if (!vivo) return;
      if (r.ok) setSaved(r.value);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [flowId]);

  if (saved === null) {
    return error ? <p className="sub bl-campo--erro-texto">{error}</p> : <p className="sub">Carregando…</p>;
  }

  const sorted = [...saved].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="bl-config-vars">
      {sorted.map((secret) => (
        <SecretRow
          key={secret.id}
          flowId={flowId}
          secret={secret}
          onSaved={(novo) => setSaved((atual) => (atual ?? []).map((s) => (s.id === novo.id ? novo : s)))}
          onRemoved={() => setSaved((atual) => (atual ?? []).filter((s) => s.id !== secret.id))}
        />
      ))}
      {novas.map((key) => (
        <SecretRow
          key={key}
          flowId={flowId}
          secret={null}
          onSaved={(novo) => {
            setSaved((atual) => [...(atual ?? []), novo]);
            setNovas((atual) => atual.filter((k) => k !== key));
          }}
          onRemoved={() => setNovas((atual) => atual.filter((k) => k !== key))}
        />
      ))}
      <button
        type="button"
        className="bl-config-adicionar"
        onClick={() => setNovas((atual) => [...atual, `nova-${Date.now()}-${atual.length}`])}
      >
        + Adicionar informações extras
      </button>
    </div>
  );
}

function SecretRow({
  flowId,
  secret,
  onSaved,
  onRemoved,
}: {
  flowId: string;
  /** Null for a row not saved yet. */
  secret: FlowSecret | null;
  onSaved: (secret: FlowSecret) => void;
  onRemoved: () => void;
}) {
  const [name, setName] = useState(secret?.name ?? '');
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(secret === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar(): Promise<void> {
    const problem = secretDraftError({ name, value }, secret?.name ?? null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const input = { name: name.trim(), value };
    const r = secret ? await updateFlowSecret(flowId, secret.id, input) : await createFlowSecret(flowId, input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    // Drop the typed value as soon as it is stored.
    setValue('');
    setError(null);
    setEditing(false);
    onSaved(r.value);
  }

  async function remover(): Promise<void> {
    if (!secret) {
      onRemoved();
      return;
    }
    setBusy(true);
    const r = await deleteFlowSecret(flowId, secret.id);
    setBusy(false);
    if (r.ok) onRemoved();
    else setError(r.error);
  }

  return (
    <div>
      <div className="bl-config-var-linha">
        <Campo
          value={name}
          placeholder="Variável"
          aria-label="Nome da variável sensível"
          disabled={busy}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setName(e.target.value);
            setEditing(true);
          }}
        />
        {editing ? (
          <Campo
            type="password"
            autoComplete="new-password"
            value={value}
            placeholder="Valor"
            aria-label="Valor da variável sensível"
            disabled={busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          />
        ) : (
          <Campo
            value={SECRET_VALUE_MASK}
            readOnly
            aria-label="Valor suprimido"
            title="Valor suprimido. Clique para inserir um novo valor."
            onFocus={() => setEditing(true)}
          />
        )}
        {editing ? (
          <button type="button" className="iconbtn" disabled={busy} onClick={() => void salvar()}>
            Salvar
          </button>
        ) : null}
        <button
          type="button"
          className="iconbtn"
          title="Remover"
          aria-label={secret ? `Remover ${secret.name}` : 'Remover linha'}
          disabled={busy}
          onClick={() => void remover()}
        >
          <IconePortal nome="lixeira" tamanho={16} />
        </button>
      </div>
      {error ? <p className="sub bl-campo--erro-texto" role="alert">{error}</p> : null}
    </div>
  );
}
