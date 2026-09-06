import type { Metadata } from 'next';
import { EstruturaGestao } from '../componentes/estrutura-gestao';
// A ordem importa: o token e a base do design system entram antes da folha do
// aplicativo, para que a folha local sobrescreva a base e nunca o contrário.
import '@pipe/ui/estilos.css';
import './globais.css';

export const metadata: Metadata = {
  title: 'Pipe Gestão',
  description: 'Monitoramento, histórico e esforço do atendimento',
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap"
        />
      </head>
      <body>
        <EstruturaGestao>{children}</EstruturaGestao>
      </body>
    </html>
  );
}
