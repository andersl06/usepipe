import { Outlet } from 'react-router-dom';
import { ContactBars } from '../contact';
import { NavigationGrowth } from './navigation';
import './growth.css';

export function GrowthShell() {
  return (
    <div className="pt-app">
      <ContactBars ativo="Growth" />
      {/* `section.main-section > ui-view`: the sidebar and the body, side by side. */}
      <div className="gr-shell">
        <NavigationGrowth />
        <main className="gr-miolo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
