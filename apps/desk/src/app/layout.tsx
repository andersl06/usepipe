import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// A ordem importa: a base compartilhada primeiro, o app depois. Quem sobrescreve
// é sempre o aplicativo, nunca o contrário.
import '@pipe/ui/estilos.css';
import './globais.css';

export const metadata: Metadata = {
  title: 'Pipe Desk',
  description: 'A tela do atendente do Pipe: conduzir a conversa, e nada além disso.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F1EC' },
    { media: '(prefers-color-scheme: dark)', color: '#12140E' },
  ],
};

/**
 * Aplica o tema escolhido antes da primeira pintura. Sem isto o atendente que escolheu
 * escuro vê um lampejo claro a cada navegação — e é o tipo de detalhe que faz a
 * ferramenta parecer improvisada.
 */
const TEMA_ANTES_DE_PINTAR = `
try {
  var t = localStorage.getItem('pipe-tema');
  if (t) document.documentElement.dataset.tema = t;
} catch (e) {}
`;

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    // O script acima escreve `data-tema` antes da hidratação, e extensão de navegador
    // costuma escrever atributo aqui também: avisar sobre isso é ruído, não defeito.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES_DE_PINTAR }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
