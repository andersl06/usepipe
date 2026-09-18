import { Outlet } from 'react-router-dom';
import { BarrasDoContato, useContato } from '../contato';
import { NavegacaoGrowth } from './navegacao';
import './growth.css';

export function CascaDeGrowth() {
  const { contato } = useContato();
  const id = contato.id;
  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Growth" />
      {/* `section.main-section > ui-view`: a lateral e o miolo, lado a lado. */}
      <div className="gr-casca">
        <NavegacaoGrowth id={id} />
        <main className="gr-miolo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
