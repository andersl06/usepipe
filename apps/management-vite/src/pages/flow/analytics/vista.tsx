import Link from '../../../components/link';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Aba } from './abas';

/**
 * `#analytics-tabs-view`: the `bds-tabs` and the open tab's panel. It's client-side for just one reason — knowing which tab is open. In the origin it's `tabData[aba].active`, which `initilizeTabs()` derives from `$state.current.url`; here it's the path. The layout can't see the path, which is why this piece exists.
 */
export function AnalyticsVista({
  base,
  abas,
  children,
}: {
  base: string;
  abas: Aba[];
  children: ReactNode;
}) {
  const caminho = useLocation().pathname;
  const aberta = abas.find(
    (a) =>
      a.segment &&
      (caminho === `${base}/${a.segment}` || caminho.startsWith(`${base}/${a.segment}/`)),
  );

  return (
    <div id="analytics-tabs-view" className="an-vista">
      {/*
 * `bds-tabs` renders: a ← button in a 40px container, the header with the tabs, a → button in another 40px container. Both buttons only appear when the tabs don't fit (`handleHeaderResize`); the containers always stay.
 */}
      <nav className="an-abas" aria-label="Abas da análise">
        <div className="an-abas-seta" />
        <div className="an-abas-cabeca">
          {abas.map((aba) =>
            aba.segment ? (
              <Link
                key={aba.key}
                hidden={!aba.visivel}
                href={`${base}/${aba.segment}`}
                className={aba === aberta ? 'an-aba an-aba--ativa' : 'an-aba'}
                aria-current={aba === aberta ? 'page' : undefined}
              >
                <span className="an-aba-texto">{aba.rotulo}</span>
              </Link>
            ) : (
              <span key={aba.key} hidden={!aba.visivel} className="an-aba an-aba--obra">
                <span className="an-aba-texto">{aba.rotulo}</span>
                <span className="pt-obra-selo">em breve</span>
              </span>
            ),
          )}
        </div>
        <div className="an-abas-seta" />
      </nav>

      {/*
 * `.tabs-content bds-tab-panel:not(#dashboardContent) { padding: 50px 0 0 }` — the Dashboard is the only panel without the padding that clears the fixed row.
 */}
      <div
        className={aberta?.key === 'dashboard' ? 'an-painel an-painel--dashboard' : 'an-painel'}
      >
        {children}
      </div>
    </div>
  );
}
