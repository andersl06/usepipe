import Link from '../../../componentes/link';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Aba } from './abas';

/**
 * `#analytics-tabs-view`: a `bds-tabs` e o painel da aba aberta.
 *
 * É cliente só por um motivo — saber qual aba está aberta. Na origem é o
 * `tabData[aba].active` que `initilizeTabs()` tira de `$state.current.url`;
 * aqui é o caminho. O layout não enxerga o caminho, por isso a peça é esta.
 */
export function VistaDaAnalise({
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
      a.segmento &&
      (caminho === `${base}/${a.segmento}` || caminho.startsWith(`${base}/${a.segmento}/`)),
  );

  return (
    <div id="analytics-tabs-view" className="an-vista">
      {/* `bds-tabs` renderiza: botão ← num contêiner de 40px, o cabeçalho com as
          abas, botão → noutro de 40px. Os dois botões só aparecem quando as
          abas não cabem (`handleHeaderResize`); os contêineres ficam sempre. */}
      <nav className="an-abas" aria-label="Abas da análise">
        <div className="an-abas-seta" />
        <div className="an-abas-cabeca">
          {abas.map((aba) =>
            aba.segmento ? (
              <Link
                key={aba.chave}
                hidden={!aba.visivel}
                href={`${base}/${aba.segmento}`}
                className={aba === aberta ? 'an-aba an-aba--ativa' : 'an-aba'}
                aria-current={aba === aberta ? 'page' : undefined}
              >
                <span className="an-aba-texto">{aba.rotulo}</span>
              </Link>
            ) : (
              <span key={aba.chave} hidden={!aba.visivel} className="an-aba an-aba--obra">
                <span className="an-aba-texto">{aba.rotulo}</span>
                <span className="pt-obra-selo">em breve</span>
              </span>
            ),
          )}
        </div>
        <div className="an-abas-seta" />
      </nav>

      {/* `.tabs-content bds-tab-panel:not(#dashboardContent) { padding: 50px 0 0 }` —
          o Dashboard é o único painel sem o recuo que desvia da fileira fixa. */}
      <div
        className={aberta?.chave === 'dashboard' ? 'an-painel an-painel--dashboard' : 'an-painel'}
      >
        {children}
      </div>
    </div>
  );
}
