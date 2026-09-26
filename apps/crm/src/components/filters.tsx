import Link from 'next/link';
import { Icone } from '@pipe/ui';
import {
  FILTRAVEIS,
  filterLabel,
  WITHOUT_VALUE,
  type FilterKey,
  type SFilter,
} from '../lib/leads-visao';

/**
 * The listing's per-column filter.
 *
 * The shape is Twenty's (`object-filter-dropdown`): a button that opens the list
 * of FIELDS, and the chosen field opens the list of VALUES. Two steps, not one
 * form with four selects — because you almost always filter by a single column,
 * and a form would demand attention from the other three every time.
 *
 * The chosen filter becomes a **chip**, next to the button, and the chip is the
 * remove button. That's theirs too, and it's what makes an active filter
 * visible from a distance: a filtered list with no on-screen signal is where
 * "the lead disappeared from the CRM" comes from.
 *
 * **No JavaScript at all.** A native `<details>` opens the menu, and each value
 * is a link to the same listing with one more parameter. The consequence is the
 * one that matters: the filter is in the URL, so **the saved view keeps it for
 * free** — saving a view is still just naming a query that already exists.
 *
 * What we didn't copy: their operators (contains, starts with, is empty, is one
 * of). Here it's equality, plus "blank". Free text is already the search on
 * this side, and an operator menu for four categorical columns would be three
 * clicks to answer what one click already answers.
 */
export function Filter({
  filters,
  options,
  href,
}: {
  filters: SFilter;
  options: Record<FilterKey, string[]>;
  /** This same listing's address with a different set of filters. */
  href: (proximos: SFilter) => string;
}) {
  const ativos = FILTRAVEIS.filter((f) => filters[f.key] !== undefined);

  return (
    <div className="filters">
      <details className="menu-filter">
        <summary className="btn">
          <Icone nome="filtro" tamanho={16} />
          Filtrar
        </summary>
        <div className="menu-panel">
          {FILTRAVEIS.map((f) => {
            // "Em branco" entra sempre, mesmo que nenhuma linha esteja em
            // blank right now: it's the question "who's left without an owner?", and it can't
            // depend on there already being an unowned one for it to be doable.
            const values = [...options[f.key], WITHOUT_VALUE];
            return (
              <details key={f.key}>
                <summary>
                  {f.rotulo}
                  <span className="qt">{options[f.key].length}</span>
                </summary>
                <ul>
                  {values.map((v) => (
                    <li key={v}>
                      <Link
                        href={href({ ...filters, [f.key]: v })}
                        aria-current={filters[f.key] === v ? 'true' : undefined}
                      >
                        {v === WITHOUT_VALUE ? 'em branco' : v}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </details>

      {ativos.map((f) => {
        const value = filters[f.key] ?? '';
        const semEste = { ...filters };
        delete semEste[f.key];
        return (
          <Link
            key={f.key}
            className="filter-chip"
            href={href(semEste)}
            title={`Tirar o filtro ${filterLabel(f.key, value)}`}
          >
            {filterLabel(f.key, value)}
            <span aria-hidden="true">×</span>
          </Link>
        );
      })}
    </div>
  );
}
