import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Trilho } from './trilho';

/**
 * A casca do Desk: o trilho à esquerda e a tela à direita, em altura fixa com
 * rolagem interna (`#app` > `.navbar` + `#container` da referência).
 *
 * `data-painel` e `data-estado` são as classes `drawer-hidden` e
 * `state--chat`/`state--drawer` do `#container` de lá: governam as faixas
 * abaixo de 1600 e de 950 no CSS.
 */
export function Casca() {
  const [statusAberto, setStatusAberto] = useState(false);
  return (
    <div className="dk-app" data-status={statusAberto ? 'aberto' : 'fechado'}>
      <Trilho aberto={statusAberto} aoAbrir={setStatusAberto} />
      <div className="dk-container">
        <Outlet />
      </div>
    </div>
  );
}
