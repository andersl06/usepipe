import { AvisoDeCarregamento } from '../../componentes/esqueleto';
import { FASES } from '../../lib/funil';

/**
 * O esqueleto do quadro: as mesmas colunas, com cartões de altura fixa.
 *
 * As fases são catálogo, não dado do banco, então o esqueleto já sabe quantas
 * colunas desenhar. É a diferença entre a tela aparecer inteira de uma vez e
 * ela nascer com uma coluna e crescer para cinco.
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
        <AvisoDeCarregamento>Carregando o funil.</AvisoDeCarregamento>
        <div className="lanes" aria-hidden="true">
          {FASES.map((fase, i) => (
            <div className="lane" key={fase}>
              <header>
                <span className="barra" style={{ width: '60%' }} />
              </header>
              {/* Menos cartões nas colunas do fim: é a forma de um funil, e um
                  esqueleto retangular anuncia uma tela que não vai aparecer. */}
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
