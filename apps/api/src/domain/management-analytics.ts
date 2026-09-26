import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import {
  NAME_OF_CHANNEL,
  diasDoIntervalo,
  intervaloAnterior,
  type ArestaDaJornada,
  type ActiveMessagesData,
  type DashboardData,
  type Intervalo,
  type InstantsWindow,
  type ReportCustom,
  type VisaoGeral,
} from '@pipe/core/analytics';
import {
  conditionOfCursor,
  assemblePage,
  orderSql,
  type Cursor,
  type Page,
} from '../pagination.js';

/**
 * Read contact ANALYSIS (`/fluxo/:id/analise/**`) from the database. These queries moved from `apps/gestao/src/lib/analise.ts` and `analise-portal.ts` with query logic intact; the caller supplies a transaction with tenant fixed. Pure period, formatting, and type logic stays in `@pipe/core/analise`.
 */

/** An interval of instants already in the account time zone; see `janelaDeDatas` in banco.ts. */
export async function windowOfDates(
  tx: TransactionPipe,
  fuso: string,
  de: string,
  ate: string,
): Promise<InstantsWindow> {
  const r = await tx.execute<{ start: Date; end: Date }>(
    sql`select (${de}::date)::timestamp at time zone ${fuso} as start,
               ((${ate}::date + 1)::timestamp) at time zone ${fuso} as "end"`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('período inválido');
  return { inicio: new Date(linha.start), fim: new Date(linha.end) };
}

/**
 * The contact Dashboard comes from the database. `api/src/dominio/fluxo.ts` writes an `execucao_fluxo` for each bot conversation, bot messages, and handoff (`enfileirada` with `dados.origem = 'fluxo'`). Contacts, messages, recurrence, retention, and handoff count conversations where this flow ran, including human attendance messages as the source Data Dictionary states. `excecao`, `blocosExcecao`, and `blocosTransbordo` stay empty: Pipe has no exception block, and `execucao_passo` does not mark the handoff block. Once it does, `group by bloco_id`. The router now routes contacts through services (`apps/api/src/dominio/roteador.ts`), but this Dashboard still does not aggregate service flows as the source does; its SQL filters one `fluxoId`. Source wording: "Inclui, também, mensagens trafegadas no Desk".
 */
export async function carregarDashboard(
  tx: TransactionPipe,
  fluxoId: string,
  intervalo: Intervalo,
  fuso: string,
): Promise<DashboardData | null> {
  const anterior = intervaloAnterior(intervalo);
  {
    const { rows: contact } = await tx.execute<{ type: string; channel: string | null }>(
      sql`select f.tipo, k.tipo as canal from fluxo f left join canal k on k.id = f.canal_id where f.id = ${fluxoId}`,
    );
    if (!contact[0]) return null;

    const medir = async (i: Intervalo) => {
      /*
       * One `rollup` per day yields daily rows plus a row with null `dia` for the whole period; the period `count(distinct)` is not the sum of daily counts.
       */
      const { rows } = await tx.execute<{
        dia: string | null;
        enviadas: number;
        recebidas: number;
        total: number;
        withInteraction: number;
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
               count(distinct contato_id) filter (where direcao = 'entrada')::int as "withInteraction",
               (select count(*) from dias where n >= 2)::int as recorrentes
          from msg
         group by rollup (dia)
         order by dia nulls first
      `);
      const [soma, ...byDay] = rows;
      const { rows: flow } = await tx.execute<{ total: number; transbordo: number }>(sql`
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
      /*
       * `rollup` returns the total row even without messages. Empty days are missing, though the source chart labels every day.
       */
      const doDia = new Map(byDay.map((d) => [d.dia, d]));
      return {
        soma,
        porDia: diasDoIntervalo(i).map((d) => ({
          dia: d,
          enviadas: doDia.get(d)?.enviadas ?? 0,
          recebidas: doDia.get(d)?.recebidas ?? 0,
          total: doDia.get(d)?.total ?? 0,
          com_interacao: doDia.get(d)?.withInteraction ?? 0,
        })),
        fluxo: flow[0],
      };
    };

    const [agora, antes] = [await medir(intervalo), await medir(anterior)];
    const par = (f: (m: typeof agora) => number | undefined) => ({
      atual: f(agora) ?? 0,
      anterior: f(antes) ?? 0,
    });

    const { rows: topo } = await tx.execute<{
      name: string | null;
      phone: string | null;
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

    const channel = contact[0].channel;
    return {
      router: contact[0].type === 'roteador',
      channel: channel ? (NAME_OF_CHANNEL[channel] ?? channel) : null,
      contacts: {
        withInteraction: par((m) => m.soma?.withInteraction),
        total: par((m) => m.soma?.total),
        byDay: agora.porDia.map((d) => ({
          dia: d.dia,
          withInteraction: d.com_interacao,
          total: d.total,
        })),
      },
      messages: {
        enviadas: par((m) => m.soma?.enviadas),
        recebidas: par((m) => m.soma?.recebidas),
        byDay: agora.porDia.map((d) => ({
          dia: d.dia,
          enviadas: d.enviadas,
          recebidas: d.recebidas,
        })),
      },
      recorrencia: {
        contacts: par((m) => m.soma?.recorrentes),
        maisRecorrentes: topo.map((t) => ({
          nome: t.name ?? t.id,
          recorrencia: t.recorrencia,
          telefone: t.phone,
        })),
      },
      flow: {
        transbordo: par((m) => m.fluxo?.transbordo),
        total: par((m) => m.fluxo?.total),
        exception: null,
      },
      blocksException: [],
      blocosTransbordo: [],
    };
  }
}

/**
 * The "Número de Contatos" sidebar (`uw`) lists those who interacted or did not respond during the period, following source `/metrics/contacts/engaged` and `/metrics/sidebar/ContactsRejection`. Display the name, or phone if absent (`name ?? identity` there). The source fetches 20 at a time while scrolling; here the 1,000 most recent arrive at once, matching the "Exportar lista" hint.
 */
export async function loadListOfContacts(
  tx: TransactionPipe,
  flowId: string,
  intervalo: Intervalo,
  fuso: string,
  tipo: 'interacao' | 'rejeicao',
): Promise<string[]> {
  {
    const { rows } = await tx.execute<{ name: string }>(sql`
      select coalesce(c.nome, c.telefone_e164, c.id::text) as nome
        from mensagem m
        join conversa cv on cv.id = m.conversa_id
        join contato c on c.id = cv.contato_id
       where m.direcao in ('entrada', 'saida')
         and exists (select 1 from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
                      where e.conversa_id = cv.id and v.fluxo_id = ${flowId})
         and m.criada_em >= (${intervalo.inicio}::date)::timestamp at time zone ${fuso}
         and m.criada_em < ((${intervalo.fim}::date + 1)::timestamp) at time zone ${fuso}
       group by c.id
      having (count(*) filter (where m.direcao = 'entrada') > 0) = ${tipo === 'interacao'}
       order by max(m.criada_em) desc
       limit 1000
    `);
    return rows.map((r) => r.name);
  }
}

/**
 * Active messages for this contact have no Pipe equivalent today. In the source, the BOT sends them more than 24 hours after the customer's last message. Pipe's bot only replies (`gravarRespostaDoBot` always stores `dentro_da_janela = true`), and campaign template sends have no flow attribution. Return the source's empty response so the screen shows zeros. Once template sends have `fluxo_id` or the bot can send templates, group `mensagem` rows with `tipo = 'template'` by day, using `entregue_em`, `lida_em`, `estado_entrega = 'falhou'`/`erro_codigo`, and replies linked by `disparo_id`.
 */
export async function loadMessagesActive(
  _tx: TransactionPipe,
  _flowId: string,
  _intervalo: Intervalo,
  _template: string | null,
): Promise<ActiveMessagesData> {
  return { status: [], responsesByHour: Array<number>(24).fill(0), falhas: [], templates: [] };
}



type Linha = Record<string, unknown>;

/**
 * The source "chatbot" is the contact. Count messages from conversations where any version of this flow ran (`execucao_fluxo`). Include human attendance as the source does: `metrics.overviewHelp.info1` states that the report includes contact and message traffic during human attendance. Internal notes are excluded because they are not traffic. Source wording: "contabiliza todos os contatos e mensagens trafegadas, incluindo interações durante o atendimento humano".
 */
export async function carregarVisaoGeral(
  tx: TransactionPipe,
  fluxoId: string,
  period: InstantsWindow,
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
       where m.criada_em >= ${period.inicio} and m.criada_em < ${period.fim}
         and m.direcao <> 'interna'
    )`;

  {
    const linhas = async <T extends Linha>(query: ReturnType<typeof sql>) =>
      (await tx.execute<T>(query)).rows;
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

    const channels = await linhas(sql`${base}
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
      byDay: dias.map((d) => ({
        dia: String(d.dia),
        ativos: n(d.ativos),
        engajados: n(d.engajados),
        recebidas: n(d.recebidas),
        enviadas: n(d.enviadas),
      })),
      activeByChannel: channels.map((d) => ({ channel: String(d.canal), total: n(d.total) })),
    };
  }
}



/**
 * Custom reports are always empty: Pipe has no report table or chart editor. The screen stops at "Nenhum relatório encontrado :(". To implement this, add a `relatorio` table (name, owner, private flag, `modificado_em`) with its charts, and read public reports plus the person's private reports as source `getReports()` does.
 */
export async function loadReports(_tx: TransactionPipe): Promise<ReportCustom[]> {
  return [];
}

/* ------------------------------------------------------ Jornada dos Contatos */

/**
 * Build journey edges from each execution's path in `execucao_passo`: step `n` connects block `n` to `n+1`, and the final block connects to "Saída". Preserve the stage in brackets on node names, as source `getNodeNameWithoutInstance()` removes it; otherwise the same block in different stages can form a false cycle. The source has an "Outros" node (`#others`) for low-volume blocks. Here every branch is drawn; for very large flows, keep the top N per stage and sum the rest into an edge with `tipo: 'outros'`.
 */
export async function carregarJornada(
  tx: TransactionPipe,
  fluxoId: string,
  periodo: InstantsWindow,
): Promise<ArestaDaJornada[]> {
  {
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
      quantity: Number(r.quantidade),
      tipo: r.saida ? 'saida' : 'regular',
    }));
  }
}

/* ============================================================== Log de mensagens */

export interface LinhaDoLog {
  id: string;
  criadaEm: string;
  direction: string;
  type: string;
  content: string | null;
  metadata: unknown;
  de: string | null;
  para: string | null;
}

export interface LogFilter {
  /** `AAAA-MM-DD`, no fuso da conta — mesmo formato de `intervaloDoPeriodo`. */
  de?: string;
  ate?: string;
  direction?: string;
  type?: string;
  search?: string;
}

/**
 * Message Log follows source `MessagesController`/`MessageService.getMessages`. Source period, direction, and type labels become real filters, with cursor pagination instead of fixed `take: 30` (`apis.md` §5.3; see `controladores/conversas.ts#mensagens`). Scope to bot-channel conversations (`fluxo.canal_id` to `inbox.canal_id`), as in `carregarLogsDoFluxo`, rather than `execucao_fluxo`: the Log includes human attendance after handoff. `mensagem` has no direct `canal_id` index, so Postgres scans channel conversations through `conversa_inbox_idx` (migration 0040), then messages by `conversa_id` through `mensagem_conversa_idx`. This suits a small channel but costs more with hundreds of thousands of closed conversations. If needed, fill a denormalized `canal_id` on `mensagem` during writes.
 */
export async function loadLogOfMessages(
  tx: TransactionPipe,
  fluxoId: string,
  fuso: string,
  filter: LogFilter,
  cursor: Cursor | null,
  limite: number,
): Promise<Page<LinhaDoLog>> {
  const { rows: bot } = await tx.execute<{ channelId: string | null }>(
    sql`select canal_id as "channelId" from fluxo where id = ${fluxoId}`,
  );
  const channelId = bot[0]?.channelId ?? null;
  if (!channelId) return { data: [], page_info: { has_next_page: false, end_cursor: null } };

  const filterSearch = filter.search?.trim() ? sql`m.conteudo ilike ${`%${filter.search.trim()}%`}` : sql`true`;
  const filterDirection = filter.direction ? sql`m.direcao = ${filter.direction}` : sql`true`;
  const filterType = filter.type ? sql`m.tipo = ${filter.type}` : sql`true`;
  const filterOf = filter.de
    ? sql`m.criada_em >= (${filter.de}::date)::timestamp at time zone ${fuso}`
    : sql`true`;
  const filterUntil = filter.ate
    ? sql`m.criada_em < ((${filter.ate}::date + 1)::timestamp) at time zone ${fuso}`
    : sql`true`;

  const { rows } = await tx.execute<{
    id: string;
    criada_em: Date | string;
    direction: string;
    type: string;
    content: string | null;
    metadata: unknown;
    contact: string | null;
    channel: string;
  }>(sql`
    select m.id, m.criada_em, m.direcao as direction, m.tipo as type, m.conteudo as content,
           m.dados as metadata,
           coalesce(ct.nome, ct.telefone_e164) as contact, ca.nome as channel
      from mensagem m
      join conversa cv on cv.id = m.conversa_id
      join contato ct on ct.id = cv.contato_id
      join inbox i on i.id = cv.inbox_id
      join canal ca on ca.id = i.canal_id
     where i.canal_id = ${channelId}
       and ${filterSearch} and ${filterDirection} and ${filterType} and ${filterOf} and ${filterUntil}
       and ${conditionOfCursor('m.criada_em', 'timestamptz', 'desc', cursor, 'm.id')}
     order by ${orderSql('m.criada_em', 'desc', 'm.id')}
     limit ${limite + 1}
  `);

  const page = assemblePage(rows, limite, (linha) => ({
    value: new Date(linha.criada_em).toISOString(),
    id: linha.id,
  }));
  return {
    ...page,
    data: page.data.map((linha) => ({
      id: linha.id,
      criadaEm: new Date(linha.criada_em).toISOString(),
      direction: linha.direction,
      type: linha.type,
      content: linha.content,
      metadata: linha.metadata,
      de: linha.direction === 'entrada' ? linha.contact : linha.channel,
      para: linha.direction === 'entrada' ? linha.channel : linha.contact,
    })),
  };
}
