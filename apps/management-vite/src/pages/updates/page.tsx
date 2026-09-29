import { useEffect, useState } from 'react';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { SearchIcon, IconePortal } from '@pipe/ui/icones-portal';
import { Selection } from '../../components/selection';
import { portalUseShell } from '../../lib/shell';
import { filterStorageKey, loadFilters, saveFilters } from '../../lib/filter-memory';
import { tenantPath } from '../../lib/application-paths';
import { useEu } from '../../context/session';
import { CATEGORIAS, UPDATES, type Update } from './conteudo';
import './updates.css';

interface UpdatesFilter {
  q: string;
  categoria: string;
}

/** Visible category (Portuguese) → CSS hook in updates.css (`[data-category=...]`). */
const CATEGORY_KEY: Record<string, string> = { Atendimento: 'attendance', 'Automação': 'automation', Portal: 'portal' };
const FILTRO_VAZIO: UpdatesFilter = { q: '', categoria: '' };

function validateUpdatesFilter(value: unknown): UpdatesFilter | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.q !== 'string' || typeof v.categoria !== 'string') return null;
  return { q: v.q, categoria: v.categoria };
}

/**
 * Novidades — the source's "Novidades na Blip" in the portal, with the Barboo blog's design.
 *
 * TWO RULERS, on purpose. The LOCATION is theirs: the portal card opens a screen hung on the dark bar, and that's all the `ui-view` shows. The DESIGN is Barboo blog's, chosen by the owner — eyebrow, big title, subtitle, the search and pill filter, one big featured card and the grid below.
 *
 * What the source does and we DON'T: they embed the blog in a 100%×100% `<iframe>`. Here the list is ours, served from the app itself — an outside site's frame doesn't have our typography, doesn't respond to our theme, and can refuse to be framed at any time.
 *
 * Search and filter are `<form method="get">`: the list comes from the server, and the URL stays shareable. No client state on this screen.
 */
export function PageUpdates() {
  const shell = portalUseShell();
  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'updates', eu.tenant.id, eu.user.id);
  const [filtros, setFiltros] = useState<UpdatesFilter>(
    () => loadFilters(filtrosKey, validateUpdatesFilter) ?? FILTRO_VAZIO,
  );
  useEffect(() => {
    saveFilters(filtrosKey, filtros);
  }, [filtrosKey, filtros]);

  const search = filtros.q.trim();
  const categoria = filtros.categoria.trim();

  const achados = UPDATES.filter((n) => {
    const combinaCategoria = !categoria || categoria === CATEGORIAS[0] || n.categoria === categoria;
    const combineSearch =
      !search || `${n.titulo} ${n.resumo}`.toLowerCase().includes(search.toLowerCase());
    return combinaCategoria && combineSearch;
  });

  /*
   * The big card only exists in the full list: filtered, highlighting the first result would give weight to a search coincidence.
   */
  const filtrando = Boolean(search || (categoria && categoria !== CATEGORIAS[0]));
  const destaque = filtrando ? null : (achados.find((n) => n.destaque) ?? achados[0] ?? null);
  const rest = destaque ? achados.filter((n) => n !== destaque) : achados;

  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />

      <main className="nv-conteudo">
        <div className="nv-column">
          <p className="nv-sobretitulo">Novidades</p>
          <h1 className="nv-titulo">O que mudou no Pipe</h1>
          <p className="nv-subtitulo">
            O que chegou, o que mudou de lugar e o que ainda está a caminho — na ordem em que foi ao
            ar.
          </p>

          <form
            className="nv-filters"
            method="get"
            action={tenantPath('product-updates')}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setFiltros({
                q: String(data.get('q') ?? ''),
                categoria: String(data.get('categoria') ?? ''),
              });
            }}
          >
            <div className="nv-campo">
              <SearchIcon tamanho={20} />
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Buscar por tema…"
                aria-label="Buscar novidades"
              />
            </div>
            <div className="nv-campo nv-campo-lista">
              <Selection
                name="categoria"
                defaultValue={categoria || CATEGORIAS[0]}
                aria-label="Categoria"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selection>
              <IconePortal nome="baixo" tamanho={20} />
            </div>
            <button type="submit" className="btn">
              Filtrar
            </button>
          </form>

          {achados.length === 0 ? (
            <p className="nv-nada">Nenhuma novidade encontrada com esse filtro.</p>
          ) : null}

          {destaque ? (
            <Card
              update={destaque}
              grande
              aoFiltrarCategoria={(c) => setFiltros({ q: '', categoria: c })}
            />
          ) : null}

          {rest.length > 0 ? (
            <div className="nv-grade">
              {rest.map((n) => (
                <Card
                  key={n.id}
                  update={n}
                  aoFiltrarCategoria={(c) => setFiltros({ q: '', categoria: c })}
                />
              ))}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/**
 * Their blog's card: the cover strip with the category tag on top, and the white body with title, summary, the date line and "Ler artigo →".
 *
 * The cover is a COLOR STRIP, not a photo: we don't have an image bank, and a generic stock photo on top of a version announcement misrepresents the content. The color comes from the category, so the grid stays readable from a distance.
 */
function Card({
  update,
  grande,
  aoFiltrarCategoria,
}: {
  update: Update;
  grande?: boolean;
  aoFiltrarCategoria: (categoria: string) => void;
}) {
  return (
    <article className={grande ? 'nv-card nv-card-large' : 'nv-card'}>
      <div className="nv-capa" data-category={CATEGORY_KEY[update.categoria] ?? undefined}>
        <span className="nv-capa-etq">{update.categoria}</span>
      </div>

      <div className="nv-corpo">
        {grande ? <span className="nv-destaque">Destaque</span> : null}
        <h2 className="nv-card-title">{update.titulo}</h2>
        <p className="nv-resumo">{update.resumo}</p>
        <p className="nv-meta">
          <time dateTime={update.data}>{byLongForm(update.data)}</time>
          {' · '}
          {update.read} min de leitura
        </p>
        {/* Cada novidade ainda não tem página própria; o botão filtra a
            própria lista pelo tema, que é o mais perto de útil sem inventar
            rota — o filtro vive em state (D-30), não numa URL para navegar. */}
        <button
          type="button"
          className="nv-ler"
          onClick={() => aoFiltrarCategoria(update.categoria)}
        >
          Ler mais <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}

/** "20 de julho de 2026" — the format the blog uses, in uppercase via CSS. */
function byLongForm(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return `${dia} de ${meses[(mes ?? 1) - 1]} de ${ano}`;
}
