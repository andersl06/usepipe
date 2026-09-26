/**
 * Loading skeleton.
 *
 * Twenty draws the row before it has the data — the table is already there, at
 * the right height, and the content drops in on top. It's better than a spinner
 * in the middle of the screen for a measurable reason: the page doesn't jump in
 * height when the data arrives, and whoever is reading the header doesn't lose
 * their place.
 *
 * Each bar's width varies on purpose. A bar that's all the same size reads like
 * a grid, not like text, and the eye starts expecting an empty table instead of
 * a loading one.
 */

/**
 * Widths in percentage, cyclical. Nothing random: server and client need to
 * draw the exact same thing, or hydration complains.
 */
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

/** The skeleton for a block of record fields — short label, long value. */
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
 * The loading notice for screen reader users. The skeleton is `aria-hidden` — a
 * table of empty bars read aloud is noise — so someone needs to say the screen
 * is working.
 */
export function LoadingNotice({ children }: { children: React.ReactNode }) {
  return (
    <span role="status" aria-live="polite" className="sr">
      {children}
    </span>
  );
}
