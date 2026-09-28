import { Outlet } from 'react-router-dom';
import { ShellModule } from '../contact';
import { NavigationSettings } from './navigation';
import './settings.css';

/**
 * The shell of `auth.application.detail.configurations` (portal.js, mod. 57475):
 *
 *   <aside class="detail-aside fl">  ← the sidebar, filled by the Settings template (bds-nav-tree-group)
 *   <section id="main-content-area" class="main-detail-content …">
 *     <div class="blip-ui-content …"> <page-header/> <div class="container"/>
 *
 * The two sit SIDE BY SIDE at full width below the contact bar (`#main-section.pa0` is `display:flex`). The shared `CascaDoModulo` already centers the content in `fx-coluna` (80%); `.cf-casca` undoes that inset to open the sidebar at the edge, without touching the shell.
 */
export function SettingsShell() {
  return (
    <ShellModule ativo="Configurações">
      <div className="cf-shell">
        <NavigationSettings />
        <section className="cf-miolo">
          <div className="cf-conteudo">
            <Outlet />
          </div>
        </section>
      </div>
    </ShellModule>
  );
}
