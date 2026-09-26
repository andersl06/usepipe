/**
 * Table implemented here because Twenty's table lives in `twenty-front`, which is AGPL and unavailable to us; neither Chatwoot nor `twenty-ui` exposes one.
 *
 * Density follows Salesforce measurements: 34px rows, 8px vertical and 12px horizontal cell padding, 13px body text, and uppercase column headings in the body font rather than monospace.
 *
 * The `.scroll` wrapper is functional: a wide table must scroll within its own card or it pushes the entire page sideways.
 */

import type { ReactNode } from 'react';

export type Column<L> = {
  key: string;
  rotulo: string;
  /** Right-align and use tabular monospace, for numbers rather than text. */
  numerica?: boolean;
  celula: (linha: L) => ReactNode;
};

export function Tabela<L>({
  colunas,
  linhas,
  linhaKey,
  classeDaLinha,
  empty = 'Nada para mostrar aqui.',
  larguraMinima,
}: {
  colunas: readonly Column<L>[];
  linhas: readonly L[];
  linhaKey: (linha: L) => string;
  /** Severity applies to the entire row (`grave`, `critico`), not only its text. */
  classeDaLinha?: (linha: L) => string | undefined;
  empty?: ReactNode;
  larguraMinima?: number;
}) {
  if (linhas.length === 0) {
    return <div className="empty">{empty}</div>;
  }

  return (
    <div className="scroll">
      <table style={larguraMinima ? { minWidth: `${larguraMinima}px` } : undefined}>
        <thead>
          <tr>
            {colunas.map((column) => (
              <th key={column.key}>{column.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linhaKey(linha)} className={classeDaLinha?.(linha)}>
              {colunas.map((column) => (
                <td key={column.key} className={column.numerica ? 'num' : undefined}>
                  {column.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
