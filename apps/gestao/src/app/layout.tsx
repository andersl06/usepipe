import type { Metadata, Viewport } from 'next';
import { EstruturaGestao } from '../componentes/estrutura-gestao';
import { carregarCabecalho } from '../lib/cabecalho';
// A ordem importa: o token e a base do design system entram antes da folha do
// aplicativo, para que a folha local sobrescreva a base e nunca o contrário.
import '@pipe/ui/estilos.css';
import './globais.css';

export const metadata: Metadata = {
  title: 'Pipe Gestão',
  description: 'Monitoramento, histórico e esforço do atendimento',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F2F1EC',
};

/**
 * O produto tem UM tema: o claro.
 *
 * O escuro existia atrás de um alternador e saiu a pedido do dono — cada
 * superfície nova precisaria ser conferida nos dois antes de ir ao ar, e a
 * ferramenta fica aberta o dia inteiro em escritório iluminado (as três
 * referências — Blip, Salesforce, Twenty — são claras).
 *
 * O `data-tema="claro"` no `<html>` abaixo é o que desliga o bloco
 * `@media (prefers-color-scheme: dark)` dos token do `@pipe/ui`: sem ele, quem
 * tem o sistema no escuro abre o aplicativo escuro.
 */

export default async function LayoutRaiz({ children }: { children: React.ReactNode }) {
  // As duas barras do topo mostram tenant, canal e aviso reais: três consultas
  // curtas, nenhuma sobre a tabela de eventos.
  const cabecalho = await carregarCabecalho();
  return (
    // O script acima reescreve `data-tema` antes da hidratação, e extensão de
    // navegador costuma escrever atributo aqui também: avisar sobre isso é
    // ruído, não defeito.
    <html lang="pt-BR" data-tema="claro" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* A escala de PESO é a da Blip, medida em
            `docs/pesquisa/blip-medidas-monitoramento.md` §5: 300 no módulo do
            topo, 400 no corpo, 600 no rótulo e no item de lateral, 700 no
            ativo e no título de bloco. O desenho da letra é o nosso IBM Plex. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;450;500;600;700&display=swap"
        />
      </head>
      <body>
        <EstruturaGestao dados={cabecalho}>{children}</EstruturaGestao>
      </body>
    </html>
  );
}
