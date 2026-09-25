import { Outlet } from 'react-router-dom';
import { ModuloShell } from '../contato';
import './cabecalho-de-pagina.css';
import './integracoes.css';

export function IntegrationsShell() {
  return (
    <ModuloShell ativo="Integrações">
      <Outlet />
    </ModuloShell>
  );
}
