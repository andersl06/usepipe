import { Outlet } from 'react-router-dom';
import { ContactBarras, useContact } from '../contact';
import { NavigationGrowth } from './navigation';
import './growth.css';

export function GrowthShell() {
  const { contact } = useContact();
  const id = contact.id;
  return (
    <div className="pt-app">
      <ContactBarras ativo="Growth" />
      {/* `section.main-section > ui-view`: the sidebar and the body, side by side. */}
      <div className="gr-shell">
        <NavigationGrowth id={id} />
        <main className="gr-miolo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
