import { useNavigate } from 'react-router-dom';
import { Botao, Icone } from '@pipe/ui';
import { IconePortal } from '../../componentes/icones-portal';
import { baseDoAtendimento } from '../operacao/casca';

/**
 * Atalho do Builder ao cadastro real de filas. A listagem, criação, edição,
 * ativação e exclusão já existem em PaginaFilas e nas rotas de gestão; manter
 * o formulário aqui duplicaria regras de cadastro e validação.
 */
export function PainelDeFilas({
  tipoDoContato,
  contatoId,
  onFechar,
}: {
  tipoDoContato: string;
  contatoId: string;
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
          onClick={() => navegar(`${baseDoAtendimento(tipoDoContato, contatoId)}/atendentes/filas`)}
        >
          Abrir gerenciamento de filas
        </Botao>
      </div>
    </aside>
  );
}
