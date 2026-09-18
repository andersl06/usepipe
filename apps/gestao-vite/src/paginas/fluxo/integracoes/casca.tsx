import { Outlet } from 'react-router-dom';
import { CascaDoModulo } from '../contato';
import './cabecalho-de-pagina.css';
import './integracoes.css';

export function CascaDeIntegracoes() {
  return (
    <CascaDoModulo ativo="Integrações">
      <Outlet />
    </CascaDoModulo>
  );
}
