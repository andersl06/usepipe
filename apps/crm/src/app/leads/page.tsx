import Link from 'next/link';
import { Campo, Seletor } from '@pipe/ui';
import { Filter } from '../../components/filters';
import { ListaDeLeads } from '../../components/lista-de-leads';
import { ViewsSalvas } from '../../components/views-salvas';
import { fusoDoTenant } from '../../lib/database';
import {
  ABAS,
  abaValida,
  GROUPINGS,
  groupingValid,
  agrupar,
  carregarListaDeLeads,
  directionValid,
  escreverFilters,
  readFilters,
  LIMITE_LISTA,
  listarProprietarios,
  filterOptions,
  orderValid,
  type SFilter,
} from '../../lib/leads';
import { numero } from '../../lib/format';

export const dynamic = 'force-dynamic';

interface Search {
  aba?: string;
  q?: string;
  groupBy?: string;
  order?: string;
  dir?: string;
  /** Os `f.*` do filtro por coluna. `lerFiltros` decide quais valem. */
  [key: string]: string | string[] | undefined;
}

/**
 * The leads listing.
 *
 * The screen is server-rendered: the slice, search, and sort all live in the URL
 * and become `where` and `order by`. Only what the browser needs (column width,
 * selection, saved view) goes down to the client, in a separate component.
 *
 * Sorting does NOT happen over rows already fetched. The list caps at 200, and
 * sorting after fetching would answer "the 200 newest leads, arranged by score"
 * when the question is "the 200 highest-scoring leads".
 */
export default async function PageLeads({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const aba = abaValida(typeof params.aba === 'string' ? params.aba : undefined);
  const search = typeof params.q === 'string' ? params.q : '';
  const by = groupingValid(typeof params.groupBy === 'string' ? params.groupBy : undefined);
  const order = orderValid(typeof params.order === 'string' ? params.order : undefined);
  const direction = directionValid(typeof params.dir === 'string' ? params.dir : undefined);
  const filters = readFilters(params);

  const fuso = await fusoDoTenant();
  const { linhas, contagens } = await carregarListaDeLeads(aba, search, order, direction, filters);
  const proprietarios = await listarProprietarios();
  const options = await filterOptions();
  const groups = agrupar(linhas, by);

  const query = (extra: Record<string, string> = {}, withFilters: SFilter = filters) => {
    const p = new URLSearchParams({ aba, ...(search ? { q: search } : {}), ...extra });
    if (by !== 'nenhum' && !('groupBy' in extra)) p.set('groupBy', by);
    if (order !== 'nenhuma') {
      p.set('order', order);
      p.set('dir', direction);
    }
    // The filter comes in last, and that's why the saved view keeps it: `consulta()`
    // with no argument is exactly the screen's address as it stands right now.
    return escreverFilters(p, withFilters).toString();
  };

  return (
    <>
      <div className="p-cabecalho">
        <h2>Leads</h2>
        <span className="sub">
          Dias na fase na listagem. O lead que trava é o que custa dinheiro.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tabs" role="tablist">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={`/leads?${query({ aba: a.chave })}`}
              role="tab"
              aria-current={a.chave === aba ? 'true' : undefined}
            >
              {a.rotulo} <span className="qt">{numero(contagens[a.chave])}</span>
            </Link>
          ))}
        </div>

        {/*
 * Grouping instead of reports: "by owner" and "source and campaign" used to be
 * menu items, and they're the same list folded by one column.
 */}
        <form className="tblhead" method="get" action="/leads">
          <input type="hidden" name="aba" value={aba} />
          {order !== 'nenhuma' ? (
            <>
              <input type="hidden" name="order" value={order} />
              <input type="hidden" name="dir" value={direction} />
            </>
          ) : null}
          {/*
 * The filter survives submitting the search. Without these fields, typing in the
 * search box would silently erase the filter — and the GET form only sends what
 * it itself carries.
 */}
          {Object.entries(filters).map(([key, value]) => (
            <input key={key} type="hidden" name={`f.${key}`} value={value} />
          ))}
          <Campo
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar lead"
          />
          <label className="agrupador">
            Agrupar por
            <Seletor name="groupBy" defaultValue={by} aria-label="Agrupar por">
              {GROUPINGS.map((a) => (
                <option key={a.chave} value={a.chave}>
                  {a.rotulo}
                </option>
              ))}
            </Seletor>
          </label>
          <button type="submit" className="btn">
            Aplicar
          </button>
          <Filter
            filters={filters}
            options={options}
            href={(proximos) => `/leads?${query({}, proximos)}`}
          />
          <ViewsSalvas queryCurrent={query()} />
          {/*
 * A shortcut nobody discovers is a shortcut nobody uses: the hint stays written
 * next to the count, on the same line, without taking up screen space.
 */}
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} leads
            {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''} ·{' '}
            <kbd>/</kbd> busca, <kbd>j</kbd>/<kbd>k</kbd> anda, <kbd>Enter</kbd> abre
          </span>
        </form>

        <ListaDeLeads
          groups={groups}
          fuso={fuso}
          agora={new Date()}
          aba={aba}
          search={search}
          by={by}
          order={order}
          direction={direction}
          filters={filters}
          proprietarios={proprietarios}
          total={linhas.length}
        />
      </div>
    </>
  );
}
