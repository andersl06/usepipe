import type { Metadata } from 'next';
import { EstruturaCrm } from '../componentes/estrutura-crm';
import { CHAVE_TEMA } from '../lib/configuracoes-comum';
// A ordem importa: o token e a base do design system entram antes da folha do
// aplicativo, para que a folha local sobrescreva a base e nunca o contrário.
import '@pipe/ui/estilos.css';
import './globais.css';

export const metadata: Metadata = {
  title: 'Pipe CRM',
  description: 'Leads, score explicado, formulários e funil de oportunidades',
};

/**
 * Escreve o tema salvo no `<html>` **antes** de a página pintar.
 *
 * Sem isto, quem escolheu escuro vê um lampejo branco a cada carregamento: o
 * CSS do tema depende do atributo, e o atributo só existiria depois de o React
 * hidratar. É a única razão de haver um `<script>` inline no projeto.
 *
 * Fica no layout RAIZ, e não no de configurações: o tema é do aplicativo
 * inteiro, e limitá-lo a uma área faria a tela piscar em todas as outras.
 *
 * O `try` não é decoração — `localStorage` lança em janela anônima com cookies
 * bloqueados, e um erro aqui derrubaria a página antes do primeiro pixel.
 */
const APLICAR_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`;

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: APLICAR_TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap"
        />
      </head>
      <body>
        <EstruturaCrm>{children}</EstruturaCrm>
      </body>
    </html>
  );
}
