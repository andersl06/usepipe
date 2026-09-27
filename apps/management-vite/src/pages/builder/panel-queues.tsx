import { useNavigate } from 'react-router-dom';
import { Botao, Icone } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import { useRead } from '../../lib/query';
import type { QueueRegistered } from '../../lib/registrations';
import { attendanceBase } from '../operation/shell';

/**
 * A Builder shortcut to the real queue registry (D-15: the reference has no confirmed embedded
 * queue CRUD in the captured bundles, so this stays a shortcut rather than duplicating the
 * registry's rules). Listing, creation, editing, activation, and deletion already exist in
 * PaginaFilas and the management routes; keeping the form here would duplicate registration and
 * validation rules. The one addition over a plain shortcut is a read-only summary of how many
 * queues exist and how many are active, from the same list PaginaFilas already reads.
 */
export function QueuesPanel({
  contactType,
  contactId,
  onFechar,
}: {
  contactType: string;
  contactId: string;
  onFechar: () => void;
}) {
  const navegar = useNavigate();
  const read = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  const queues = read.data?.queues ?? [];
  const active = queues.filter((q) => q.ativa).length;
  return (
    <aside className="bl-panel" aria-label="Gerenciamento de Filas">
      <div className="bl-panel-header">
        <span className="bl-panel-title">Gerenciamento de Filas</span>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-panel-wire" />
      <div className="bl-panel-body bl-queues-body">
        <Icone nome="fila" tamanho={32} />
        <p>Gerencie filas, atendentes atribuídos e regras de atendimento.</p>
        {read.data ? (
          <p className="bl-queues-summary">
            {queues.length} {queues.length === 1 ? 'fila cadastrada' : 'filas cadastradas'}
            {queues.length > 0 ? `, ${active} ${active === 1 ? 'ativa' : 'ativas'}` : ''}.
          </p>
        ) : null}
        <Botao
          type="button"
          variante="primario"
          onClick={() => navegar(`${attendanceBase(contactType, contactId)}/atendentes/filas`)}
        >
          Abrir gerenciamento de filas
        </Botao>
      </div>
    </aside>
  );
}
