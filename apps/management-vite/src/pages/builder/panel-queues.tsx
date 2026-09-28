import { useNavigate } from 'react-router-dom';
import { Botao, Icone } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { QueueRegistered } from '../../lib/registrations';
import type { Contact } from '../flow/barra-of-contact';
import { attendanceBase } from '../operation/shell';
import { FloatingSidebar } from './floating-sidebar';

/**
 * A Builder shortcut to the real queue registry (D-15: the reference has no confirmed embedded
 * queue CRUD in the captured bundles, so this stays a shortcut rather than duplicating the
 * registry's rules). Listing, creation, editing, activation, and deletion already exist in
 * PaginaFilas and the management routes; keeping the form here would duplicate registration and
 * validation rules. The one addition over a plain shortcut is a read-only summary of how many
 * queues exist and how many are active, from the same list PaginaFilas already reads.
 */
export function QueuesPanel({
  contact,
  onFechar,
}: {
  contact: Pick<Contact, 'shortName'>;
  onFechar: () => void;
}) {
  const navegar = useNavigate();
  const read = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  const queues = read.data?.queues ?? [];
  const active = queues.filter((q) => q.ativa).length;
  return (
    <FloatingSidebar
      lado="direita"
      titulo="Gerenciamento de filas"
      ariaLabel="Gerenciamento de filas"
      onFechar={onFechar}
    >
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
          onClick={() => navegar(`${attendanceBase(contact)}/queue-management`)}
        >
          Abrir gerenciamento de filas
        </Botao>
      </div>
    </FloatingSidebar>
  );
}
