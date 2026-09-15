import { sql } from 'drizzle-orm';
import { consultar } from './banco';

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

type Linha = Record<string, unknown>;

export interface Periodo {
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

export interface AtivasPorCanal {
  canal: string;
  total: number;
}

export interface VisaoGeral {
  contagens: ContagensDaVisaoGeral;
  porDia: DiaDaVisaoGeral[];
  ativasPorCanal: AtivasPorCanal[];
}

/**
 * O "chatbot" da origem é o contato; as mensagens DELE, aqui, são as das
 * conversas por onde alguma versão deste fluxo passou (`execucao_fluxo`).
 * Entra o atendimento humano junto, como lá: `metrics.overviewHelp.info1` diz
 * que o relatório "contabiliza todos os contatos e mensagens trafegadas,
 * incluindo interações durante o atendimento humano". Nota interna não é
 * mensagem trafegada e fica fora.
 */
export async function carregarVisaoGeral(
  fluxoId: string,
  periodo: Periodo,
  fuso: string,
): Promise<VisaoGeral> {
  const base = sql`
    with conversas as (
      select distinct ef.conversa_id as id
        from execucao_fluxo ef
        join fluxo_versao fv on fv.id = ef.fluxo_versao_id
       where fv.fluxo_id = ${fluxoId} and ef.conversa_id is not null
    ),
    msgs as (
      select m.direcao, m.dentro_da_janela, c.contato_id, i.canal_id,
             to_char((m.criada_em at time zone ${fuso})::date, 'YYYY-MM-DD') as dia
        from mensagem m
        join conversas cv on cv.id = m.conversa_id
        join conversa c on c.id = m.conversa_id
        join inbox i on i.id = c.inbox_id
       where m.criada_em >= ${periodo.inicio} and m.criada_em < ${periodo.fim}
         and m.direcao <> 'interna'
    )`;

  return consultar(async (tx) => {
    const linhas = async <T extends Linha>(consulta: ReturnType<typeof sql>) =>
      (await tx.execute<T>(consulta)).rows;
    const n = (v: unknown) => Number(v ?? 0);

    const [c] = await linhas(sql`${base}
      select count(distinct contato_id) as ativos,
             count(distinct contato_id) filter (where direcao = 'entrada') as engajados,
             count(*) as total,
             count(*) filter (where direcao = 'entrada') as recebidas,
             count(*) filter (where direcao = 'saida') as enviadas,
             count(*) filter (where direcao = 'saida' and dentro_da_janela = false) as ativas
        from msgs`);

    const dias = await linhas(sql`${base}
      select dia,
             count(distinct contato_id) as ativos,
             count(distinct contato_id) filter (where direcao = 'entrada') as engajados,
             count(*) filter (where direcao = 'entrada') as recebidas,
             count(*) filter (where direcao = 'saida') as enviadas
        from msgs group by dia order by dia`);

    const canais = await linhas(sql`${base}
      select ca.nome as canal, count(*) as total
        from msgs join canal ca on ca.id = msgs.canal_id
       where direcao = 'saida' and dentro_da_janela = false
       group by ca.nome order by total desc`);

    return {
      contagens: {
        ativos: n(c?.ativos),
        engajados: n(c?.engajados),
        total: n(c?.total),
        recebidas: n(c?.recebidas),
        enviadas: n(c?.enviadas),
        ativas: n(c?.ativas),
      },
      porDia: dias.map((d) => ({
        dia: String(d.dia),
        ativos: n(d.ativos),
        engajados: n(d.engajados),
        recebidas: n(d.recebidas),
        enviadas: n(d.enviadas),
      })),
      ativasPorCanal: canais.map((d) => ({ canal: String(d.canal), total: n(d.total) })),
    };
  });
}

/* ------------------------------------------------ Relatórios Personalizados */

/** Um item de `AnalyticsReportsService.getMany`, já com o `handleReport` aplicado. */
export interface RelatorioPersonalizado {
  id: string;
  nome: string | null;
  /** `owner.fullName || owner.email`. */
  criadoPor: string;
  modificadoEm: Date | null;
  /** `owner.email === email da pessoa`: só o dono vê editar e excluir. */
  souDono: boolean;
}

/**
 * ponytail: sempre vazia. O Pipe não tem relatório personalizado — nem tabela,
 * nem editor de gráfico. Teto: a tela fica no estado "Nenhum relatório
 * encontrado :(". Caminho: uma tabela `relatorio` (nome, dono, privado,
 * modificado_em) com os gráficos dela, e esta função lendo os públicos mais os
 * privados da pessoa — o mesmo filtro do `getReports()` da origem.
 */
export async function carregarRelatorios(): Promise<RelatorioPersonalizado[]> {
  return [];
}

/* ------------------------------------------------------ Jornada dos Contatos */

/** `$e` da origem: `Regular`, `Other` e `End`. */
export type TipoDeAresta = 'regular' | 'outros' | 'saida';

/** Uma aresta do `getJourneyEdges`: `from`, `to`, `count`, `step`, `type`. */
export interface ArestaDaJornada {
  de: string;
  para: string;
  passo: number;
  quantidade: number;
  tipo: TipoDeAresta;
}

/**
 * As arestas da jornada, tiradas do caminho de cada execução em
 * `execucao_passo`: o passo `n` liga o bloco `n` ao bloco `n+1`, e o último
 * bloco de cada execução liga à "Saída". O nó leva a etapa entre colchetes —
 * é o que `getNodeNameWithoutInstance()` desfaz na origem, e o que impede o
 * mesmo bloco em etapas diferentes de virar ciclo no diagrama.
 *
 * ponytail: sem o nó "Outros" (`#others`), que na origem junta os blocos de
 * pouco volume. Teto: fluxo com muitos ramos desenha todos. Caminho: cortar
 * por etapa os N maiores e somar o resto numa aresta `tipo: 'outros'`.
 */
export async function carregarJornada(
  fluxoId: string,
  periodo: Periodo,
): Promise<ArestaDaJornada[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<Linha>(sql`
      with passos as (
        select ep.execucao_id, b.nome,
               row_number() over (partition by ep.execucao_id order by ep.em, ep.id) as n
          from execucao_passo ep
          join execucao_fluxo ef on ef.id = ep.execucao_id
          join fluxo_versao fv on fv.id = ef.fluxo_versao_id
          join bloco b on b.id = ep.bloco_id
         where fv.fluxo_id = ${fluxoId}
           and ef.iniciada_em >= ${periodo.inicio} and ef.iniciada_em < ${periodo.fim}
      )
      select a.nome || ' [' || a.n || ']' as de,
             coalesce(b.nome || ' [' || b.n || ']', 'Saída [' || (a.n + 1) || ']') as para,
             a.n as passo,
             (b.execucao_id is null) as saida,
             count(*) as quantidade
        from passos a
        left join passos b on b.execucao_id = a.execucao_id and b.n = a.n + 1
       group by 1, 2, 3, 4
       order by 3`);
    return rows.map((r) => ({
      de: String(r.de),
      para: String(r.para),
      passo: Number(r.passo),
      quantidade: Number(r.quantidade),
      tipo: r.saida ? 'saida' : 'regular',
    }));
  });
}
