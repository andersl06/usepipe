import { useCallback, useEffect, useRef, useState } from 'react';
import { Illustration } from '@pipe/ui';
import { BY_PAGE, type FlowOfPortal, type GradeDoPortal } from '@pipe/contracts';
import { BarraDoPortal } from '../components/barra-do-portal';
import { Selection } from '../components/selection';
import { SearchIcon, IconePortal, type NomeDeIconePortal } from '../components/icones-portal';
import Link from '../components/link';
import { portalUseShell, type PortalShell } from '../lib/shell';
import { useRead } from '../lib/query';
import { APPLICATION, createPath, flowPath, tenantPath } from '../lib/application-paths';

export const dynamic = 'force-dynamic';

/*
 * The two destinations outside the product that the source's help menu offers (`Blip Help` and `Blip Community`). Empty = item not drawn: a link to a site that doesn't exist yet is worse than a menu with two items.
 */
const URL_AJUDA = (import.meta.env['VITE_PIPE_AJUDA_URL'] as string | undefined) ?? '';

type Flow = FlowOfPortal;

/** What the screen shows: the shell (session) plus the grid (`GET /v1/gestao/fluxos`). */
type PortalData = PortalShell & GradeDoPortal;

/**
 * Portal — the platform's front door, and the only screen in the product that changes shape depending on what the account has inside.
 *
 * Measured on the ORIGINAL screen running (their portal served locally, route `auth.application.list`, 1920 window) with `getBoundingClientRect` and `getComputedStyle`, and against the template of their bundle for whatever the test account's mock doesn't light up.
 *
 * ═══ WHAT CHANGES WITH THE NUMBER OF CONTACTS ═══
 *
 * Checked against the RENDERED DOM of `supernova.blip.ai/application` (an account with eleven bots) and the LIME responses from that same session's HAR.
 *
 * ALWAYS on screen, in any state:
 *   · both bars;
 *   · the ACTION-CARD ROW (`action-card-container`), whose condition in the source is `!isCarouselBannerEnabled || !canCreateChatBot` — nothing to do with the number of contacts. It's there even with eleven bots.
 *
 * ONLY with NO contact at all:
 *   · the welcome block (`welcome-banner`: `!applications.length && tenant.id && canCreateChatBot`) — illustration on the left, greeting with the PERSON's name, description and ONE button, the screen's only creation exit.
 *
 * ONLY with one contact or more, the `<div id="applications" ng-if="applications.length > 0">`:
 *   · the title "Fluxos e roteadores em {conta}" in bold `fs-24`;
 *   · the grid — fixed 188 columns, with leftover space going to the edges, from the NEWEST contact to the oldest;
 *   · pagination, which appears even with a single page ("1-11 de 11", "Itens por página: [40,80,120]", "de 1 páginas").
 *
 * ═══ MEASUREMENTS (original × ours, at 1920) ═══
 *
 *   dark bar           80 · light bar 80, white, 40 padding
 *   column             540 · 830 (≥852) · 1300 (≥1300), centered
 *   welcome            56 padding, 72 gap, text `flex: 1 0 200px`
 *   action card        `flex: 1 0 300px`, 24 padding, icon with 8-to-24 corner
 *   section title      20/700/20, 1px rule, 8 indent, 24 after
 *   card               188×196, 16 corner, 15 padding, 56 avatar, 50 name, 25 tag
 *   grid               188 auto-fill with 24 gap, at the edges
 *
 * THE LAYOUT IS THEIRS, THE PAINT IS OURS: none of their hex values go in, everything comes from the `--p-*` and `--g-barra-*` tokens. The icons and the brand are ours.
 */
export function PagePortal() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [byPage, setByPage] = useState<number>(BY_PAGE[0]);

  const aoBuscar = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  /*
   * Search, page and items-per-page live in React state. The portal's visible URL stays clean; only the API call receives these parameters.
   */
  const shell = portalUseShell();
  const grade = useRead<GradeDoPortal>(
    `/v1/management/flows?search=${encodeURIComponent(search)}&pagina=${page}&porPagina=${byPage}`,
);
  /* The database being down can't wipe out the bar: the grid falls back to the empty state. */
  const data: PortalData = {
    ...shell,
    ...(grade.data ?? { flows: [], total: 0, encontrados: 0 }),
  };
  if (grade.isPending)
    return (
      <div className="pt-app">
        <BarraDoPortal data={shell} />
      </div>
    );

  /*
   * Empty means the account has NO flow at all — not "the search found nothing". Confusing the two turns the screen for someone with thirty flows into the screen for a new account.
   */
  const empty = data.total === 0;

  return (
    <div className="pt-app">
      <BarraDoPortal data={data} />
      <SubBarra data={data} search={search} onBuscar={aoBuscar} />

      <main className="pt-conteudo">
        <div className="pt-column">
          {/*
 * The welcome banner only exists on accounts with NO contact at all and for whoever can create one — it's their `welcome-banner` (`!applications.length && tenant.id && canCreateChatBot`).
 */}
          {empty && data.canCreate ? <BoasVindas data={data} /> : null}

          {/*
 * The action-card row is NOT part of the empty state: in the DOM of the eleven-bot account it's there, above the list. Its condition in the source is `!isCarouselBannerEnabled || !canCreateChatBot` — that is, nothing to do with the number of contacts.
 */}
          <ActionCards />

          {/*
 * The list section, their `<div id="applications" ng-if="applications.length > 0">`: it only exists when the account has a contact, and it's the one that disappears on a new account.
 */}
          {empty ? null : (
            <div id="applications">
              <div className="pt-section">
                <h2>Fluxos e roteadores em {data.tenant.nome}</h2>
              </div>

              {data.flows.length === 0 ? (
                <p className="pt-nada">
                  Não foi encontrado nenhum fluxo com o nome &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <>
                  <div className="pt-grade">
                    {data.flows.map((f) => (
                      <FlowCard key={f.id} flow={f} />
                    ))}
                  </div>
                  <Pagination
                    page={page}
                    byPage={byPage}
                    encontrados={data.encontrados}
                    setPage={setPage}
                    setByPage={setByPage}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * The source's pagination (`bds-pagination` with `page-counter`, `number-items` and `items-page`): item count on the left, items-per-page choice, and the pages on the right.
 *
 * The page and the items-per-page count live in React state. The portal's visible URL doesn't receive `pagina` or `por`; those values only exist in the call to `GET /v1/gestao/fluxos`.
 */
function Pagination({
  page,
  byPage,
  encontrados,
  setPage,
  setByPage,
}: {
  page: number;
  byPage: number;
  encontrados: number;
  setPage: (page: number) => void;
  setByPage: (quantity: number) => void;
}) {
  const tamanho = BY_PAGE.includes(byPage as never) ? byPage : BY_PAGE[0];
  const pages = Math.max(1, Math.ceil(encontrados / tamanho));
  const firstItem = encontrados === 0 ? 0 : (page - 1) * tamanho + 1;
  const ultimoItem = Math.min(page * tamanho, encontrados);

  /*
   * Always shows, even with a single page: in the DOM of the eleven-bot account the bar is there, saying "1-11 de 11" and "de 1 páginas". Hiding it was our own invention.
   */

  return (
    <div className="pt-pagination">
      <div className="pt-pagination-left">
        <label>Itens por página:</label>

        <Selection
          value={String(tamanho)}
          aria-label="Itens por página"
          onChange={(e) => {
            setByPage(Number(e.target.value));
            setPage(1);
          }}
        >
          {BY_PAGE.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selection>

        <span className="pt-pagination-account">
          {firstItem}-{ultimoItem} de {encontrados}
        </span>
      </div>

      <nav className="pt-pagination-right" aria-label="Páginas">

        {}
        <button
          type="button"
          className="pt-pagination-icon"
          disabled={page === 1}
          onClick={() => setPage(1)}
          aria-label="Primeira página"
        >
          «
        </button>

        {}
        <button
          type="button"
          className="pt-pagination-icon"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          ‹
        </button>

        {}
        <Selection
          value={String(page)}
          aria-label="Página atual"
          onChange={(e) => setPage(Number(e.target.value))}
        >
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selection>

        <span className="pt-pagination-of">
          de {pages} páginas
        </span>

        {}
        <button
          type="button"
          className="pt-pagination-icon"
          disabled={page === pages}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          ›
        </button>

        {}
        <button
          type="button"
          className="pt-pagination-icon"
          disabled={page === pages}
          onClick={() => setPage(pages)}
          aria-label="Última página"
        >
          »
        </button>

      </nav>
    </div>
  );
}

/* ======================================================= barra clara */

/**
 * The second bar: 80px white, right below the dark one, with its content aligned to the SAME column as the body. It's what tells you which account everything below belongs to.
 *
 * On the right, where they put search (a 32×36 field at the column's edge), goes our search — and it only appears when there's something to search. Under the title goes the account's ADDRESS: in the source, each account's portal lives on its own subdomain, and that's where a person reads which account they're in; our URL doesn't carry that, so the slug needs to stay visible.
 */
function SubBarra({
  data,
  search,
  onBuscar,
}: {
  data: PortalData;
  search: string;
  onBuscar: (value: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(search));
  const [textSearch, setTextSearch] = useState(search);
  const fieldSearch = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const value = textSearch.trim();
    if (value === search) return;

    const timer = window.setTimeout(() => {
      onBuscar(value);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [textSearch, search, onBuscar]);

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => fieldSearch.current?.focus());
  }

  return (
    <div className="pt-subbarra">
      <div className="pt-subbarra-conteudo">
        {/*
 * Their title is a SENTENCE, not the account's bare name: `navbar.subheader.workspaceOf` = "Espaço de trabalho de {conta}", in a `bds-typo variant="fs-20" bold tag="h2"`.
 */}
        <h2 className="pt-subbarra-titulo">Espaço de trabalho de {data.tenant.nome}</h2>

        {/*
 * The light bar's right edge in the source (`action-icons`): search and, when `canCreateChatbot`, the TWO create buttons — "Criar roteador" as tertiary and "Criar fluxo" as primary. This is where creation happens, in any account state; the welcome-banner button is one more shortcut, not the only path.
 *
 * Search ALWAYS appears, even on an account with no contact at all: in the source it's there even on the empty account.
 */}
        <div className="pt-subbar-actions">
          {/*
 * Search follows the source's behavior: the text stays in local state and only updates the query 700ms after typing stops.
 */}
          <div className={`pt-search${searchOpen ? ' pt-search-open' : ''}`} role="search">
            <button className="pt-search-button" type="button" onClick={openSearch} aria-label="Abrir busca">
              <SearchIcon tamanho={32} />
            </button>
            {searchOpen ? (
              <input
                ref={fieldSearch}
                type="search"
                value={textSearch}
                aria-label="Buscar fluxos"
                onChange={(e) => setTextSearch(e.target.value)}
                onBlur={() => setSearchOpen(false)}
              />
            ) : null}
          </div>

          {data.canCreate ? (
            <>
              <Link className="btn" href={createPath('router')}>
                <IconePortal nome="roteador" tamanho={20} />
                Criar roteador
              </Link>
              <Link className="btn primario" href={createPath('marketplace')}>
                <IconePortal nome="fluxo" tamanho={20} />
                Criar fluxo
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ==================================================== estado 1: vazio */

/**
 * State 1's welcome block, at their measurements: 56px padding, 72 gap between the illustration and the text, and the text with `flex: 1 0 200px`.
 *
 * The greeting uses the PERSON's name (in the source, `blipAccount.fullName`) rather than the account's — it's the only place on the screen where that happens, and it's what makes the screen feel directed at whoever opened it.
 */
function BoasVindas({ data }: { data: PortalData }) {
  const firstName = data.user.nome.trim().split(/\s+/)[0] ?? data.user.nome;

  return (
    <div className="pt-boasvindas">
      <Illustration nome="vazio" tamanho={160} className="pt-boasvindas-desenho" />
      <div className="pt-boasvindas-texto">
        <h2>Olá, {firstName}!</h2>
        <p>
          Esta conta ainda não tem nenhum contato inteligente. Que tal começar criando o primeiro
          fluxo — a conversa que atende antes da pessoa?
        </p>
        <div className="pt-boasvindas-acao">
          {/* fix: `/builder` was never a valid top-level route (Builder only exists inside a
              contact, `${flowPath(shortName)}/templates/builder`); this button leads to
              creation, same destination as the light bar's own "Criar fluxo". */}
          <Link className="btn primario" href={createPath('marketplace')}>
            Criar meu primeiro fluxo
          </Link>
        </div>
      </div>
    </div>
  );
}



/**
 * The action-card row — their `action-card-container`.
 *
 * IT IS NOT PART OF THE EMPTY STATE. In the DOM of the eleven-bot account the row is there, between the light bar and the list; the condition in the source is `ng-if="!isCarouselBannerEnabled || !canCreateChatBot"`, which doesn't look at the number of contacts. Hiding it when the account had a flow was our own invention, and it was the most visible difference between the two screens.
 *
 * Their four are READ-ONLY — news, contract, help and community — and none of them creates anything: the only creation exit lives in the welcome-banner button. Our "Criar fluxo" and "Criar roteador" came out of here for that reason.
 *
 * "Novidades" stays out while there's nothing to show. Help and community are the two outside sites, and each only appears when its address is configured — a card that leads nowhere is worse than a short row.
 */
function ActionCards() {
  return (
    <div className="pt-actions">
      {/*
 * Their four, in the same order: news, contract, help and community. Community is still being built and comes in disabled/greyed out.
 */}
      <ActionCard
        href={tenantPath('product-updates')}
        icone="novidades"
        rotulo="Novidades no Pipe"
        texto="O que mudou, o que chegou e o que está a caminho."
      />
      {/*
 * CONTRATO (Contract), not "Minha conta" (My account): in the source these are two different screens and `onContractCardClick` leads to the contract panel (the `tenant` fragment), not to the person's profile. It was pointing to the wrong place.
 */}
      <ActionCard
        href={tenantPath('tenant')}
        icone="contrato"
        rotulo="Acompanhe seu contrato"
        texto="Plano, endereço, pessoas com acesso e os dados do contrato."
      />
      {URL_AJUDA ? (
        <ActionCard
          href={URL_AJUDA}
          externo
          icone="aprender"
          rotulo="Aprenda a usar o Pipe"
          texto="O que é fluxo, o que é roteador e como montar o primeiro atendimento."
        />
      ) : (
        <ActionCard
          emObra
          icone="aprender"
          rotulo="Aprenda a usar o Pipe"
          texto="O que é fluxo, o que é roteador e como montar o primeiro atendimento."
        />
      )}
      <ActionCard
        emObra
        icone="comunidade"
        rotulo="Converse com a Comunidade"
        texto="Quem já usa o Pipe todo dia, e o que essa gente aprendeu antes de você."
      />
    </div>
  );
}

function ActionCard({
  href,
  icone,
  rotulo,
  texto,
  externo,
  emObra,
}: {
  href?: string;
  icone: NomeDeIconePortal;
  rotulo: string;
  texto: string;
  /** Sai do aplicativo (ajuda, comunidade): abre em outra aba, como na origem. */
  externo?: boolean;
  /** Doesn't exist yet: the card shows up greyed out, with the badge, and doesn't click. */
  emObra?: boolean;
}) {
  const miolo = (
    <>
      <span className="pt-acao-icone">
        <IconePortal nome={icone} tamanho={28} />
      </span>
      <span className="pt-acao-texto">
        <b>
          {rotulo}
          {emObra ? <span className="pt-obra-selo">em breve</span> : null}
        </b>
        <span>{texto}</span>
      </span>
    </>
  );

  if (emObra) {
    return (
      <span className="pt-acao pt-acao-obra" aria-disabled="true" title="Em desenvolvimento">
        {miolo}
      </span>
    );
  }

  return externo ? (
    <a className="pt-acao" href={href} target="_blank" rel="noreferrer">
      {miolo}
    </a>
  ) : (
    <Link className="pt-acao" href={href ?? APPLICATION}>
      {miolo}
    </Link>
  );
}

/* =============================================== estados 2 e 3: grade */

/**
 * What the card's tag says, by type.
 *
 * The text comes AFTER the type icon: in `supernova`'s rendered DOM, `bds-chip-tag icon="builder-router"` (router) or `icon="builder-new-state"` (flow) draws the x-small `bds-icon` inside `chip_tag--icon` and the word inside `chip_tag--text` beside it. Looking only at the template, without the shadow root, hides the icon — that was the earlier mistake.
 */
const ETIQUETA = { roteador: 'Roteador', flow: 'Fluxo' } as const;

/**
 * The card, in their screen's three FIXED-height tiers — a 56 avatar, a 50 name and a 25 tag inside 188×196 with 15 padding. That's what keeps a two-line name from pushing the tag out.
 *
 * The tag is where flow and router are told apart, exactly like their `ContactBody.html` (`template === 'builder'` becomes "Fluxo", `template === 'master'` becomes "Roteador"). We have no contact image, so the avatar is always the initial.
 *
 * NÃO PUBLICADO (Unpublished) is the dot in the card's corner, like in the source — `rascunho` (draft) is our name for the same state. The dot is drawn in CSS, and the card's `title` spells out in full what it means: color alone isn't information.
 *
 * BLOQUEADO (Blocked) — padlock, greyed-out card, dead click — the source uses for a bot the contract has barred. We have no contract-based blocking, so there's nothing to draw — it's in the report. `arquivado` (archived) never even gets here: it's filtered out in the query.
 */
function FlowCard({ flow }: { flow: Flow }) {
  const etq = flow.tipo === 'roteador' ? ETIQUETA.roteador : ETIQUETA.flow;

  const naoPublicado = flow.estado !== 'publicado';

  return (
    <Link
      className={naoPublicado ? 'pt-card pt-card-draft' : 'pt-card'}
      /*
       * The card opens the contact's HOME, not the builder: in the source, `handleContactClick` goes to `/application/detail/{contato}/home`, and that's where Builder, Atendimento, Canais and the rest get chosen from. Going straight to the builder skipped the screen that brings everything together — and, for a router, it led to a builder it doesn't even use.
       */
      href={flowPath(flow.shortName)}
      title={naoPublicado ? `${flow.nome} — ainda não publicado` : flow.nome}
    >
      {/*
 * With a photo, it fills the circle; without one, the product icon goes in — it's their `ng-if="!contact.imageUri"`. In neither case do the name's initials show up, which is what we used to have here.
 *
 * Plain `<img>`, not `next/image`: the photo is a `data:` URI stored right in the row, and Next's optimizer has nothing to optimize in it.
 */}
      <span className="pt-card-avatar">
        {flow.imagemUrl ? (
          <img className="pt-card-photo" src={flow.imagemUrl} alt="" />
        ) : (
          <IconePortal nome="bot" tamanho={32} />
        )}
      </span>
      <span className="pt-card-name">{flow.nome}</span>
      {/*
 * The icon is decoration next to the word, which stays visible and is what the screen reader reads.
 */}
      <span className="pt-card-tag">
        <IconePortal nome={flow.tipo === 'roteador' ? 'roteador' : 'fluxo'} tamanho={16} />
        <span>{etq}</span>
      </span>
    </Link>
  );
}
