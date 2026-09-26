/**
 * Contact Analytics Dashboard and active messages share pure period, formatting, scale, and type rules here. Queries live in the `api` (`dominio/gestao-analise.ts`); both screen and API import these rules. The source is `portal-fragment-analytics` (`analytics-main.js`), mounted as `<analytics-mfe page="…">`. There, browser `Date` and `toLocaleString` compute periods and formatting, while sections request `/metrics/…` from `postmaster@analytics.msging.net`. Here those calculations are pure and covered by `tests/analise.test.ts`, while figures come from the database. Dates mean calendar days in the account timezone. The source sends the viewer-local date as `AAAA-MM-DDT00:00:00.000Z` via `ut()`; here it is `AAAA-MM-DD` text in the tenant timezone, and `Date.UTC` day arithmetic avoids daylight-saving errors.
 */



/** `vT` da origem: os cinco chips da primeira fileira, na ordem. */
export const PERIODOS_FIXOS = ['today', 'yesterday', '7days', '15days', '30days'] as const;
/** `yT`: second chip row, shown only with `is-displaying-dashboard-fixed-period-chips`. */
export const PERIODOS_DE_CALENDARIO = [
  'lastWeek',
  'lastMonth',
  'currentWeek',
  'currentMonth',
] as const;

export type PeriodNamed =
  (typeof PERIODOS_FIXOS)[number] | (typeof PERIODOS_DE_CALENDARIO)[number];
export type Period = PeriodNamed | 'custom';

/** Portuguese labels of `sT` (Dashboard) and `gt` (active messages), identical on both screens. */
export const ROTULO_OF_PERIOD: Record<PeriodNamed, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7days': 'Últimos 7 dias',
  '15days': 'Últimos 15 dias',
  '30days': 'Últimos 30 dias',
  lastWeek: 'Semana anterior',
  lastMonth: 'Mês anterior',
  currentWeek: 'Semana atual',
  currentMonth: 'Mês atual',
};

export interface Intervalo {
  /** `AAAA-MM-DD`, inclusivo. */
  inicio: string;
  /** `AAAA-MM-DD`, inclusivo — o dia final entra inteiro. */
  fim: string;
}

const DIA_MS = 86_400_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dia = (t: number) => new Date(t).toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => dia(ms(d) + n * DIA_MS);

/** Today in the account timezone, corresponding to source `new Date()` without server timezone. */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** URL `?periodo=`; unknown values fall back to source initial `vT.Today`. */
export function readPeriod(bruto: string | undefined): Period {
  const todos: readonly string[] = [...PERIODOS_FIXOS, ...PERIODOS_DE_CALENDARIO, 'custom'];
  return bruto && todos.includes(bruto) ? (bruto as Period) : 'today';
}

/**
 * Chip intervals mirror `b()` and `v()` of `xT`, and `B()`/`z()` of active-message filter `St`. Preserve source quirks: "Últimos 7 dias" is D-7 through D-1, excluding today; "Semana anterior" is Sunday through Saturday (`ht()`); "Semana atual" starts Sunday (`dt()`). Custom periods cannot start more than `limiteDias` days back (90 on Dashboard via `st(90)` of `aT`, 186 on active messages via `St`) or extend beyond today; invalid bounds return null.
 */
export function periodInterval(
  period: Period,
  hoje: string,
  personalizado?: { de?: string; ate?: string; limiteDias: number },
): Intervalo | null {
  const semana = new Date(ms(hoje)).getUTCDay();
  switch (period) {
    case 'today':
      return { inicio: hoje, fim: hoje };
    case 'yesterday': {
      const ontem = somarDias(hoje, -1);
      return { inicio: ontem, fim: ontem };
    }
    case '7days':
    case '15days':
    case '30days':
      return { inicio: somarDias(hoje, -parseInt(period, 10)), fim: somarDias(hoje, -1) };
    case 'currentWeek':
      return { inicio: somarDias(hoje, -semana), fim: hoje };
    case 'lastWeek': {
      const sabado = somarDias(hoje, -(semana + 1));
      return { inicio: somarDias(sabado, -6), fim: sabado };
    }
    case 'currentMonth':
      return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
    case 'lastMonth': {
      const ultimo = somarDias(hoje, -Number(hoje.slice(8)));
      return { inicio: `${ultimo.slice(0, 8)}01`, fim: ultimo };
    }
    case 'custom': {
      const { de, ate, limiteDias } = personalizado ?? { limiteDias: 0 };
      if (!de || !ate || !DATA.test(de) || !DATA.test(ate)) return null;
      if (de > ate || ate > hoje || de < somarDias(hoje, -limiteDias)) return null;
      return { inicio: de, fim: ate };
    }
  }
}

/** `ft()`: the equally long immediately preceding period used for comparison. */
export function intervaloAnterior(i: Intervalo): Intervalo {
  const dias = Math.round((ms(i.fim) - ms(i.inicio)) / DIA_MS) + 1;
  return { inicio: somarDias(i.inicio, -dias), fim: somarDias(i.fim, -dias) };
}


export function diasDoIntervalo(i: Intervalo): string[] {
  const dias: string[] = [];
  for (let d = i.inicio; d <= i.fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** `rt()`: short `dd/mm` axis label. */
export function diaCurto(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** `ot()`: `toLocaleString(locale, { year: 'numeric', month: 'long', day: '2-digit' })`. */
function byExtenso(d: string): string {
  return new Date(ms(d)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `IS()`: period label beside the title, e.g. "13 de setembro de 2026 - 00h às 23h59". */
export function rotuloDoIntervalo(i: Intervalo): string {
  return i.inicio === i.fim
    ? `${byExtenso(i.inicio)} - 00h às 23h59`
    : `${byExtenso(i.inicio)} - ${byExtenso(i.fim)}`;
}

/**
 * Comparison indicator hint from `XS()` and dictionary `QS`. `foraDoAlcance` mirrors `outOfRangeMessage`: if the previous period starts more than 90 days ago, the source changes the hint and clears the number to "-".
 */
export function comparison(i: Intervalo, hoje: string): { dica: string; foraDoAlcance: boolean } {
  const anterior = rotuloDoIntervalo(intervaloAnterior(i));
  if (i.inicio === i.fim)
    return { dica: `Em comparação com a data ${anterior}.`, foraDoAlcance: false };
  if (intervaloAnterior(i).inicio < somarDias(hoje, -90))
    return {
      dica: 'Não haverão resultados de comparação com o período anterior, pois o intervalo comparado ultrapassa o limite de 90 dias de dados disponíveis.',
      foraDoAlcance: true,
    };
  /* The source `.replace("-", pronome)` replaces only the FIRST hyphen. */
  return {
    dica: `Em comparação com o período de ${anterior.replace('-', 'a')}.`,
    foraDoAlcance: false,
  };
}



/**
 * Source `WS()` formats every number on both screens. Absolute values below 100 round to two decimals and values from 100 to integers (`ZS`); missing values become `padrao`. Percentages accept a FRACTION and multiply by 100 (`jS`); zero becomes `padrao`, so an empty "Taxa de rejeição" is "0%" via `Tc` while empty comparison is "-". `sinal` prefixes positive percentages with "+" (`PS`).
 */
export function formatar(
  value: number | null | undefined,
  { percentual = false, casas = 2, padrao = '-', sinal = false } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return padrao;
  let v: number;
  if (percentual) {
    if (value === 0) return padrao;
    v = Math.round(1e4 * value) / 100;
  } else {
    v =
      Math.abs(value) < 100 ? Math.round(100 * (value + Number.EPSILON)) / 100 : Math.round(value);
  }
  const texto = parseFloat(v.toFixed(casas)).toLocaleString('pt-BR');
  if (!percentual) return texto;
  if (texto === '0') return padrao;
  return v > 0 && sinal ? `+${texto}%` : `${texto}%`;
}

/**
 * Chart value-axis ticks match bundled chart.js 3.9.1 `generateTicks` and `niceNum` near line 34171: values ≤1, ≤2, ≤5, then 10. Step is `niceNum(maximum / 10)`; if rounded top exceeds ten intervals, recalculate it from that top. All zeros produce 0–1, matching `LinearScale` when `min === max`.
 */
export function escalaDoEixo(maximo: number): { topo: number; tiques: number[] } {
  const niceNum = (v: number) => {
    const potencia = 10 ** Math.floor(Math.log10(v));
    const f = v / potencia;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia;
  };
  const alto = maximo > 0 ? maximo : 1;
  let passo = niceNum(alto / 10);
  const espacos = Math.ceil(alto / passo - 1e-9);
  if (espacos > 10) passo = niceNum((espacos * passo) / 10);
  const topo = Number((Math.ceil(alto / passo - 1e-9) * passo).toFixed(10));
  const tiques: number[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) tiques.push(Number(v.toFixed(10)));
  return { topo, tiques };
}

/** `BS()`: relative change from the previous value. Previous zero with current positive gives `Infinity`, displayed as "-" by `formatar`. */
export function variation(atual: number | null | undefined, anterior: number | null | undefined) {
  if (atual === null || atual === undefined || anterior === null || anterior === undefined)
    return undefined;
  return atual === anterior ? 0 : (atual - anterior) / anterior;
}

/* ----------------------------------------------------------------- dados */


export interface ParDeContagens {
  atual: number;
  anterior: number;
}

export interface DashboardData {
  /** `isMasterApplication`: muda o texto das listas de blocos e tira o link do nome. */
  router: boolean;
  /** Channel name in the "Canais" table; source `IE` maps domain to name. */
  channel: string | null;
  /** `engaged-identity` e `active-identity`: quem mandou mensagem, e quem trocou qualquer mensagem. */
  contacts: {
    withInteraction: ParDeContagens;
    total: ParDeContagens;
    byDia: { dia: string; withInteraction: number; total: number }[];
  };
  /** `/metrics/messages`; averages are per contact WITH interaction. */
  messages: {
    enviadas: ParDeContagens;
    recebidas: ParDeContagens;
    byDia: { dia: string; enviadas: number; recebidas: number }[];
  };
  /** `/metrics/recurrence`. */
  recorrencia: {
    contacts: ParDeContagens;
    maisRecorrentes: { nome: string; recorrencia: number; telefone: string | null }[];
  };
  /** `/flowmetrics`; null `excecao` because Pipe has no exception block. */
  flow: { transbordo: ParDeContagens; total: ParDeContagens; exception: ParDeContagens | null };
  /** `/blocks/fallback` and `/blocks/desk`: lists of at most ten blocks. */
  blocksException: { nome: string; total: number }[];
  blocosTransbordo: { nome: string; total: number }[];
}

/** Names assigned by source `IE` to its domains, by Pipe channel type. */
export const NAME_OF_CHANNEL: Record<string, string> = {
  whatsapp_cloud: 'Whatsapp',
  instagram: 'Instagram',
  email: 'Email',
  /* Source `0mn.io` is "Blip Chat"; the widget is this product's chat, here Pipe Chat. */
  widget: 'Pipe Chat',
};


/** One `/active-messages/status` row, with `sendDateTime` already reduced to a day. */
export interface StatusDoDia {
  dia: string;
  enviadas: number;
  recebidas: number;
  lidas: number;
  respondidas: number;
  falhas: number;
}

export interface ActiveMessagesData {
  status: StatusDoDia[];
  /** `/active-messages/reply-hour`: respostas por hora do dia, 0 a 23. */
  respostasByHora: number[];
  /** `/active-messages/failed-count`. */
  falhas: { codigo: string | null; description: string; ocorrencias: number }[];
  /** `/active-messages/template-names` autocomplete options. */
  templates: string[];
}




/**
 * Types for contact Analytics Overview, Custom Reports, and Contact Journey (`app/fluxo/[id]/analise/`). In the source, all three use LIME commands to `postmaster@analytics.{domínio}`, and Journey also uses router Cassandra. Here available data comes from the database; unavailable data returns empty with `ponytail:`. Use one transaction per screen and SERIAL queries: `Promise.all` within `comTenant` clears `pipe.tenant_id` (see `implantacao.ts`).
 */


export interface InstantesWindow {
  inicio: Date;
  /** Exclusivo. */
  fim: Date;
}



/** Six counters in the two `general-dashboard` cards. */
export interface ContagensDaVisaoGeral {
  /** `metrics.activeClients`: sent OR received a message in the period. */
  ativos: number;
  /** `metrics.engagedClients`: SENT a message in the period. */
  engajados: number;
  total: number;
  recebidas: number;
  enviadas: number;
  /** `metrics.activeMessages`: enviadas fora da janela de 24h. */
  ativas: number;
}

export interface DiaDaVisaoGeral {
  /** `AAAA-MM-DD` no fuso da conta. */
  dia: string;
  ativos: number;
  engajados: number;
  recebidas: number;
  enviadas: number;
}

export interface ActiveByChannel {
  channel: string;
  total: number;
}

export interface VisaoGeral {
  contagens: ContagensDaVisaoGeral;
  byDia: DiaDaVisaoGeral[];
  activeByChannel: ActiveByChannel[];
}

/** One `AnalyticsReportsService.getMany` item after `handleReport`. */
export interface ReportCustom {
  id: string;
  nome: string | null;
  /** `owner.fullName || owner.email`. */
  criadoBy: string;
  modificadoEm: Date | null;
  /** `owner.email === email da pessoa`: only the owner can see edit and delete. */
  souDono: boolean;
}

/** `$e` da origem: `Regular`, `Other` e `End`. */
export type TipoDeAresta = 'regular' | 'outros' | 'saida';

/** Uma aresta do `getJourneyEdges`: `from`, `to`, `count`, `step`, `type`. */
export interface ArestaDaJornada {
  de: string;
  para: string;
  passo: number;
  quantity: number;
  tipo: TipoDeAresta;
}
