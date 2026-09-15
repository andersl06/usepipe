import { sql } from 'drizzle-orm';
import { consultar } from './banco';

/**
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

export type PeriodoNomeado =
  (typeof PERIODOS_FIXOS)[number] | (typeof PERIODOS_DE_CALENDARIO)[number];
export type Periodo = PeriodoNomeado | 'custom';

/** Os rótulos pt de `sT` (Dashboard) e `gt` (Mensagens ativas) — iguais nos dois. */
export const ROTULO_DO_PERIODO: Record<PeriodoNomeado, string> = {
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
export function lerPeriodo(bruto: string | undefined): Periodo {
  const todos: readonly string[] = [...PERIODOS_FIXOS, ...PERIODOS_DE_CALENDARIO, 'custom'];
  return bruto && todos.includes(bruto) ? (bruto as Periodo) : 'today';
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
export function intervaloDoPeriodo(
  periodo: Periodo,
  hoje: string,
  personalizado?: { de?: string; ate?: string; limiteDias: number },
): Intervalo | null {
  const semana = new Date(ms(hoje)).getUTCDay();
  switch (periodo) {
    case 'today':
      return { inicio: hoje, fim: hoje };
    case 'yesterday': {
      const ontem = somarDias(hoje, -1);
      return { inicio: ontem, fim: ontem };
    }
    case '7days':
    case '15days':
    case '30days':
      return { inicio: somarDias(hoje, -parseInt(periodo, 10)), fim: somarDias(hoje, -1) };
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
function porExtenso(d: string): string {
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
    ? `${porExtenso(i.inicio)} - 00h às 23h59`
    : `${porExtenso(i.inicio)} - ${porExtenso(i.fim)}`;
}

/**
 * A dica do indicador de comparação — `XS()` com o dicionário `QS`.
 *
 * `foraDoAlcance` é o ramo `outOfRangeMessage`: quando o período anterior
 * começa antes de 90 dias atrás, a origem troca a dica E apaga o número ("-").
 */
export function comparacao(i: Intervalo, hoje: string): { dica: string; foraDoAlcance: boolean } {
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
  valor: number | null | undefined,
  { percentual = false, casas = 2, padrao = '-', sinal = false } = {},
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return padrao;
  let v: number;
  if (percentual) {
    if (valor === 0) return padrao;
    v = Math.round(1e4 * valor) / 100;
  } else {
    v =
      Math.abs(valor) < 100 ? Math.round(100 * (valor + Number.EPSILON)) / 100 : Math.round(valor);
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
export function variacao(atual: number | null | undefined, anterior: number | null | undefined) {
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

export interface DadosDoDashboard {
  /** `isMasterApplication`: muda o texto das listas de blocos e tira o link do nome. */
  roteador: boolean;
  /** O nome do canal na tabela "Canais" — o `IE` da origem, que traduz domínio em nome. */
  canal: string | null;
  /** `engaged-identity` e `active-identity`: quem mandou mensagem, e quem trocou qualquer mensagem. */
  contatos: {
    comInteracao: ParDeContagens;
    total: ParDeContagens;
    porDia: { dia: string; comInteracao: number; total: number }[];
  };
  /** `/metrics/messages`. As médias são por contato COM interação. */
  mensagens: {
    enviadas: ParDeContagens;
    recebidas: ParDeContagens;
    porDia: { dia: string; enviadas: number; recebidas: number }[];
  };
  /** `/metrics/recurrence`. */
  recorrencia: {
    contatos: ParDeContagens;
    maisRecorrentes: { nome: string; recorrencia: number; telefone: string | null }[];
  };
  /** `/flowmetrics`. `excecao` nulo: o Pipe não tem bloco de exceção. */
  fluxo: { transbordo: ParDeContagens; total: ParDeContagens; excecao: ParDeContagens | null };
  /** `/blocks/fallback` e `/blocks/desk` — as listas de até 10 blocos. */
  blocosExcecao: { nome: string; total: number }[];
  blocosTransbordo: { nome: string; total: number }[];
}

/** Os nomes que o `IE` dá aos domínios da origem, pelo tipo de canal do Pipe. */
const NOME_DO_CANAL: Record<string, string> = {
  whatsapp_cloud: 'Whatsapp',
  instagram: 'Instagram',
  email: 'Email',
  /* `0mn.io` é "Blip Chat" lá: o widget é o chat do produto, e o produto aqui é o Pipe. */
  widget: 'Pipe Chat',
};

/**
 * O Dashboard de um contato, lido do banco.
 *
 * Tem equivalente de verdade: `api/src/dominio/fluxo.ts` grava uma
 * `execucao_fluxo` por conversa que o bot atende, as mensagens do bot e o
 * transbordo (`enfileirada` com `dados.origem = 'fluxo'`). Então contatos,
 * mensagens, recorrência e retenção/transbordo saem das conversas que tiveram
 * execução deste fluxo — e, como na origem, as mensagens do atendimento humano
 * dessas conversas entram na conta ("Inclui, também, mensagens trafegadas no
 * Desk", diz o Dicionário de Dados).
 *
 * ponytail: `excecao`, `blocosExcecao` e `blocosTransbordo` vão vazios. O Pipe
 * não tem bloco de exceção, e `execucao_passo` não marca em qual bloco o
 * transbordo aconteceu; quando marcar, é um `group by bloco_id` aqui.
 * ponytail: o roteador não agrega os fluxos que ele chama (na origem agrega
 * "todos os chatbots conectados") — o motor do Pipe ainda não roteia.
 */
export async function carregarDashboard(
  fluxoId: string,
  intervalo: Intervalo,
  fuso: string,
): Promise<DadosDoDashboard | null> {
  const anterior = intervaloAnterior(intervalo);
  return consultar(async (tx) => {
    const { rows: contato } = await tx.execute<{ tipo: string; canal: string | null }>(
      sql`select f.tipo, k.tipo as canal from fluxo f left join canal k on k.id = f.canal_id where f.id = ${fluxoId}`,
    );
    if (!contato[0]) return null;

    const medir = async (i: Intervalo) => {
      /* Um `rollup` por dia: as linhas de cada dia e, com `dia` nulo, o período
         inteiro — onde o `count(distinct)` não é soma dos dias. */
      const { rows } = await tx.execute<{
        dia: string | null;
        enviadas: number;
        recebidas: number;
        total: number;
        com_interacao: number;
        recorrentes: number;
      }>(sql`
        with conv as (
          select distinct e.conversa_id, c.contato_id
            from execucao_fluxo e
            join fluxo_versao v on v.id = e.fluxo_versao_id
            join conversa c on c.id = e.conversa_id
           where v.fluxo_id = ${fluxoId}
        ), msg as (
          select conv.contato_id, m.direcao, (m.criada_em at time zone ${fuso})::date as dia
            from mensagem m
            join conv on conv.conversa_id = m.conversa_id
           where m.direcao in ('entrada', 'saida')
             and m.criada_em >= (${i.inicio}::date)::timestamp at time zone ${fuso}
             and m.criada_em < ((${i.fim}::date + 1)::timestamp) at time zone ${fuso}
        ), dias as (
          select contato_id, count(distinct dia) as n from msg where direcao = 'entrada' group by contato_id
        )
        select dia::text as dia,
               count(*) filter (where direcao = 'saida')::int as enviadas,
               count(*) filter (where direcao = 'entrada')::int as recebidas,
               count(distinct contato_id)::int as total,
               count(distinct contato_id) filter (where direcao = 'entrada')::int as com_interacao,
               (select count(*) from dias where n >= 2)::int as recorrentes
          from msg
         group by rollup (dia)
         order by dia nulls first
      `);
      const [soma, ...porDia] = rows;
      const { rows: fluxo } = await tx.execute<{ total: number; transbordo: number }>(sql`
        select count(distinct e.contato_id)::int as total,
               count(distinct e.contato_id) filter (where exists (
                 select 1 from evento_atendimento ev
                  where ev.conversa_id = e.conversa_id and ev.tipo = 'enfileirada'
                    and ev.dados ->> 'origem' = 'fluxo'
               ))::int as transbordo
          from execucao_fluxo e
          join fluxo_versao v on v.id = e.fluxo_versao_id
         where v.fluxo_id = ${fluxoId}
           and e.iniciada_em >= (${i.inicio}::date)::timestamp at time zone ${fuso}
           and e.iniciada_em < ((${i.fim}::date + 1)::timestamp) at time zone ${fuso}
      `);
      /* O `rollup` devolve a linha do total mesmo sem mensagem nenhuma; o que
         falta são os dias vazios, e o gráfico da origem tem um rótulo por dia. */
      const doDia = new Map(porDia.map((d) => [d.dia, d]));
      return {
        soma,
        porDia: diasDoIntervalo(i).map((d) => ({
          dia: d,
          enviadas: doDia.get(d)?.enviadas ?? 0,
          recebidas: doDia.get(d)?.recebidas ?? 0,
          total: doDia.get(d)?.total ?? 0,
          com_interacao: doDia.get(d)?.com_interacao ?? 0,
        })),
        fluxo: fluxo[0],
      };
    };

    const [agora, antes] = [await medir(intervalo), await medir(anterior)];
    const par = (f: (m: typeof agora) => number | undefined) => ({
      atual: f(agora) ?? 0,
      anterior: f(antes) ?? 0,
    });

    const { rows: topo } = await tx.execute<{
      nome: string | null;
      telefone: string | null;
      id: string;
      recorrencia: number;
    }>(sql`
      select c.id, c.nome, c.telefone_e164 as telefone,
             (count(distinct (m.criada_em at time zone ${fuso})::date) - 1)::int as recorrencia
        from mensagem m
        join conversa cv on cv.id = m.conversa_id
        join contato c on c.id = cv.contato_id
       where m.direcao = 'entrada'
         and exists (select 1 from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
                      where e.conversa_id = cv.id and v.fluxo_id = ${fluxoId})
         and m.criada_em >= (${intervalo.inicio}::date)::timestamp at time zone ${fuso}
         and m.criada_em < ((${intervalo.fim}::date + 1)::timestamp) at time zone ${fuso}
       group by c.id
      having count(distinct (m.criada_em at time zone ${fuso})::date) >= 2
       order by recorrencia desc, c.nome
       limit 10
    `);

    const canal = contato[0].canal;
    return {
      roteador: contato[0].tipo === 'roteador',
      canal: canal ? (NOME_DO_CANAL[canal] ?? canal) : null,
      contatos: {
        comInteracao: par((m) => m.soma?.com_interacao),
        total: par((m) => m.soma?.total),
        porDia: agora.porDia.map((d) => ({
          dia: d.dia,
          comInteracao: d.com_interacao,
          total: d.total,
        })),
      },
      mensagens: {
        enviadas: par((m) => m.soma?.enviadas),
        recebidas: par((m) => m.soma?.recebidas),
        porDia: agora.porDia.map((d) => ({
          dia: d.dia,
          enviadas: d.enviadas,
          recebidas: d.recebidas,
        })),
      },
      recorrencia: {
        contatos: par((m) => m.soma?.recorrentes),
        maisRecorrentes: topo.map((t) => ({
          nome: t.nome ?? t.id,
          recorrencia: t.recorrencia,
          telefone: t.telefone,
        })),
      },
      fluxo: {
        transbordo: par((m) => m.fluxo?.transbordo),
        total: par((m) => m.fluxo?.total),
        excecao: null,
      },
      blocosExcecao: [],
      blocosTransbordo: [],
    };
  });
}

/**
 * A barra lateral "Número de Contatos" (`uw`): quem interagiu, ou quem não
 * respondeu, no período — `/metrics/contacts/engaged` e
 * `/metrics/sidebar/ContactsRejection` na origem. O nome, e sem nome o
 * telefone (lá é `name ?? identity`).
 *
 * ponytail: a origem pede de 20 em 20 conforme rola; aqui vêm os 1000 mais
 * recentes de uma vez — o mesmo teto que a dica do "Exportar lista" anuncia.
 */
export async function carregarListaDeContatos(
  fluxoId: string,
  intervalo: Intervalo,
  fuso: string,
  tipo: 'interacao' | 'rejeicao',
): Promise<string[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{ nome: string }>(sql`
      select coalesce(c.nome, c.telefone_e164, c.id::text) as nome
        from mensagem m
        join conversa cv on cv.id = m.conversa_id
        join contato c on c.id = cv.contato_id
       where m.direcao in ('entrada', 'saida')
         and exists (select 1 from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
                      where e.conversa_id = cv.id and v.fluxo_id = ${fluxoId})
         and m.criada_em >= (${intervalo.inicio}::date)::timestamp at time zone ${fuso}
         and m.criada_em < ((${intervalo.fim}::date + 1)::timestamp) at time zone ${fuso}
       group by c.id
      having (count(*) filter (where m.direcao = 'entrada') > 0) = ${tipo === 'interacao'}
       order by max(m.criada_em) desc
       limit 1000
    `);
    return rows.map((r) => r.nome);
  });
}

/* ------------------------------------------------------- mensagens ativas */

/** Uma linha de `/active-messages/status` (`sendDateTime` já como dia). */
export interface StatusDoDia {
  dia: string;
  enviadas: number;
  recebidas: number;
  lidas: number;
  respondidas: number;
  falhas: number;
}

export interface DadosDeMensagensAtivas {
  status: StatusDoDia[];
  /** `/active-messages/reply-hour`: respostas por hora do dia, 0 a 23. */
  respostasPorHora: number[];
  /** `/active-messages/failed-count`. */
  falhas: { codigo: string | null; descricao: string; ocorrencias: number }[];
  /** `/active-messages/template-names`: as opções do autocomplete. */
  templates: string[];
}

/**
 * Mensagens ativas do contato — sem equivalente no Pipe hoje.
 *
 * Na origem é a mensagem que o BOT manda depois de 24 horas da última do
 * cliente. O bot do Pipe só fala em resposta (`gravarRespostaDoBot` grava
 * `dentro_da_janela = true`, sempre), e template disparado por campanha não é
 * atribuído a fluxo nenhum. Devolve a resposta vazia da origem — que é o que a
 * tela desenha com zeros.
 *
 * ponytail: quando disparo de template ganhar `fluxo_id` (ou o bot puder mandar
 * template), é `mensagem` com `tipo = 'template'` agrupada por dia, com
 * `entregue_em`, `lida_em`, `estado_entrega = 'falhou'`/`erro_codigo`, e a
 * resposta amarrada por `disparo_id`.
 */
export async function carregarMensagensAtivas(
  _fluxoId: string,
  _intervalo: Intervalo,
  _template: string | null,
): Promise<DadosDeMensagensAtivas> {
  return { status: [], respostasPorHora: Array<number>(24).fill(0), falhas: [], templates: [] };
}
