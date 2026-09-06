import { AvisoDeCarregamento, EsqueletoDeCampos } from '../../../componentes/esqueleto';

/**
 * O esqueleto da ficha, na mesma grade de duas colunas da tela pronta: a lateral
 * estreita com os campos, a principal com o painel do score. Sem isso a ficha
 * abre em uma coluna e reorganiza sozinha meio segundo depois.
 */
export default function CarregandoFicha() {
  return (
    <>
      <AvisoDeCarregamento>Carregando a ficha do lead.</AvisoDeCarregamento>
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
