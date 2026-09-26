import { Outlet } from 'react-router-dom';
import { ContactBars } from '../contact';
import './contacts.css';

export function ContactsShell() {
  return (
    <div className="pt-app">
      <ContactBars ativo="Contatos" />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
