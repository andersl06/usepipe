import { Outlet } from 'react-router-dom';
import { BarrasDoContato } from '../contato';
import './contatos.css';

export function CascaDeContatos() {
  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Contatos" />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
