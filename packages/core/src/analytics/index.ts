/**
 * A Análise do contato — Dashboard e Mensagens ativas: a parte PURA (período,
 * formatação, escala, tipos). As consultas vivem na `api`
 * (`dominio/gestao-analise.ts`); a tela e a `api` importam daqui.
 *
 * A Análise do contato — Dashboard e Mensagens ativas.
 *
 * A régua é o `portal-fragment-analytics` da origem (`analytics-main.js`, o
 * micro-frontend React que o portal monta com `<analytics-mfe page="…">`). Lá
 * as contas moram no navegador: o período sai do `Date` local, a formatação do
 * `toLocaleString`, e cada seção pede um comando `/metrics/…` ao
 * `postmaster@analytics.msging.net`. Aqui o período e a formatação são funções
 * puras (o teste `tests/analise.test.ts` as trava), e os números saem do banco.
 *
 * ═══ AS DATAS SÃO DIAS DE CALENDÁRIO, NO FUSO DA CONTA ═══
 *
 * Lá o "hoje" é o do computador de quem abre a tela e o intervalo vai ao
 * servidor como `AAAA-MM-DDT00:00:00.000Z` (`ut()`), só com a data. Então o
 * que importa é a DATA, e aqui ela é texto `AAAA-MM-DD` calculado no fuso do
 * tenant — conta de dia com `Date.UTC` não tropeça em horário de verão.
 */

/* ------------------------------------------------------------------ período */

/** `vT` da origem: os cinco chips da primeira fileira, na ordem. */
export const PERIODOS_FIXOS = ['today', 'yesterday', '7days', '15days', '30days'] as const;
/** `yT`: a segunda fileira, que só aparece com `is-displaying-dashboard-fixed-period-chips`. */
export const PERIODOS_DE_CALENDARIO = [
  'lastWeek',
  'lastMonth',
  'currentWeek',
  'currentMonth',
] as const;

export type PeriodNamed =
  (typeof PERIODOS_FIXOS)[number] | (typeof PERIODOS_DE_CALENDARIO)[number];
export type Period = PeriodNamed | 'custom';

/** Os rótulos pt de `sT` (Dashboard) e `gt` (Mensagens ativas) — iguais nos dois. */
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

/** A data de hoje no fuso da conta — o `new Date()` da origem, sem o fuso do servidor. */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** O `?periodo=` da URL; o que não for conhecido cai no `vT.Today` inicial da origem. */
export function readPeriod(bruto: string | undefined): Period {
  const todos: readonly string[] = [...PERIODOS_FIXOS, ...PERIODOS_DE_CALENDARIO, 'custom'];
  return bruto && todos.includes(bruto) ? (bruto as Period) : 'today';
}

/**
 * O intervalo de cada chip — `b()` e `v()` de `xT` (e os mesmos `B()`/`z()` de
 * `St`, o filtro de Mensagens ativas).
 *
 * As esquisitices são da origem e ficam: "Últimos 7 dias" é D-7 a D-1 (sem
 * hoje), "Semana anterior" é domingo a sábado (`ht()`), "Semana atual" começa no
 * domingo (`dt()`). O personalizado aceita no máximo `limiteDias` para trás —
 * 90 no Dashboard (`st(90)` do `aT`) e 186 em Mensagens ativas (`St`) — e não
 * passa de hoje; fora disso, `null`.
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

/** `ft()`: o mesmo tanto de dias, logo antes. É contra ele que a variação compara. */
export function intervaloAnterior(i: Intervalo): Intervalo {
  const dias = Math.round((ms(i.fim) - ms(i.inicio)) / DIA_MS) + 1;
  return { inicio: somarDias(i.inicio, -dias), fim: somarDias(i.fim, -dias) };
}

/** Cada dia do intervalo, em ordem — um ponto por dia nos gráficos. */
export function diasDoIntervalo(i: Intervalo): string[] {
  const dias: string[] = [];
  for (let d = i.inicio; d <= i.fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** `rt()`: o rótulo curto do eixo, `dd/mm`. */
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

/** `IS()`: o texto do período ao lado do título ("13 de setembro de 2026 - 00h às 23h59"). */
export function rotuloDoIntervalo(i: Intervalo): string {
  return i.inicio === i.fim
    ? `${byExtenso(i.inicio)} - 00h às 23h59`
    : `${byExtenso(i.inicio)} - ${byExtenso(i.fim)}`;
}

/**
 * A dica do indicador de comparação — `XS()` com o dicionário `QS`.
 *
 * `foraDoAlcance` é o ramo `outOfRangeMessage`: quando o período anterior
 * começa antes de 90 dias atrás, a origem troca a dica E apaga o número ("-").
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
  /* O `.replace("-", pronome)` da origem troca só o PRIMEIRO hífen. */
  return {
    dica: `Em comparação com o período de ${anterior.replace('-', 'a')}.`,
    foraDoAlcance: false,
  };
}

/* --------------------------------------------------------------- números */

/**
 * `WS()` da origem, que formata TODO número das duas telas.
 *
 * Absoluto: abaixo de 100 arredonda em 2 casas, a partir de 100 em inteiro
 * (`ZS`); ausente vira `padrao`. Percentual: recebe FRAÇÃO, multiplica por 100
 * (`jS`), e zero vira `padrao` — por isso "Taxa de rejeição" vazia é "0%" (o
 * `Tc` passado como padrão) e o indicador de comparação vazio é "-".
 * `sinal` põe "+" na frente do positivo (`PS`).
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
 * Os tiques do eixo de valor dos gráficos — o `generateTicks` do chart.js
 * 3.9.1 que vem no bundle (o `niceNum` da linha ~34171: ≤1 → 1, ≤2 → 2,
 * ≤5 → 5, senão 10). Passo = `niceNum(máximo / 10)`; se o topo arredondado
 * passar de 10 espaços, o passo é refeito sobre ele. Tudo zero vira 0 a 1,
 * que é o `min === max` do `LinearScale`.
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

/** `BS()`: variação relativa ao anterior. Anterior zero com atual positivo dá `Infinity`, que `formatar` mostra como "-". */
export function variation(atual: number | null | undefined, anterior: number | null | undefined) {
  if (atual === null || atual === undefined || anterior === null || anterior === undefined)
    return undefined;
  return atual === anterior ? 0 : (atual - anterior) / anterior;
}

/* ----------------------------------------------------------------- dados */

/** O número do período e o do período anterior, para o indicador de comparação. */
export interface ParDeContagens {
  atual: number;
  anterior: number;
}

export interface DashboardData {
  /** `isMasterApplication`: muda o texto das listas de blocos e tira o link do nome. */
  router: boolean;
  /** O nome do canal na tabela "Canais" — o `IE` da origem, que traduz domínio em nome. */
  channel: string | null;
  /** `engaged-identity` e `active-identity`: quem mandou mensagem, e quem trocou qualquer mensagem. */
  contacts: {
    withInteraction: ParDeContagens;
    total: ParDeContagens;
    byDia: { dia: string; withInteraction: number; total: number }[];
  };
  /** `/metrics/messages`. As médias são por contato COM interação. */
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
  /** `/flowmetrics`. `excecao` nulo: o Pipe não tem bloco de exceção. */
  flow: { transbordo: ParDeContagens; total: ParDeContagens; exception: ParDeContagens | null };
  /** `/blocks/fallback` e `/blocks/desk` — as listas de até 10 blocos. */
  blocksException: { nome: string; total: number }[];
  blocosTransbordo: { nome: string; total: number }[];
}

/** Os nomes que o `IE` dá aos domínios da origem, pelo tipo de canal do Pipe. */
export const NAME_OF_CHANNEL: Record<string, string> = {
  whatsapp_cloud: 'Whatsapp',
  instagram: 'Instagram',
  email: 'Email',
  /* `0mn.io` é "Blip Chat" lá: o widget é o chat do produto, e o produto aqui é o Pipe. */
  widget: 'Pipe Chat',
};


/** Uma linha de `/active-messages/status` (`sendDateTime` já como dia). */
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
  /** `/active-messages/template-names`: as opções do autocomplete. */
  templates: string[];
}


/* ═══════════════════ Visão geral, relatórios e jornada (só os tipos) ═══ */

/**
 * Os dados da Análise do contato — Visão Geral, Relatórios Personalizados e
 * Jornada dos Contatos (`app/fluxo/[id]/analise/`).
 *
 * Na origem os três falam com `postmaster@analytics.{domínio}` por comando
 * LIME (e a Jornada, com o Cassandra do roteador). Aqui o que existir no banco
 * é lido de verdade; o que não existir devolve vazio com `ponytail:`.
 *
 * Uma transação por tela, consultas EM SÉRIE — `Promise.all` dentro do
 * `comTenant` apaga o `pipe.tenant_id` (ver `implantacao.ts`).
 */


export interface InstantesWindow {
  inicio: Date;
  /** Exclusivo. */
  fim: Date;
}

/* ------------------------------------------------------------ Visão Geral */

/** Os seis contadores dos dois cartões do `general-dashboard`. */
export interface ContagensDaVisaoGeral {
  /** `metrics.activeClients`: enviaram OU receberam mensagem no período. */
  ativos: number;
  /** `metrics.engagedClients`: ENVIARAM mensagem no período. */
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

/** Um item de `AnalyticsReportsService.getMany`, já com o `handleReport` aplicado. */
export interface ReportCustom {
  id: string;
  nome: string | null;
  /** `owner.fullName || owner.email`. */
  criadoBy: string;
  modificadoEm: Date | null;
  /** `owner.email === email da pessoa`: só o dono vê editar e excluir. */
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
