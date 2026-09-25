import { Outlet } from 'react-router-dom';
import { ContactBarras } from '../contato';
import './contatos.css';

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
