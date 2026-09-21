import Link from '../../../componentes/link';
import { useLocation } from 'react-router-dom';
import { baseDoContato, useContato } from '../contato';

/**
 * A lateral do Growth — `<aside class="detail-aside fl"><nav class="sidenav">
 * <sidenav-menu><ol><sidenav-menu-item>` (portal.js, estado
 * `auth.application.detail.growth`). Cada item é `li.relative > a` com
 * `span.sidebar-title` e `span.sidebar-subtitle`; o ativo é
 * `$state.includes(sref)` — acende também nas telas de dentro.
 *
 * Os quatro primeiros itens, na ordem e com o texto do pacote pt-BR
 * (`modules.application.detail.growth.*`):
 *
 *   activeMessages                 "Mensagens ativas"           → mensagens-ativas
 *   clicktracker                   "Click Tracker" / subtitle   → clicktracker
 *   adsbuying  (badge "Beta")      "Anúncios" / subtitle        → anuncios
 *   activeMessages.paymentsReport  "Relatório de Pagamentos" / subtitle → pagamentos
 *
 * O quinto, "Links rastreados", NÃO existe na origem — item 3 da tarefa de
 * cadastros do Atendimento: link curto com contagem de clique de verdade
 * (`links-rastreados/links-rastreados.tsx`), backend próprio e testado, sem
 * relação com o "Click Tracker" acima (aquele é a medição de anúncios
 * Click-to-WhatsApp da Meta). Entra no fim da lista, sem badge, com texto
 * nosso — não há frase da Blip para copiar aqui.
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
    rota: 'anuncios',
  },
  {
    titulo: 'Relatório de Pagamentos',
    descricao: 'Visualize e analise os pagamentos realizados',
    rota: 'pagamentos',
  },
  {
    titulo: 'Links rastreados',
    descricao: 'Crie links curtos e acompanhe os cliques das suas campanhas',
    rota: 'links-rastreados',
  },
];

export function NavegacaoGrowth({ id }: { id: string }) {
  const caminho = useLocation().pathname;
  const { contato } = useContato();
  const base = baseDoContato(contato.tipo, id);
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
