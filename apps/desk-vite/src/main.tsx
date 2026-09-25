import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { clienteDeConsultas } from './lib/cliente-de-consultas';
import { App } from './App';
import { SessionProvider } from './context/session';
// A ordem importa: o token e a base do design system entram antes da folha do
// aplicativo, para que a folha local sobrescreva a base e nunca o contrário.
import '@pipe/ui/estilos.css';
import './estilos/global.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <QueryClientProvider client={clienteDeConsultas}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
