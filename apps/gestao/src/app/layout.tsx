import type { Metadata } from 'next';
import { MenuLateral } from '../componentes/menu-lateral';
import './globais.css';

export const metadata: Metadata = {
  title: 'Pipe Gestão',
  description: 'Monitoramento, relatórios e regras do atendimento',
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
        <div className="app">
          <MenuLateral />
          <main className="board">{children}</main>
        </div>
      </body>
    </html>
  );
}
