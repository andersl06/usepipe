import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { Selection } from './selection';

const SIZES_OF_PAGE = [5, 10, 15, 25, 50, 100, 250, 500] as const;

/**
 * Search sits alone below the header as reference `bds-input icon="search"` in a `w-30` column: 30% width, 54px high, 20px search icon (`dom/rules.html`).
 */
function SearchTop({
  search,
  setSearch,
  placeholder,
}: {
  search: string;
  setSearch: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-top">
      <Icone nome="busca" tamanho={20} />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * Footer navigation uses `arrow-first`, `arrow-left`, `arrow-right`, `arrow-last` from `FICHA-rules.md` and `FICHA-queue-management.md` Section 5. Keep these four single-use icons local instead of adding them to `@pipe/ui`.
 */
function PageArrow({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
  const caminhos: Record<typeof tipo, string> = {
    primeira: 'M11 7l-5 5l5 5M17 7l-5 5l5 5',
    anterior: 'M15 6l-6 6l6 6',
    proxima: 'M9 6l6 6l-6 6',
    ultima: 'M7 7l5 5l-5 5M13 7l5 5l-5 5',
  };
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminhos[tipo]} />
    </svg>
  );
}

/**
 * `Resultados por página` footer mirrors the two captured paginated screens (`FICHA-rules.md`, `FICHA-queue-management.md`, Sections 2.5 and 5): size select, `X-Y de Z` count, and four arrows. Paginate the already-filtered complete list in the browser; no server pagination contract is needed.
 */
function PaginationFooter({
  total,
  page,
  tamanho,
  toChangePage,
  aoMudarTamanho,
  ocultarTamanho = false,
}: {
  total: number;
  page: number;
  tamanho: number;
  toChangePage: (p: number) => void;
  aoMudarTamanho: (t: number) => void;
  /**
   * Reference `personalizedbreaks` has no `pagination-and-search-results-select` (`FICHA-atendentes-filas-pausas.md` §b.3/§c), only a count and arrows.
   */
  ocultarTamanho?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / tamanho));
  const inicio = total === 0 ? 0 : (page - 1) * tamanho + 1;
  const fim = Math.min(page * tamanho, total);
  return (
    <div className="footer-pagination">
      {ocultarTamanho ? null : (
        <label className="rp-tamanho">
          Resultados por página
          <Selection value={tamanho} onChange={(e) => aoMudarTamanho(Number(e.target.value))} aria-label="Resultados por página">
            {SIZES_OF_PAGE.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Selection>
        </label>
      )}
      <span className="rp-count">{`${inicio}-${fim} de ${total}`}</span>
      <div className="rp-nav">
        <button type="button" disabled={page <= 1} onClick={() => toChangePage(1)} aria-label="Primeira página">
          <PageArrow tipo="primeira" />
        </button>
        <button type="button" disabled={page <= 1} onClick={() => toChangePage(page - 1)} aria-label="Página anterior">
          <PageArrow tipo="anterior" />
        </button>
        <span className="rp-atual">{page}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => toChangePage(page + 1)} aria-label="Próxima página">
          <PageArrow tipo="proxima" />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => toChangePage(totalPages)}
          aria-label="Última página"
        >
          <PageArrow tipo="ultima" />
        </button>
      </div>
    </div>
  );
}

/**
 * Rules follow card/search layout measured in `referencias-blip/pesquisa/blip-telas-atendimento.md` Sections 4 and 5.3: title, search below, cards with small labels above strong values and state at right. Reference cards allow create/edit/delete and per-row switches. Ours initially showed only a state chip because changing configuration without an audit log of actor, prior value, and time was unsafe. Now `lib/auditoria.ts` provides that log, so `.cl-acoes` can show the supplied `acao` switch; records without it retain their state chip. Search filters both already-loaded lists in the browser.
 */

export interface CardRule {
  id: string;
  /** `titulo` supplies the cursor tooltip; otherwise show the value, especially when truncated. */
  campos: { rotulo: string; value: string; classe?: string; titulo?: string }[];
  situation: string;
  active: boolean;
  /**
   * Reference SLA-rule `bds-chip-tag` for `Padrão` belongs in the card row's unlabeled fourth column (`dom/sla-policy.html`), not the footer.
   */
  selo?: string;

  procura: string;
  /**
   * Use record color as `var(--p-…)`, never a hex literal, in the card's first column. Only queues use it: color there is customer data, not state, so it must not become a colored status chip.
   */
  cor?: string | null;
  /**
   * Put related lists, such as a queue's agents or a schedule's queues, in `.cl-rodape`. The single-value `.cl-campos` grid would truncate a nested list.
   */
  rodape?: readonly string[];
  /**
   * Put the record control at right beside state, matching the reference row-card switch. Supply it from outside because it carries a Server Action; constructing the form in this client component would pull that action into the browser bundle.
   */
  acao?: React.ReactNode;
  /**
   * Slot before fields for the agent card's checkbox and avatar (`FICHA-atendentes-filas-pausas.md` §b.2). `undefined` retains the usual `<span>`, either queue-color stripe or empty space.
   */
  esquerda?: React.ReactNode;
}

export interface RulesSection {
  titulo: string;
  empty: string;
  /**
   * Reference page-empty second line is `Crie respostas para agilizar seus atendimentos` under `Você ainda não criou respostas prontas` (`FICHA-replies.md` §6); without it the empty state is only one sentence.
   */
  emptyDescription?: string;
  cards: CardRule[];
}

/**
 * Reference row-card has 12/400 labels above 16/700 values, an inline badge when needed, and only edit/delete `bds-button-icon` and `bds-switch` actions at right. Do not add an `Ativa` chip beside a switch that already conveys state. Without a switch (SLA, queues, pauses), show state only when disabled, where it conveys data rather than decoration.
 */
function Card({ card }: { card: CardRule }) {
  const colunas = card.campos.length + (card.selo ? 1 : 0);
  return (
    <article className="card-list">
      {card.esquerda ?? (card.cor ? <span className="sw" style={{ background: card.cor }} /> : <span />)}
      <div className="cl-campos" style={{ '--cl-colunas': colunas } as React.CSSProperties}>
        {card.campos.map((c) => (
          <div key={c.rotulo} className="cl-campo">
            <span className="r">{c.rotulo}</span>
            <span className={c.classe ? `v ${c.classe}` : 'v'} title={c.titulo ?? c.value}>
              {c.value}
            </span>
          </div>
        ))}
        {card.selo ? (
          <div className="cl-campo">
            <span className="r" aria-hidden="true">
              &nbsp;
            </span>
            <span className="etiqueta">{card.selo}</span>
          </div>
        ) : null}
      </div>
      <div className="cl-actions">
        {!card.acao && !card.active ? (
          <span className="etiqueta alerta">{card.situation}</span>
        ) : null}
        {card.acao}
      </div>

      {card.rodape && card.rodape.length > 0 ? (
        <div className="cl-rodape">
          {card.rodape.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ListaRegras({
  sections,
  placeholder = 'Buscar regra, fila ou escopo',
  sectionHideHeader = false,
  paginar = false,
  pageInitialSize = 10,
  hideSearch = false,
  filters,
  pageHideSize = false,
}: {
  sections: readonly RulesSection[];
  /** Search text is the only variation because this list also serves screens beyond Rules. */
  placeholder?: string;
  /**
   * Blip does not repeat a section title above a card list after search. Hide it only when requested; multi-section screens such as schedules still need labels to distinguish groups.
   */
  sectionHideHeader?: boolean;
  /**
   * The `Resultados por página` footer appears in captured `rules` and `queue-management` screens, the only two with confirmed pagination. It works only with one section, as both callers have.
   */
  paginar?: boolean;
  pageInitialSize?: number;
  /**
   * Reference `personalizedbreaks` has neither search nor filters (`FICHA-personalizedbreaks.md` §3); its list follows the header directly. Keep search enabled by default for screens that show it.
   */
  hideSearch?: boolean;
  /**
   * Controls sharing the search row represent reference `Filtrar por:` selectors for `Modelos de mensagens` (`FICHA-message-template.md` §3), to the left of search, which occupies 69% of that row.
   */
  filters?: ReactNode;

  pageHideSize?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [tamanho, setTamanho] = useState(pageInitialSize);
  const [page, setPage] = useState(1);

  const filtradas = useMemo(() => {
    const alvo = search.trim().toLowerCase();
    if (!alvo) return sections;
    return sections.map((s) => ({
      ...s,
      cartoes: s.cards.filter((c) => c.procura.includes(alvo)),
    }));
  }, [sections, search]);

  const nenhuma = filtradas.every((s) => s.cards.length === 0);
  const singleSection = filtradas.length === 1 ? filtradas[0] : undefined;
  const podePaginar = paginar && singleSection !== undefined;
  const totalItens = singleSection && podePaginar ? singleSection.cards.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItens / tamanho));
  const pageCurrent = Math.min(page, totalPages);

  // Reset to page 1 when search or page size changes, so filtering to three items from page 4 does not misleadingly show an empty list.
  useEffect(() => {
    setPage(1);
  }, [search, tamanho]);

  const sectionsShown =
    podePaginar && singleSection
      ? [
          {
            ...singleSection,
            cartoes: singleSection.cards.slice(
              (pageCurrent - 1) * tamanho,
              (pageCurrent - 1) * tamanho + tamanho,
            ),
          },
        ]
      : filtradas;

  return (
    <>
      {hideSearch ? null : filters ? (
        <div className="filter-by">
          {filters}
          <SearchTop search={search} setSearch={setSearch} placeholder={placeholder} />
        </div>
      ) : (
        <SearchTop search={search} setSearch={setSearch} placeholder={placeholder} />
      )}

      {nenhuma && search.trim() ? (
        /*
         * For empty search results, use reference `Nenhum resultado encontrado` (`dom/history.html`) and provide a way back; without the button, users would have to erase the query manually.
         */
        <div className="empty">
          <b>Nenhum resultado encontrado</b>
          <p>
            Não encontramos nenhum resultado a partir da pesquisa realizada.
            <br />
            Que tal refazer a sua busca?
          </p>
          <button type="button" className="btn contorno-marca" onClick={() => setSearch('')}>
            Redefinir filtros
          </button>
        </div>
      ) : (
        sectionsShown.map((section) => (
          <div key={section.titulo} className="list-cards">
            {sectionHideHeader ? null : (
              <div className="group-cards">
                {section.titulo} <span className="qt">{section.cards.length}</span>
              </div>
            )}
            {section.cards.length === 0 ? (
              /*
               * Reference page-empty state has a 20/700 title and, when present, a 16/400 description below.
               */
              <div className="empty">
                <b>{section.empty}</b>
                {section.emptyDescription ? <p>{section.emptyDescription}</p> : null}
              </div>
            ) : (
              section.cards.map((c) => <Card key={c.id} card={c} />)
            )}
          </div>
        ))
      )}

      {podePaginar && !nenhuma ? (
        <PaginationFooter
          total={totalItens}
          page={pageCurrent}
          tamanho={tamanho}
          toChangePage={setPage}
          aoMudarTamanho={setTamanho}
          ocultarTamanho={pageHideSize}
        />
      ) : null}
    </>
  );
}
