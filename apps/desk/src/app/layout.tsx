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
  themeColor: '#F2F1EC',
};

/**
 * Tema aplicado antes da primeira pintura.
 *
 * O CLARO É O PADRÃO, e o `data-tema="claro"` no `<html>` abaixo é quem garante
 * isso: sem ele o bloco `@media (prefers-color-scheme: dark)` do `@pipe/ui`
 * assume, e o Desk abre escuro na máquina de quem configurou o sistema em
 * escuro. É a mesma decisão que a Gestão já tomou, e as três referências
 * (Blip, Salesforce, Twenty) são claras.
 *
 * O escuro continua disponível: quem clicar no alternador grava a escolha, e
 * este script a devolve antes de pintar, sem lampejo claro a cada navegação.
 */
const TEMA_ANTES_DE_PINTAR = `
try {
  var t = localStorage.getItem('pipe-tema');
  if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t;
} catch (e) {}
`;

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    // O script acima escreve `data-tema` antes da hidratação, e extensão de navegador
    // costuma escrever atributo aqui também: avisar sobre isso é ruído, não defeito.
    <html lang="pt-BR" data-tema="claro" suppressHydrationWarning>
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
