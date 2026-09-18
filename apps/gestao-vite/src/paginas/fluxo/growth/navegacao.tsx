import Link from '../../../componentes/link';
import { useLocation } from 'react-router-dom';

/**
 * A lateral do Growth — `<aside class="detail-aside fl"><nav class="sidenav">
 * <sidenav-menu><ol><sidenav-menu-item>` (portal.js, estado
 * `auth.application.detail.growth`). Cada item é `li.relative > a` com
 * `span.sidebar-title` e `span.sidebar-subtitle`; o ativo é
 * `$state.includes(sref)` — acende também nas telas de dentro.
 *
 * Os quatro itens, na ordem e com o texto do pacote pt-BR
 * (`modules.application.detail.growth.*`):
 *
 *   activeMessages                 "Mensagens ativas"           → mensagens-ativas
 *   clicktracker                   "Click Tracker" / subtitle   → clicktracker
 *   adsbuying  (badge "Beta")      "Anúncios" / subtitle
 *   activeMessages.paymentsReport  "Relatório de Pagamentos" / subtitle
 *
 * ponytail: Anúncios e Relatório de Pagamentos ainda não têm tela aqui; ficam
 * apagados com o selo, como o combinado em `itens.ts`.
 */
const ITENS: { titulo: string; descricao: string | null; beta?: true; rota: string | null }[] = [
  { titulo: 'Mensagens ativas', descricao: null, rota: 'mensagens-ativas' },
  {
    titulo: 'Click Tracker',
    descricao: 'Confira os dados das campanhas de Click to WhatsApp',
    rota: 'clicktracker',
  },
  {
    titulo: 'Anúncios',
    descricao: 'Crie e publique anúncios que se conectam ao seu chatbot',
    beta: true,
    rota: null,
  },
  {
    titulo: 'Relatório de Pagamentos',
    descricao: 'Visualize e analise os pagamentos realizados',
    rota: null,
  },
];

export function NavegacaoGrowth({ id }: { id: string }) {
  const caminho = useLocation().pathname;
  return (
    <aside className="gr-lateral">
      <nav className="gr-sidenav" aria-label="Seções do Growth">
        <ol>
          {ITENS.map((item) => {
            const href = item.rota ? `/fluxo/${id}/growth/${item.rota}` : null;
            const ativo = href !== null && caminho.startsWith(href);
            const miolo = (
              <>
                <span className="gr-sidenav-titulo">
                  {item.titulo}
                  {item.beta ? <span className="gr-sidenav-beta">Beta</span> : null}
                  {href ? null : <span className="pt-obra-selo">em breve</span>}
                </span>
                {item.descricao ? (
                  <span className="gr-sidenav-subtitulo">{item.descricao}</span>
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
