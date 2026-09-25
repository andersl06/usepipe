import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { DeskSelectionProvider } from '../context/desk-selection';
import { Rail } from './rail';

/**
 * A casca do Desk: o trilho à esquerda e a tela à direita, em altura fixa com
 * rolagem interna (`#app` > `.navbar` + `#container` da referência).
 *
 * `data-painel` e `data-estado` são as classes `drawer-hidden` e
 * `state--chat`/`state--drawer` do `#container` de lá: governam as faixas
 * abaixo de 1600 e de 950 no CSS.
 *
 * `DeskSelectionProvider` mora aqui, não no `App`: rail e páginas
 * compartilham a mesma seleção (conversa/contato), e as rotas públicas
 * (login, convite) nunca precisam dela (D-27/D-29).
 */
export function Shell() {
  const [statusAberto, setStatusAberto] = useState(false);
  return (
    <DeskSelectionProvider>
      <div className="dk-app" data-status={statusAberto ? 'aberto' : 'fechado'}>
        <Rail aberto={statusAberto} aoAbrir={setStatusAberto} />
        <div className="dk-container">
          <Outlet />
        </div>
      </div>
    </DeskSelectionProvider>
  );
}
