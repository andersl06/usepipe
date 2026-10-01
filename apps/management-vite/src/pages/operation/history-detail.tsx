import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useRead } from '../../lib/query';
import { ManagementIcon } from '../../components/icones-management';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface Previa {
  id: string;
  ticket: string;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  itens: { id: string; type: 'mensagem' | 'nota'; direction?: string; texto: string; autor?: string | null }[];
}

/**
 * Ticket detail opened from the History list in a new tab (`FICHA-history.md`, capture
 * `historico-detalhe-do-ticket`): back arrow, contact name, the ticket summary and the
 * "Histórico de Conversa" panel. The conversation comes from the same read the Monitoring side
 * panel uses; the contact data block of the capture has no source in the API yet.
 */
export function PageHistoryDetail() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const read = useRead<Previa>(`/v1/management/monitoring/conversations/${encodeURIComponent(id)}`);
  const ticket = read.data?.ticket ?? search.get('ticketId') ?? '';

  return (
    <div className="hist-detalhe">
      <div className="board-head">
        <Link to={`${base}/history`} className="btn fantasma" aria-label="Voltar ao histórico">
          <ManagementIcon nome="esquerda" tamanho={24} />
        </Link>
        <h2>{read.data?.contactName ?? 'Detalhe do ticket'}</h2>
      </div>

      {read.isError ? (
        <div className="card hist-erro" role="alert">
          <h3>Não foi possível carregar o ticket</h3>
          <p>Verifique a conexão e tente novamente.</p>
          <button type="button" className="btn" onClick={() => void read.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="hist-detalhe-corpo">
          <dl className="card hist-detalhe-resumo" aria-label="Ticket">
            <dt>Ticket</dt>
            <dd>{ticket || '—'}</dd>
            <dt>Atendente</dt>
            <dd>{read.data?.agentName ?? '—'}</dd>
            <dt>Fila</dt>
            <dd>{read.data?.queueName ?? '—'}</dd>
          </dl>
          <section className="card hist-detalhe-conversa" aria-label="Histórico de Conversa">
            <h3>Histórico de Conversa</h3>
            <div className="mon-preview-history" aria-live="polite">
              {read.isLoading ? <p>Carregando conversa…</p> : null}
              {read.data?.itens.map((item) =>
                item.type === 'nota' ? (
                  <p key={item.id} className="mon-previa-nota">
                    <b>{item.autor ?? 'Nota interna'}</b>
                    {item.texto}
                  </p>
                ) : (
                  <div key={item.id} className={item.direction === 'entrada' ? 'mon-balao inbound' : 'mon-balao saida'}>
                    <p>{item.texto || 'Conteúdo sem texto'}</p>
                    <small>{item.autor ?? ''}</small>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
