/**
 * Seletor de modo da coluna, ao lado do título — "Lista" e "Quadro", como no
 * cabeçalho deles (`docs/pesquisa/blip-desk-dom.md`, §1).
 *
 * O modo Quadro não existe no Pipe e não foi construído aqui. Ele fica no
 * seletor, desabilitado, em vez de sumir: o seletor com uma opção só some do
 * cabeçalho, e aí ninguém sabe que a lista tem um segundo modo — a spec pede o
 * quadro no dia 1 (`docs/specs/2026-09-05-desk-requisitos.md`, §12), e este é o
 * lugar onde ele vai encaixar.
 *
 * `<select>` nativo, e não um menu próprio: é um controle de duas linhas, o
 * navegador já sabe abrir, fechar, navegar por teclado e desenhar no celular.
 */
export function SeletorDeModo() {
  return (
    <select
      className="seletor modo"
      aria-label="Modo de exibição"
      defaultValue="lista"
      title="O modo Quadro ainda não existe no Pipe"
    >
      <option value="lista">Lista</option>
      <option value="quadro" disabled>
        Quadro (em breve)
      </option>
    </select>
  );
}
