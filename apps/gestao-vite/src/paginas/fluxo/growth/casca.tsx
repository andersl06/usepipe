import { Outlet } from 'react-router-dom';
import { ContactBarras, useContact } from '../contato';
import { NavigationGrowth } from './navegacao';
import './growth.css';

export function GrowthShell() {
  const { contact } = useContact();
  const id = contact.id;
  return (
    <div className="pt-app">
      <ContactBarras ativo="Growth" />
      {/* `section.main-section > ui-view`: a lateral e o miolo, lado a lado. */}
      <div className="gr-casca">
        <NavigationGrowth id={id} />
        <main className="gr-miolo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
