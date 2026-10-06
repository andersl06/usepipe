import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketNumber, type QueueOfDesk } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { executar } from '../../lib/actions';
import { displayName } from '../../lib/order';
import { AGENT_STATUS_LABELS } from '../../lib/situation';

/**
 * `Ações em Massa` at `/bulk-ticket` follows the reference bulk transfer screen (`~/desk-clone/clone/index.html`, bulk section; `desk2/blip-clone-bulk.png`): 20/400 title, `Chatbot` card and `Transferir` chip, select-all and open-ticket list on the left (or `Nenhum atendimento aberto para transferir.`), queue/agent destination choices on the right, and `Cancelar`/`Transferir` below. `transferirEmMassa` repeats `transferirConversa` per ticket; as in the reference, transferring closes one ticket and opens another.
 */
export function PageBulkActions() {
  const navegar = useNavigate();
  const queue = useRead<QueueOfDesk>('/v1/desk/queue');
  const queues = useRead<{ queues: { id: string; name: string; flowName: string }[] }>('/v1/desk/queues');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [queueId, setQueueId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const conversations = queue.data?.conversations ?? [];
  const todas = conversations.length > 0 && conversations.every((c) => marcadas.has(c.id));

  function alternar(id: string) {
    const novo = new Set(marcadas);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setMarcadas(novo);
  }

  async function transferir() {
    setEnviando(true);
    setError(null);
    setAviso(null);
    const r = (await executar('transferirEmMassa', {
      conversaId: [...marcadas],
      ...(alvo === 'fila' ? { paraFilaId: queueId } : { paraAtendenteId: agentId }),
    })) as { ok: boolean; error?: string; transferidas?: number };
    setEnviando(false);
    if (!r.ok) setError(r.error ?? 'Falha ao transferir.');
    else {
      setAviso(`${r.transferidas ?? 0} ticket(s) transferido(s)${r.error ? ` — ${r.error}` : ''}.`);
      setMarcadas(new Set());
    }
  }

  const podeTransferir =
    marcadas.size > 0 && (alvo === 'fila' ? Boolean(queueId) : Boolean(agentId));

  return (
    <div className="dk-bulk">
      <h2>Ações em Massa</h2>
      <div className="dk-bulk-card">
        <div className="dk-bulk-line">
          <div className="dk-campo-flutuante" style={{ width: 420 }}>
            <span>Chatbot</span>
            <b>
              {/* Ponytail: the reference has one chatbot per account; this screen currently uses the whole account. */}Todos os
              canais
            </b>
          </div>
          <div style={{ flex: 1 }} />
          <span className="dk-chip dk-chip-info">Transferir</span>
        </div>
        <div className="dk-bulk-columns">
          <div className="dk-bulk-column">
            <label className="dk-bulk-check">
              <input
                type="checkbox"
                checked={todas}
                onChange={() =>
                  setMarcadas(todas ? new Set() : new Set(conversations.map((c) => c.id)))
                }
              />{' '}
              Selecionar todos
            </label>
            <div className="dk-bulk-list">
              {conversations.length === 0 ? (
                <div className="dk-bulk-empty">Nenhum atendimento aberto para transferir.</div>
              ) : (
                conversations.map((c) => (
                  <label key={c.id} className="dk-bulk-item">
                    <input
                      type="checkbox"
                      checked={marcadas.has(c.id)}
                      onChange={() => alternar(c.id)}
                    />{' '}
                    {ticketNumber(c.sequentialId)} —{' '}
                    {displayName({ contactName: c.contatoNome, contactPhone: c.contatoTelefone })}{' '}
                    <span className="dk-bulk-empty">({c.filaNome ?? 'Transferência direta'})</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="dk-bulk-column">
            <h4>Transferir para:</h4>
            <div className="dk-bulk-radios">
              <label>
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'fila'}
                  onChange={() => setAlvo('fila')}
                />{' '}
                Fila
              </label>
              <label>
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'atendente'}
                  onChange={() => setAlvo('atendente')}
                />{' '}
                Atendente
              </label>
            </div>
            <label className="dk-campo-flutuante">
              <span>Fila</span>
              <select
                value={queueId}
                onChange={(e) => setQueueId(e.target.value)}
                disabled={alvo !== 'fila'}
              >
                <option value="">Selecionar fila</option>
                {queues.data?.queues.map((f) => (
                  <option key={f.id} value={f.id}>
                    {`${f.name} · ${f.flowName}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="dk-campo-flutuante">
              <span>Atendente</span>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={alvo !== 'atendente'}
              >
                <option value="">Selecionar atendente</option>
                {queue.data?.colegas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {AGENT_STATUS_LABELS[c.estado]}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="dk-error">{error}</p> : null}
            {aviso ? <p>{aviso}</p> : null}
          </div>
        </div>
        <div className="dk-bulk-foot">
          <button
            type="button"
            className="dk-botao dk-botao-secundario dk-botao-curto"
            onClick={() => navegar('/')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dk-botao dk-botao-curto"
            id="bulk-transferir"
            disabled={!podeTransferir || enviando}
            onClick={() => void transferir()}
          >
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
