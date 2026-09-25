import { Outlet } from 'react-router-dom';
import { ModuloShell } from '../contact';
import './header-of-page.css';
import './integrations.css';

export function IntegrationsShell() {
  return (
    <ModuloShell ativo="Integrações">
      <Outlet />
    </ModuloShell>
  );
}
