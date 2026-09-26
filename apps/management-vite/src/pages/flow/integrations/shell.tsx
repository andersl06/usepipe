import { Outlet } from 'react-router-dom';
import { ShellModule } from '../contact';
import './header-of-page.css';
import './integrations.css';

export function IntegrationsShell() {
  return (
    <ShellModule ativo="Integrações">
      <Outlet />
    </ShellModule>
  );
}
