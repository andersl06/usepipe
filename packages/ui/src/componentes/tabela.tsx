/**
 * Tabela. Desenhada aqui porque não dá para copiar: a do Twenty vive em
 * `twenty-front`, que é AGPL e está fora do nosso alcance, e nem Chatwoot nem
 * `twenty-ui` expõem uma.
 *
 * A densidade é a medida no Salesforce: linha de 34px, célula com 8px de
 * padding vertical e 12px horizontal, corpo de 13px, cabeçalho de coluna em
 * caixa alta na família do corpo (não monoespaçada).
 *
 * O invólucro `.scroll` não é decoração: tabela larga precisa rolar dentro do
 * próprio cartão, senão empurra a página inteira para o lado.
 */

import type { ReactNode } from 'react';

export type Coluna<L> = {
  chave: string;
  rotulo: string;
  /** Alinha à direita e usa monoespaçada tabular. Para número, não para texto. */
  numerica?: boolean;
  celula: (linha: L) => ReactNode;
};

export function Tabela<L>({
  colunas,
  linhas,
  chaveDaLinha,
  classeDaLinha,
  vazio = 'Nada para mostrar aqui.',
  larguraMinima,
}: {
  colunas: readonly Coluna<L>[];
  linhas: readonly L[];
  chaveDaLinha: (linha: L) => string;
  /** Severidade vai na linha inteira (`grave`, `critico`), não só no texto. */
  classeDaLinha?: (linha: L) => string | undefined;
  vazio?: ReactNode;
  larguraMinima?: number;
}) {
  if (linhas.length === 0) {
    return <div className="vazio">{vazio}</div>;
  }

  return (
    <div className="scroll">
      <table style={larguraMinima ? { minWidth: `${larguraMinima}px` } : undefined}>
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna.chave}>{coluna.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={chaveDaLinha(linha)} className={classeDaLinha?.(linha)}>
              {colunas.map((coluna) => (
                <td key={coluna.chave} className={coluna.numerica ? 'num' : undefined}>
                  {coluna.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
