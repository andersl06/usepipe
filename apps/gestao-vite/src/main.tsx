import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { clienteDeConsultas } from './lib/cliente-de-consultas';
import { App } from './App';
import { ProvedorDeSessao } from './contexto/sessao';
// A ordem importa: o token e a base do design system entram antes da folha do
// aplicativo, para que a folha local sobrescreva a base e nunca o contrário.
import '@pipe/ui/estilos.css';
import './estilos/globais.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={clienteDeConsultas}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
