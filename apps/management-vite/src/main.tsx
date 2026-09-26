import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { clienteDeConsultas } from './lib/cliente-de-consultas';
import { App } from './App';
import { SessionProvider } from './context/session';
// Import tokens and design-system base before the app stylesheet so local rules override the base.
import '@pipe/ui/estilos.css';
import './estilos/global.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={clienteDeConsultas}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
