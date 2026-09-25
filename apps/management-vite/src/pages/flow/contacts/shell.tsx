import { Outlet } from 'react-router-dom';
import { ContactBarras } from '../contact';
import './contacts.css';

export function ContactsShell() {
  return (
    <div className="pt-app">
      <ContactBarras ativo="Contatos" />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
