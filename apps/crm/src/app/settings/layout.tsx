import { KEY_THEME } from '../../lib/settings-comum';
import './settings.css';

/**
 * The settings area's wrapper.
 *
 * It does two things, and neither is navigation: the sidebar already comes from
 * `AreaConfiguracoes`, assembled in `componentes/estrutura-crm.tsx`.
 *
 * 1. Loads the area's stylesheet, which is local and only exists here.
 * 2. Writes the saved theme onto `<html>` **before** the page paints. Without this,
 *    anyone who picked dark mode would see a white flash on every load — the theme's
 *    CSS depends on the attribute, and the attribute would only exist after React
 *    hydrates. It's the same trick every theme switcher uses, and it's the only
 *    reason there's an inline `<script>` in the project.
 *
 * The `try` isn't decoration: `localStorage` throws in a private window with cookies
 * blocked, and an error here would take down the whole page before the first pixel.
 */
const APLICAR_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(KEY_THEME)});if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`;

export default function LayoutSettings({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: APLICAR_TEMA }} />
      <div className="cfg">{children}</div>
    </>
  );
}
