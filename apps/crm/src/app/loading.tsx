import { AvisoDeCarregamento, EsqueletoDeTabela } from '../componentes/esqueleto';

/**
 * O carregamento padrão do CRM. Vale para toda rota que não declara um seu —
 * painel, contas, contatos, oportunidades e configurações.
 *
 * Sem título: o título de cada tela é diferente, e escrever um errado aqui é
 * pior do que não escrever nenhum. As rotas em que a forma da tela importa de
 * verdade (a lista de leads e a ficha) têm o seu próprio.
 */
export default function Carregando() {
  return (
    <div className="tblwrap">
      <AvisoDeCarregamento>Carregando.</AvisoDeCarregamento>
      <EsqueletoDeTabela colunas={6} linhas={8} />
    </div>
  );
}
