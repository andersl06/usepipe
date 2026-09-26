import { LoadingNotice, EsqueletoDeTabela } from '../../components/esqueleto';

/**
 * What shows while the list loads. The page header is the same as the finished
 * screen's, on purpose: the title doesn't flash, and only the table swaps.
 *
 * Nine columns because nine is what the ungrouped list shows — the skeleton has
 * to have the width of the table that's coming, otherwise the screen jumps.
 */
export default function CarregandoLeads() {
  return (
    <>
      <div className="p-cabecalho">
        <h2>Leads</h2>
        <span className="sub">
          Dias na fase na listagem — o lead que trava é o que custa dinheiro.
        </span>
      </div>

      <div className="tblwrap">
        <LoadingNotice>Carregando a lista de leads.</LoadingNotice>
        <EsqueletoDeTabela colunas={9} linhas={10} />
      </div>
    </>
  );
}
