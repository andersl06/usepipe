import { useNavigate } from 'react-router-dom';
import { Botao, Icone } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import { attendanceBase } from '../operation/shell';

/**
 * A Builder shortcut to the real queue registry. Listing, creation, editing, activation, and deletion already exist in PaginaFilas and the management routes; keeping the form here would duplicate registration and validation rules.
 */
export function QueuesPanel({
  contactTipo,
  contactId,
  onFechar,
}: {
  contactTipo: string;
  contactId: string;
  onFechar: () => void;
}) {
  const navegar = useNavigate();
  return (
    <aside className="bl-painel" aria-label="Gerenciamento de Filas">
      <div className="bl-painel-cabecalho">
        <span className="bl-painel-titulo">Gerenciamento de Filas</span>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-painel-fio" />
      <div className="bl-painel-corpo bl-filas-corpo">
        <Icone nome="fila" tamanho={32} />
        <p>Gerencie filas, atendentes atribuídos e regras de atendimento.</p>
        <Botao
          type="button"
          variante="primario"
          onClick={() => navegar(`${attendanceBase(contactTipo, contactId)}/atendentes/filas`)}
        >
          Abrir gerenciamento de filas
        </Botao>
      </div>
    </aside>
  );
}
