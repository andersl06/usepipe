import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Botao, Campo, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { AgentRegistered, QueueRegistered } from '../../lib/registrations';
import { applyInSelection } from '../../lib/agents-gravar';
import { editTitle } from '../../lib/agents';
import { Select } from '@pipe/ui/select';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';

/**
 * The source's `/team/create` and `/team/edit` — the TWO dedicated pages `modal.addAgent`/`modal.editAgent` name (`FICHA-atendentes-filas-pausas.md` §a.1/§a.4). No `:id` in the URL: the selection travels in `?atendentes=`, because editing is done IN BULK — the three variants of `editDropdown.title` ("Editar 1 atendente" / "Editar N atendentes") only exist for that.
 *
 * **"Adicionar atendente" has no form here, and that's stated, not hidden.** Pipe has no standalone account creation: whoever joins gets an invite (`/convite/:token`). Inventing a form that saves nothing would be worse than admitting the gap.
 *
 * **The batch fields are the ones Pipe has.** The source asks for "Equipe" and "Fila" as two separate concepts (`team`/`queue` in `i18n.js`); Pipe only has QUEUE — the simultaneous-conversation cap comes from being in it (`aplicarNaSelecao`, `lib/atendentes-gravar.ts`), not from a separate attendant registry. "Equipe"/`teamsPlaceholder` was left out.
 */
export function AgentPageEdit({ modo }: { modo: 'editar' | 'adicionar' }) {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const ids = (params.get('agents') ?? '').split(',').filter(Boolean);

  if (modo === 'adicionar') {
    return (
      <>
        <div className="board-head">
          <h2>Adicionar atendente</h2>
        </div>
        <div className="empty">
          <b>Ainda não dá para criar conta por aqui</b>
          <p>
            No Pipe, quem entra na equipe recebe um convite — não há cadastro solto de conta nesta tela. Para
            colocar alguém já cadastrado numa fila, volte e use o ícone <b>Editar</b> na lista.
          </p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/team`)}>
            Voltar para Gestão de atendentes
          </button>
        </div>
      </>
    );
  }

  return <EditInBatch ids={ids} base={base} />;
}

function EditInBatch({ ids, base }: { ids: readonly string[]; base: string }) {
  const navegar = useNavigate();
  const readAgents = useRead<AgentRegistered[]>('/v1/management/agents/management');
  const readQueues = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');

  const [queueId, setQueueId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!readAgents.data || !readQueues.data) return null;
  const selecionados = readAgents.data.filter((a) => ids.includes(a.id));

  if (selecionados.length === 0) {
    return (
      <div className="empty">
        <b>Nenhum atendente selecionado</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/team`)}>
            Voltar para Gestão de atendentes
          </button>
        </p>
      </div>
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!queueId) return;
    setEnviando(true);
    setError(null);
    const resultado = await applyInSelection(ids, queueId, capacity.trim() ? Number(capacity) : null);
    setEnviando(false);
    if (resultado.ok) navegar(`${base}/team`);
    else setError(resultado.error);
  }

  return (
    <>
      <div className="board-head">
        <h2>{editTitle(selecionados.length)}</h2>
      </div>

      <p className="sub">
        Para editar o(s) atendente(s) selecionado(s), preencha pelo menos um dos campos abaixo.
      </p>

      <div className="lista-selecionados">
        {selecionados.map((a) => (
          <span key={a.id} className="selecionado-chip">
            <Avatar nome={a.name} /> {a.name}
          </span>
        ))}
      </div>

      <form className="form-registration" onSubmit={(e) => void salvar(e)}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Fila</span>
            <Select value={queueId} onChange={(e) => setQueueId(e.target.value)} aria-label="Fila" required>
              <option value="">Escolha uma fila</option>
              {readQueues.data.queues.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="form-campo" style={{ flexBasis: '220px' }}>
            <span className="sub">Nº de tickets simultâneos</span>
            <Campo
              type="number"
              min={1}
              max={200}
              placeholder="Padrão da fila"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={enviando}
            />
          </label>
        </div>

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

        <div className="cl-actions">
          <Botao type="button" onClick={() => navegar(`${base}/team`)} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={enviando || !queueId}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </>
  );
}
