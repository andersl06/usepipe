import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { Pagination } from '@pipe/ui/pagination';

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
        <Pagination
          layout="lista"
          state={{ page: pageCurrent, byPage: tamanho, total: totalItens, setPage, setByPage: setTamanho }}
          ocultarTamanho={pageHideSize}
        />
      ) : null}
    </>
  );
}
