import { useSearchParams } from 'react-router-dom';
import Link from '../../../../components/link';
import { IconePortal } from '../../../../components/icones-portal';
import { PAGES, AboutData } from './pages';
import './dictionary.css';

/**
 * Data Dictionary for the contact's Analysis — the `dataDictionary` page of
 * `portal-fragment-analytics`, which the portal mounts with
 * `<analytics-mfe page="dataDictionary" params="…">`.
 *
 * The reference is `cap6s/portalmfe/analytics-main.js`: the `iC` component (the
 * frame), the `HV` (the menu), the `bV` provider (the state), and one function per
 * page (`zN`, `SU`, `lU`… see `paginas.tsx`). Nothing here reads a database: the
 * source's dictionary is fixed text in the bundle itself.
 *
 * ═══ STATE LIVES IN THE URL, AS IT DOES THERE ═══
 *
 * Their `bV` reads `params` in the `secao:subsecao` format — it's the
 * `?path=dashboard:listOfBlocks` that the source's Dashboard builds in the "Clique
 * aqui" link (`WT`, line ~58787). Here the same `path` becomes `searchParams`, and
 * each menu click is a link: no client-side JavaScript. The keys are THEIRS, so
 * the Dashboard's link still works.
 *
 * Two behavior divergences, both from having no client state:
 * - `?path=dashboard` with no subsection opens the "Dashboard" page (`vU`). There,
 *   ENTERING via the URL this way leaves the "Sobre dados" page with the accordion
 *   open; CLICKING the section is what switches pages. We follow the click, which
 *   is the normal path.
 * - Clicking again on an open section, there, closes the accordion while keeping
 *   the page (`handleSectionClick` toggles `selectedSection`). Here the link
 *   reopens it.
 *   ponytail: no "closed" state in the URL; add a parameter if anyone misses it.
 */
interface Item {
  key: string;
  rotulo: string;
  /** `isActive` do `valuesItemMenu`: o inativo abre o alerta em vez de navegar. */
  ativo: boolean;
}

interface Section {
  key: string;
  titulo: string;
  /** `active` do `ZV`/`AV`: inativa ganha o selo "Em Breve" (`SV`). */
  active: boolean;
  /** Present = accordion (`AV`); absent = single item (`ZV`). */
  itens?: readonly Item[];
}

/*
 * The `HV` menu, in JSX order, with the pt labels from `BV` (sections) and
 * `TV.menuOne` (subsections). "Lista de blocos" exists because the router's
 * `is-displaying-block-listing-section` flag is `true` (`hidden: !a`).
 */
const SECTIONS: readonly Section[] = [
  { key: 'aboutData', titulo: 'Sobre dados', active: true },
  {
    key: 'dashboard',
    titulo: 'Dashboard',
    active: true,
    itens: [
      { key: 'dateFilter', rotulo: 'Filtro de data', ativo: true },
      { key: 'comparisonIndicator', rotulo: 'Indicador de comparação', ativo: true },
      { key: 'contacts', rotulo: 'Contatos', ativo: true },
      { key: 'recurrence', rotulo: 'Recorrência', ativo: true },
      { key: 'messages', rotulo: 'Mensagens', ativo: true },
      { key: 'channels', rotulo: 'Canais (Em breve)', ativo: false },
      { key: 'conversationalFlow', rotulo: 'Fluxo conversacional', ativo: true },
      { key: 'listOfBlocks', rotulo: 'Lista de blocos', ativo: true },
      { key: 'frequentlyAskedQuestions', rotulo: 'Perguntas frequentes', ativo: true },
    ],
  },
  { key: 'overview', titulo: 'Visão Geral', active: false },
  { key: 'contactJourney', titulo: 'Jornada dos Contatos', active: false },
  { key: 'customReport', titulo: 'Relatórios Personalizados', active: false },
  {
    key: 'reportManager',
    titulo: 'Gerenciador de Relatórios',
    active: true,
    itens: [
      { key: 'activeMessages', rotulo: 'Mensagens ativas', ativo: true },
      { key: 'eventTracking', rotulo: 'Rastreamento de eventos', ativo: true },
      { key: 'chatbotUserMetrics', rotulo: 'Métricas de chatbot e usuários', ativo: true },
      { key: 'statusAttendants', rotulo: 'Status dos atendentes', ativo: true },
      { key: 'serviceMetrics', rotulo: 'Métricas de atendimento', ativo: true },
      { key: 'serviceHistory', rotulo: 'Histórico de atendimento', ativo: true },
    ],
  },
];

/** The single alert's `id`; inactive items open it via `popovertarget`. */
const ALERTA = 'dd-alerta';

export function DictionaryPage() {
  const [search] = useSearchParams();
  const [pedida, subPedida] = (search.get('path') ?? '').split(':');
  /* `bV`'s `mV`: with no `path` (or with garbage), the section is "Sobre dados". */
  const section = SECTIONS.find((s) => s.active && s.key === pedida) ?? SECTIONS[0]!;
  const item = section.itens?.find((i) => i.ativo && i.key === subPedida);
  const Page = PAGES[item?.key ?? section.key] ?? AboutData;

  return (
    /* `nC` + `oC`: 60 em cima; coluna de 85%, entre 1024 e 2560, centrada. */
    <div className="dd-page">
      <div className="dd-column">
        {/* `bds-grid xxs=12` > `bds-typo fs-32 bold` (margem de typo fs-32: 22). */}
        <h1 className="dd-titulo">Dicionário de Dados</h1>

        {/*
 * `rC`: the `bds-paper` with 10 padding, menu on the left and the page alongside
 * (`aC`).
 */}
        <div className="dd-paper">
          <nav className="dd-menu" aria-label="Dicionário de dados">
            <div className="dd-menu-lista">
              {SECTIONS.map((s) =>
                s.itens ? (
                  <Acordeao
                    key={s.key}
                    section={s}
                    aberta={s.key === section.key}
                    selecionado={item?.key ?? null}
                  />
                ) : (
                  <ItemUnico key={s.key} section={s} aberta={s.key === section.key} />
                ),
              )}
            </div>
          </nav>

          <div className="dd-area">
            <Page />
          </div>
        </div>
      </div>

      <Alerta />
    </div>
  );
}



/**
 * The title's color class: `open` (primary) on the clicked section, `active` on
 * the rest.
 */
function corDoTitulo(active: boolean, aberta: boolean) {
  if (!active) return '';
  return aberta ? 'dd-aberto' : 'dd-ativo';
}

/**
 * `ZV` — a single-line item: "Sobre dados" and the three "Em Breve" ones. The
 * active one navigates (`handleSectionClick`); the inactive one opens the alert
 * (`r(e => !e)`).
 */
function ItemUnico({ section, aberta }: { section: Section; aberta: boolean }) {
  const miolo = (
    <span className="dd-unico-linha">
      <span className={`dd-unico-titulo ${corDoTitulo(section.active, aberta)}`}>{section.titulo}</span>
      {section.active ? null : (
        <span className="dd-embreve">
          <span>Em Breve</span>
        </span>
      )}
    </span>
  );
  return section.active ? (
    <Link className="dd-unico" href={`?path=${section.key}`}>
      {miolo}
    </Link>
  ) : (
    <button type="button" className="dd-unico" popoverTarget={ALERTA}>
      {miolo}
    </button>
  );
}

/**
 * `AV` — the accordion (`details.accordion` in the source). Closed, the `QV`'s
 * `max-height: 50px` only leaves the summary visible; here closed simply doesn't
 * render the items. The arrow is `arrow-down` open and `arrow-right` closed (`WV`).
 */
function Acordeao({
  section,
  aberta,
  selecionado,
}: {
  section: Section;
  aberta: boolean;
  selecionado: string | null;
}) {
  const cor = corDoTitulo(section.active, aberta);
  return (
    <div className="dd-acordeao">
      <Link className="dd-acordeao-cabeca" href={`?path=${section.key}`}>
        <span className={`dd-acordeao-titulo ${cor}`}>{section.titulo}</span>
        <IconePortal
          nome={aberta ? 'baixo' : 'direita'}
          tamanho={24}
          className={`dd-acordeao-seta ${cor}`}
        />
      </Link>

      {aberta
        ? section.itens?.map((i) => {
            /* `wV`: bolinha da marca no item escolhido; `open` nele, `active` nos
               demais, e nenhuma das duas no inativo (fica fantasma). */
            const escolhido = i.ativo && i.key === selecionado;
            const miolo = (
              <>
                <span className="dd-sub-marca">
                  {escolhido ? <span className="dd-sub-bolinha" /> : null}
                </span>
                <span
                  className={`dd-sub-texto ${i.ativo ? (escolhido ? 'dd-aberto' : 'dd-ativo') : ''}`}
                >
                  {i.rotulo}
                </span>
              </>
            );
            return i.ativo ? (
              <Link key={i.key} className="dd-sub" href={`?path=${section.key}:${i.key}`}>
                {miolo}
              </Link>
            ) : (
              <button key={i.key} type="button" className="dd-sub" popoverTarget={ALERTA}>
                {miolo}
              </button>
            );
          })
        : null}
    </div>
  );
}

/**
 * The `bds-alert` from `jV` (in `ZV` and in `AV`): `variant="error"` header with
 * the `error` icon, the text, and "Fechar" as a secondary button. In the source
 * it's React state; here it's a native `popover` — opens and closes with no
 * JavaScript of ours.
 */
function Alerta() {
  return (
    <div id={ALERTA} popover="auto" className="dd-alerta" role="alertdialog">
      <div className="dd-alerta-caixa">
        <div className="dd-alerta-cabeca">
          <IconePortal nome="erro-contorno" tamanho={32} />
          <h2>Ops! Este conteúdo ainda não está disponivel.</h2>
        </div>
        <p className="dd-alerta-corpo">
          Estamos trabalhando para trazer muito em breve o melhor conteúdo de análise de performace
          do seu contato inteligente.
        </p>
        <div className="dd-alert-actions">
          <button
            type="button"
            className="dd-botao-secundario"
            popoverTarget={ALERTA}
            popoverTargetAction="hide"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
