/**
 * Esqueleto de carregamento.
 *
 * O Twenty desenha a linha antes de ter o dado — a tabela já está lá, com a
 * altura certa, e o conteúdo entra por cima. É melhor que um giro no meio da
 * tela por um motivo medível: a página não pula de altura quando o dado chega,
 * e quem está lendo o cabeçalho não perde o lugar.
 *
 * A largura de cada barra varia de propósito. Barra toda do mesmo tamanho lê
 * como grade, não como texto, e o olho passa a esperar uma tabela vazia em vez
 * de uma tabela carregando.
 */

/** Larguras em porcentagem, cíclicas. Nada de aleatório: servidor e cliente
 *  precisam desenhar a mesma coisa, senão a hidratação reclama. */
const LARGURAS = [72, 46, 58, 38, 64, 50, 80, 42];

export function EsqueletoDeTabela({
  colunas,
  linhas = 8,
}: {
  colunas: number;
  linhas?: number;
}) {
  return (
    <div className="scroll" aria-hidden="true">
      <table className="esqueleto">
        <tbody>
          {Array.from({ length: linhas }, (_, l) => (
            <tr key={l}>
              {Array.from({ length: colunas }, (_, c) => (
                <td key={c}>
                  <span
                    className="barra"
                    style={{ width: `${LARGURAS[(l * colunas + c) % LARGURAS.length]}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** O esqueleto de um bloco de campos da ficha — rótulo curto, valor longo. */
export function EsqueletoDeCampos({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="campos" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i}>
          <span className="k">
            <span className="barra" style={{ width: '70%' }} />
          </span>
          <span className="v">
            <span className="barra" style={{ width: `${LARGURAS[i % LARGURAS.length]}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * O aviso de carregamento para quem usa leitor de tela. O esqueleto é
 * `aria-hidden` — uma tabela de barras vazias lida em voz alta é ruído — então
 * alguém precisa dizer que a tela está trabalhando.
 */
export function AvisoDeCarregamento({ children }: { children: React.ReactNode }) {
  return (
    <span role="status" aria-live="polite" className="sr">
      {children}
    </span>
  );
}
