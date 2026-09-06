import { AvisoDeCarregamento, EsqueletoDeTabela } from '../../componentes/esqueleto';

/**
 * O que aparece enquanto a lista carrega. O cabeçalho da página é o mesmo da
 * tela pronta, de propósito: o título não pisca, e só a tabela troca.
 *
 * Nove colunas porque nove é o que a lista sem agrupamento mostra — o
 * esqueleto tem de ter a largura da tabela que vem, senão a tela salta.
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
        <AvisoDeCarregamento>Carregando a lista de leads.</AvisoDeCarregamento>
        <EsqueletoDeTabela colunas={9} linhas={10} />
      </div>
    </>
  );
}
