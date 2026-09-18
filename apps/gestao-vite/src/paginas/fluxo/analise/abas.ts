/**
 * A fileira de abas da Análise — a regra, sem desenho.
 *
 * Pura de propósito, como `../itens.ts`: é a única decisão da casca, e o teste
 * `tests/analise-abas.test.ts` trava o que sai daqui.
 *
 * ═══ DE ONDE SAI ═══
 *
 * O template `#analytics-tabs-view` (módulo 95760 do `portal.js`) lista oito
 * `bds-tab` na ordem abaixo. Três não têm condição nenhuma (Dashboard,
 * Relatórios Personalizados, Jornada dos Contatos); as outras cinco têm
 * `ng-show` ligado ao controlador `ra`, que as preenche em `checkFeatures()`:
 *
 *   isDisplayingActiveMessagesTab ← flag `is-displaying-analytics-active-messages-tab`
 *   isDisplayingOverviewTab       ← flag `is-displaying-analytics-overview-tab`
 *   isShowingDataExtractor        ← `Zn()` (ver `mostraGerenciador`)
 *   isShowingDataDictionary       ← flag `is-showing-data-dictionary`
 *   isShowingGoodData             ← flag `is-showing-gooddata`
 *
 * E `isShowAnalyticsSuite` (flag `blip-analytics-suite-visibility`) só decide
 * se o `analytics-redirect-modal` abre ao clicar em "Mensagens ativas".
 *
 * `is-displaying-analytics-tabs` NÃO é lida por ninguém no `portal.js` (zero
 * ocorrências da string). O `isDisplayingAnalyticsTabs` que aparece nos
 * controladores de relatório é `!isHidingAnalyticsTabs()` — a flag
 * `is-hiding-analytics-tabs`, que está `false`.
 */

export interface FlagsDaAnalise {
  abaMensagensAtivas: boolean;
  abaVisaoGeral: boolean;
  dicionarioDeDados: boolean;
  goodData: boolean;
  suiteDeAnalise: boolean;
  /** `data-extractor-show-tab`: um `isEnabled` por cluster, mais `default`. */
  gerenciadorPorCluster: Record<string, { isEnabled: boolean }>;
}

/**
 * Os valores do contexto do roteador na captura (LaunchDarkly, contexto multi
 * do bot `supernovaroteador`, contrato `supernova`).
 *
 * ponytail: fixos. Aqui não há serviço de flag; o dia em que houver, esta
 * constante vira a leitura dele, e a regra abaixo não muda.
 */
export const FLAGS_DA_CAPTURA: FlagsDaAnalise = {
  abaMensagensAtivas: true,
  abaVisaoGeral: true,
  dicionarioDeDados: true,
  goodData: false,
  suiteDeAnalise: false,
  gerenciadorPorCluster: {
    golden: { isEnabled: false },
    default: { isEnabled: true },
    dobermann: { isEnabled: false },
  },
};

/** `settings.json` da captura: `"defaultClusterName": "Beagle"`. */
export const CLUSTER_DA_CAPTURA = 'Beagle';

/**
 * `Zn()`, módulo `analytics`:
 *
 *     const e = await ve.ak.dataExtractorShowTab(), i = $n.D_.toLowerCase();
 *     return e[i in e ? i : "default"].isEnabled
 *
 * `$n.D_` é `defaultClusterName`. As flags `is-showing-data-extractor-tab`
 * (`{"clusters":"Golden,Doberman"}`) e `show-data-extractor-tab` também
 * existem no contexto, mas quem decide a aba é SÓ esta.
 */
export function mostraGerenciador(
  porCluster: FlagsDaAnalise['gerenciadorPorCluster'],
  cluster: string,
): boolean {
  const chave = cluster.toLowerCase();
  return (porCluster[chave in porCluster ? chave : 'default']?.isEnabled ?? false) === true;
}

export type ChaveDaAba =
  | 'dashboard'
  | 'activeMessages'
  | 'overview'
  | 'reports'
  | 'contactsJourney'
  | 'dataExtractor'
  | 'dataDictionary'
  | 'goodData';

export interface Aba {
  chave: ChaveDaAba;
  /** `analyticsTabs.*` do pacote pt-BR, com a caixa da origem. */
  rotulo: string;
  /** Segmento da rota; nulo quando a tela não existe aqui (vira "em breve"). */
  segmento: string | null;
  /**
   * O `ng-show`. Aba escondida CONTINUA na fileira, com `hidden` — é o que
   * `ng-hide` faz, e importa: o `.bds-tab:not(:last-child)` conta a escondida,
   * então com o GoodData fora a última visível ainda leva os 32px à direita.
   */
  visivel: boolean;
}

/*
 * A ordem é a do template. O Gerenciador é um `<iframe>` de outro aplicativo
 * (`DATA_EXTRACTOR_FRAME_URL`); o ZIP 9 trouxe esse aplicativo e ele vive na
 * rota filha `gerenciador-de-relatorios`. GoodData não aparece no contrato.
 */
const CATALOGO: readonly (Omit<Aba, 'visivel'> & {
  mostra: (f: FlagsDaAnalise, cluster: string) => boolean;
})[] = [
  { chave: 'dashboard', rotulo: 'Dashboard', segmento: 'dashboard', mostra: () => true },
  {
    chave: 'activeMessages',
    rotulo: 'Mensagens ativas',
    segmento: 'mensagens-ativas',
    mostra: (f) => f.abaMensagensAtivas,
  },
  {
    chave: 'overview',
    rotulo: 'Visão Geral',
    segmento: 'visao-geral',
    mostra: (f) => f.abaVisaoGeral,
  },
  {
    chave: 'reports',
    rotulo: 'Relatórios Personalizados',
    segmento: 'relatorios',
    mostra: () => true,
  },
  {
    chave: 'contactsJourney',
    rotulo: 'Jornada dos Contatos',
    segmento: 'jornada',
    mostra: () => true,
  },
  {
    chave: 'dataExtractor',
    rotulo: 'Gerenciador de Relatórios',
    segmento: 'gerenciador-de-relatorios',
    mostra: (f, cluster) => mostraGerenciador(f.gerenciadorPorCluster, cluster),
  },
  {
    chave: 'dataDictionary',
    rotulo: 'Dicionário de Dados',
    segmento: 'dicionario-de-dados',
    mostra: (f) => f.dicionarioDeDados,
  },
  { chave: 'goodData', rotulo: 'GoodData', segmento: null, mostra: (f) => f.goodData },
];

export function abasDaAnalise(flags: FlagsDaAnalise, cluster: string): Aba[] {
  return CATALOGO.map(({ mostra, ...aba }) => ({ ...aba, visivel: mostra(flags, cluster) }));
}

/**
 * `redirectTo: ma` do estado `auth.application.detail.analytics`: quem entra
 * em `/analytics` cai no Dashboard.
 */
export const ABA_PADRAO = 'dashboard';
