import type { Metadata } from 'next';
import { StructureCrm } from '../components/structure-crm';
import { euAtual } from '../lib/database';
import { KEY_TEMA } from '../lib/settings-comum';
// Order matters: the design system's tokens and base sheet load before the app's
// stylesheet, so the local sheet overrides the base and never the other way around.
import '@pipe/ui/estilos.css';
import './global.css';

export const metadata: Metadata = {
  title: 'Pipe CRM',
  description: 'Leads, score explicado, formulários e funil de oportunidades',
};

/**
 * Writes the saved theme onto `<html>` **before** the page paints.
 *
 * Without this, anyone who picked dark mode sees a white flash on every load: the
 * theme's CSS depends on the attribute, and the attribute would only exist after
 * React hydrates. It's the only reason there's an inline `<script>` in the project.
 *
 * It lives in the ROOT layout, not the settings one: the theme belongs to the whole
 * app, and limiting it to one area would make the screen flash everywhere else.
 *
 * The `try` isn't decoration — `localStorage` throws in a private window with
 * cookies blocked, and an error here would take down the page before the first
 * pixel.
 */
const APLICAR_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(KEY_TEMA)});if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`;

export default async function LayoutRaiz({ children }: { children: React.ReactNode }) {
  /*
   * `euAtual`, not `exigirEu`: this layout also wraps `/entrar` and `/convite`, which
   * are public. Requiring a session here would send whoever doesn't have one to
   * `/entrar` from `/entrar`'s own layout, in a loop.
   */
  const eu = await euAtual();
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
        <StructureCrm
          user={
            eu ? { nome: eu.user.nome, email: eu.user.email, tenant: eu.tenant.nome } : null
          }
        >
          {children}
        </StructureCrm>
      </body>
    </html>
  );
}
