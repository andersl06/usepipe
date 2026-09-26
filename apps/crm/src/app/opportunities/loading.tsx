import { LoadingNotice } from '../../components/esqueleto';
import { FASES } from '../../lib/funil';

/**
 * The board's skeleton: the same columns, with fixed-height cards.
 *
 * Stages are a catalog, not database data, so the skeleton already knows how
 * many columns to draw. That's the difference between the screen appearing whole
 * at once and being born with one column and growing to five.
 */
export default function CarregandoQuadro() {
  return (
    <>
      <div className="p-cabecalho">
        <h2>Oportunidades</h2>
        <span className="sub">
          Arraste o cartão entre as colunas. A probabilidade acompanha a fase, e é ela que dá o
          valor ponderado.
        </span>
      </div>

      <div className="tblwrap">
        <LoadingNotice>Carregando o funil.</LoadingNotice>
        <div className="lanes" aria-hidden="true">
          {FASES.map((fase, i) => (
            <div className="lane" key={fase}>
              <header>
                <span className="barra" style={{ width: '60%' }} />
              </header>
              {/*
 * Fewer cards in the end columns: that's the shape of a funnel, and a
 * rectangular skeleton advertises a screen that isn't coming.
 */}
              {Array.from({ length: Math.max(1, 4 - i) }, (_, c) => (
                <div className="opp esqueleto-cartao" key={c}>
                  <span className="barra" style={{ width: '78%' }} />
                  <span className="barra" style={{ width: '42%' }} />
                  <span className="barra" style={{ width: '60%' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
