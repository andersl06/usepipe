import { LoadingNotice, EsqueletoDeCampos } from '../../../components/esqueleto';

/**
 * The record's skeleton, in the same two-column grid as the finished screen: the
 * narrow sidebar with the fields, the main area with the score panel. Without this
 * the record opens in a single column and reorganizes itself half a second later.
 */
export default function CarregandoFicha() {
  return (
    <>
      <LoadingNotice>Carregando a ficha do lead.</LoadingNotice>
      <div className="ficha">
        <div className="coluna">
          <div className="tblwrap">
            <header>
              <b>Dados</b>
            </header>
            <EsqueletoDeCampos linhas={9} />
          </div>
        </div>
        <div className="coluna">
          <div className="tblwrap">
            <header>
              <b>Score</b>
            </header>
            <EsqueletoDeCampos linhas={6} />
          </div>
        </div>
      </div>
    </>
  );
}
