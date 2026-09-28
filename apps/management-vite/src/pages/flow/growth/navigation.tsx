import Link from '../../../components/link';
import { useLocation } from 'react-router-dom';
import { contactBase, useContact } from '../contact';

/**
 * The Growth sidebar — `<aside class="detail-aside fl"><nav class="sidenav"><sidenav-menu><ol><sidenav-menu-item>` (portal.js, state `auth.application.detail.growth`). Each item is `li.relative > a` with `span.sidebar-title` and `span.sidebar-subtitle`; the active one is `$state.includes(sref)` — it also lights up on the screens inside it.
 *
 * The first four items, in order and with the pt-BR bundle's text (`modules.application.detail.growth.*`):
 *
 *   activeMessages                 "Mensagens ativas"           → mensagens-ativas
 *   clicktracker                   "Click Tracker" / subtitle   → clicktracker
 *   adsbuying  (badge "Beta")      "Anúncios" / subtitle        → anuncios
 *   activeMessages.paymentsReport  "Relatório de Pagamentos" / subtitle → pagamentos
 *
 * The fifth, "Links rastreados", does NOT exist in the origin — item 3 of the Attendance registrations task: a short link with real click counting (`links-rastreados/links-rastreados.tsx`), its own tested backend, unrelated to the "Click Tracker" above (that one measures Meta's Click-to-WhatsApp ad performance). It goes at the end of the list, with no badge, with our own text — there's no Blip copy to reuse here.
 */
const ITENS: { titulo: string; description: string | null; beta?: true; rota: string | null }[] = [
  { titulo: 'Mensagens ativas', description: null, rota: 'active-messages' },
  {
    titulo: 'Click Tracker',
    description: 'Confira os dados das campanhas de Click to WhatsApp',
    rota: 'clicktracker',
  },
  {
    titulo: 'Anúncios',
    description: 'Crie e publique anúncios que se conectam ao seu chatbot',
    beta: true,
    rota: 'ads',
  },
  {
    titulo: 'Relatório de Pagamentos',
    description: 'Visualize e analise os pagamentos realizados',
    rota: 'payments',
  },
  {
    titulo: 'Links rastreados',
    description: 'Crie links curtos e acompanhe os cliques das suas campanhas',
    rota: 'tracked-links',
  },
];

export function NavigationGrowth({ id }: { id: string }) {
  const caminho = useLocation().pathname;
  const { contact } = useContact();
  const base = contactBase(contact.tipo, id);
  return (
    <aside className="gr-lateral">
      <nav className="gr-sidenav" aria-label="Seções do Growth">
        <ol>
          {ITENS.map((item) => {
            const href = item.rota ? `${base}/growth/${item.rota}` : null;
            const ativo = href !== null && caminho.startsWith(href);
            const miolo = (
              <>
                <span className="gr-sidenav-titulo">
                  {item.titulo}
                  {item.beta ? <span className="gr-sidenav-beta">Beta</span> : null}
                  {href ? null : <span className="pt-obra-selo">em breve</span>}
                </span>
                {item.description ? (
                  <span className="gr-sidenav-subtitulo">{item.description}</span>
                ) : null}
              </>
            );
            return (
              <li key={item.titulo} className={ativo ? 'gr-sidenav-ativo' : undefined}>
                {href ? (
                  <Link href={href} aria-current={ativo ? 'page' : undefined}>
                    {miolo}
                  </Link>
                ) : (
                  <span className="pt-links-obra">{miolo}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
