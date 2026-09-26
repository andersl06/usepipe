/**
 * The Analysis tab row — the rule, with no rendering.
 *
 * Deliberately pure, like `../itens.ts`: it's the shell's only decision, and the
 * `tests/analise-abas.test.ts` test locks down what comes out of here.
 *
 * ═══ WHERE IT COMES FROM ═══
 *
 * The `#analytics-tabs-view` template (module 95760 of `portal.js`) lists eight
 * `bds-tab` in the order below. Three have no condition at all (Dashboard,
 * Relatórios Personalizados, Jornada dos Contatos); the other five have `ng-show`
 * wired to the `ra` controller, which fills them in `checkFeatures()`:
 *
 *   isDisplayingActiveMessagesTab ← flag `is-displaying-analytics-active-messages-tab`
 *   isDisplayingOverviewTab       ← flag `is-displaying-analytics-overview-tab`
 *   isShowingDataExtractor        ← `Zn()` (see `mostraGerenciador`)
 *   isShowingDataDictionary       ← flag `is-showing-data-dictionary`
 *   isShowingGoodData             ← flag `is-showing-gooddata`
 *
 * And `isShowAnalyticsSuite` (flag `blip-analytics-suite-visibility`) only decides
 * whether the `analytics-redirect-modal` opens on clicking "Mensagens ativas".
 *
 * `is-displaying-analytics-tabs` is NOT read by anyone in `portal.js` (zero
 * occurrences of the string). The `isDisplayingAnalyticsTabs` that appears in the
 * report controllers is `!isHidingAnalyticsTabs()` — the `is-hiding-analytics-tabs`
 * flag, which is `false`.
 */

export interface AnalyticsFlags {
  tabActiveMessages: boolean;
  abaVisaoGeral: boolean;
  dataDictionary: boolean;
  goodData: boolean;
  analyticsSuite: boolean;
  /** `data-extractor-show-tab`: um `isEnabled` por cluster, mais `default`. */
  managerByCluster: Record<string, { isEnabled: boolean }>;
}

/**
 * The router context values captured for the snapshot (LaunchDarkly, the
 * `supernovaroteador` bot's multi-context, `supernova` contract).
 *
 * ponytail: fixed values. There's no flag service here; the day there is, this
 * constant becomes its reading, and the rule below doesn't change.
 */
export const FLAGS_DA_CAPTURA: AnalyticsFlags = {
  tabActiveMessages: true,
  abaVisaoGeral: true,
  dataDictionary: true,
  goodData: false,
  analyticsSuite: false,
  managerByCluster: {
    golden: { isEnabled: false },
    default: { isEnabled: true },
    dobermann: { isEnabled: false },
  },
};

/** `settings.json` da captura: `"defaultClusterName": "Beagle"`. */
export const CLUSTER_DA_CAPTURA = 'Beagle';

/**
 * `Zn()`, `analytics` module:
 *
 *     const e = await ve.ak.dataExtractorShowTab(), i = $n.D_.toLowerCase();
 *     return e[i in e ? i : "default"].isEnabled
 *
 * `$n.D_` is `defaultClusterName`. The flags `is-showing-data-extractor-tab`
 * (`{"clusters":"Golden,Doberman"}`) and `show-data-extractor-tab` also exist in
 * the context, but only this one decides the tab.
 */
export function showsManager(
  byCluster: AnalyticsFlags['managerByCluster'],
  cluster: string,
): boolean {
  const key = cluster.toLowerCase();
  return (byCluster[key in byCluster ? key : 'default']?.isEnabled ?? false) === true;
}

export type TabKey =
  | 'dashboard'
  | 'activeMessages'
  | 'overview'
  | 'reports'
  | 'contactsJourney'
  | 'dataExtractor'
  | 'dataDictionary'
  | 'goodData';

export interface Aba {
  key: TabKey;
  /** `analyticsTabs.*` from the pt-BR package, with the source's casing. */
  rotulo: string;
  /** Route segment; null when the screen doesn't exist here (shows as "coming soon"). */
  segment: string | null;
  /**
   * The `ng-show`. A hidden tab STAYS in the row, with `hidden` — that's what
   * `ng-hide` does, and it matters: `.bds-tab:not(:last-child)` counts the hidden
   * one, so with GoodData out, the last visible tab still gets the 32px on the
   * right.
   */
  visivel: boolean;
}

/*
 * The order matches the template. The Manager is an `<iframe>` from another
 * application (`DATA_EXTRACTOR_FRAME_URL`); ZIP 9 brought that application in, and
 * it lives at the child route `gerenciador-de-relatorios`. GoodData doesn't appear
 * in the contract.
 */
const CATALOGO: readonly (Omit<Aba, 'visivel'> & {
  mostra: (f: AnalyticsFlags, cluster: string) => boolean;
})[] = [
  { key: 'dashboard', rotulo: 'Dashboard', segment: 'dashboard', mostra: () => true },
  {
    key: 'activeMessages',
    rotulo: 'Mensagens ativas',
    segment: 'active-messages',
    mostra: (f) => f.tabActiveMessages,
  },
  {
    key: 'overview',
    rotulo: 'Visão Geral',
    segment: 'overview',
    mostra: (f) => f.abaVisaoGeral,
  },
  {
    key: 'reports',
    rotulo: 'Relatórios Personalizados',
    segment: 'reports',
    mostra: () => true,
  },
  {
    key: 'contactsJourney',
    rotulo: 'Jornada dos Contatos',
    segment: 'journey',
    mostra: () => true,
  },
  {
    key: 'dataExtractor',
    rotulo: 'Gerenciador de Relatórios',
    segment: 'report-manager',
    mostra: (f, cluster) => showsManager(f.managerByCluster, cluster),
  },
  {
    key: 'dataDictionary',
    rotulo: 'Dicionário de Dados',
    segment: 'data-dictionary',
    mostra: (f) => f.dataDictionary,
  },
  { key: 'goodData', rotulo: 'GoodData', segment: null, mostra: (f) => f.goodData },
];

export function analyticsTabs(flags: AnalyticsFlags, cluster: string): Aba[] {
  return CATALOGO.map(({ mostra, ...aba }) => ({ ...aba, visivel: mostra(flags, cluster) }));
}

/**
 * `redirectTo: ma` do estado `auth.application.detail.analytics`: quem entra
 * em `/analytics` cai no Dashboard.
 */
export const ABA_PADRAO = 'dashboard';
