import { sql } from 'drizzle-orm';
import {
  contarClosures,
  timeAteFirstResposta,
  attendanceTime,
  timeInQueue,
} from '@pipe/core';
import type { ConversationEvents, ClosedBy, EventAttendance, TipoEvento } from '@pipe/core';
import { databaseOwner, noTenant } from './database.js';

/**
 * Aggregation queue closes the previous day's `metrica_diaria`. Every metric derives from `evento_atendimento`, never a mutable conversation field, so historical data can be recalculated when a metric definition changes (data model §4). The routine is idempotent: rerunning a day overwrites its row instead of adding to it. The math lives in `@pipe/core`; this file only maps database rows to `ConversaEventos` and metric results to columns.
 */

/** The tenant time zone determines the start of a day; a UTC report would mislead the client. */
const FUSO_PADRAO = process.env['PIPE_FUSO_PADRAO'] ?? 'America/Sao_Paulo';

export interface SummaryAggregation {
  tenantId: string;
  dia: string;
  linhas: number;
}

/** `YYYY-MM-DD` do dia anterior ao instante dado, no fuso informado. */
export function diaAnterior(agora: Date = new Date(), fuso: string = FUSO_PADRAO): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const anterior = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) - 1));
  return anterior.toISOString().slice(0, 10);
}

type LinhaEvento = {
  conversa_id: string;
  tipo: TipoEvento;
  em: Date | string;
  usuario_id: string | null;
  fila_id: string | null;
  dados: { encerrada_por?: ClosedBy } | null;
};

/**
 * Aggregate the previous day for all active tenants each night. The owner role runs the `select` of tenants; the app role reads business data.
 */
export async function agregarDiaAnterior(agora: Date = new Date()): Promise<SummaryAggregation[]> {
  const { rows: tenants } = await databaseOwner().execute<{ id: string; fuso: string }>(
    sql`select id, fuso from tenant where ativo`,
  );

  const resumos: SummaryAggregation[] = [];
  // Run serially: each tenant opens its own transaction.
  for (const tenant of tenants) {
    const dia = diaAnterior(agora, tenant.fuso || FUSO_PADRAO);
    resumos.push(await agregarDia(tenant.id, dia, tenant.fuso || FUSO_PADRAO));
  }
  return resumos;
}

export async function agregarDia(
  tenantId: string,
  dia: string,
  fuso: string = FUSO_PADRAO,
): Promise<SummaryAggregation> {
  return noTenant(tenantId, async (tx) => {
    const { rows: eventos } = await tx.execute<LinhaEvento>(sql`
      select conversa_id, tipo, em, usuario_id, fila_id, dados
        from evento_atendimento
       where em >= (${dia}::date)::timestamp at time zone ${fuso}
         and em <  (${dia}::date + 1)::timestamp at time zone ${fuso}
       order by em
    `);

    const { rows: mensagens } = await tx.execute<{
      fila_id: string | null;
      atendente_id: string | null;
      direcao: string;
      total: string;
    }>(sql`
      select c.fila_id, c.atendente_id, m.direcao, count(*)::text as total
        from mensagem m
        join conversa c on c.id = m.conversa_id
       where m.criada_em >= (${dia}::date)::timestamp at time zone ${fuso}
         and m.criada_em <  (${dia}::date + 1)::timestamp at time zone ${fuso}
         and m.direcao in ('entrada', 'saida')
       group by c.fila_id, c.atendente_id, m.direcao
    `);

    const byConversation = agruparByConversation(eventos);
    const linhas = montarLinhas(byConversation, mensagens);

    // Run in series; never use `Promise.all` inside this transaction (see README).
    for (const linha of linhas) {
      await tx.execute(sql`
        insert into metrica_diaria (
          tenant_id, dia, dimensao_tipo, dimensao_id,
          conversas_criadas, conversas_encerradas, conversas_perdidas, conversas_abandonadas,
          mensagens_entrada, mensagens_saida,
          espera_fila_seg, espera_fila_n, primeira_resposta_seg, primeira_resposta_n,
          atendimento_seg, atendimento_n, sla_cumpridos, sla_estourados, atualizado_em
        ) values (
          ${tenantId}, ${dia}, ${linha.dimensaoTipo}, ${linha.dimensaoId},
          ${linha.conversationsCreated}, ${linha.conversationsCloseds},
          ${linha.conversationsPerdidas}, ${linha.conversationsAbandonadas},
          ${linha.messagesInbound}, ${linha.messagesOutput},
          ${linha.waitQueueSeg}, ${linha.waitQueueN},
          ${linha.firstResponseSeg}, ${linha.firstResponseN},
          ${linha.attendanceSeg}, ${linha.attendanceN},
          ${linha.slaCumpridos}, ${linha.slaEstourados}, now()
        )
        on conflict (tenant_id, dia, dimensao_tipo, dimensao_id) do update set
          conversas_criadas = excluded.conversas_criadas,
          conversas_encerradas = excluded.conversas_encerradas,
          conversas_perdidas = excluded.conversas_perdidas,
          conversas_abandonadas = excluded.conversas_abandonadas,
          mensagens_entrada = excluded.mensagens_entrada,
          mensagens_saida = excluded.mensagens_saida,
          espera_fila_seg = excluded.espera_fila_seg,
          espera_fila_n = excluded.espera_fila_n,
          primeira_resposta_seg = excluded.primeira_resposta_seg,
          primeira_resposta_n = excluded.primeira_resposta_n,
          atendimento_seg = excluded.atendimento_seg,
          atendimento_n = excluded.atendimento_n,
          sla_cumpridos = excluded.sla_cumpridos,
          sla_estourados = excluded.sla_estourados,
          atualizado_em = now()
      `);
    }

    return { tenantId, dia, linhas: linhas.length };
  });
}

interface ConversationOfDay {
  conversation: ConversationEvents;
  queueId: string | null;
  agentId: string | null;
  slaEstourado: boolean;
  criada: boolean;
  encerrada: boolean;
}

function agruparByConversation(eventos: readonly LinhaEvento[]): ConversationOfDay[] {
  const mapa = new Map<string, ConversationOfDay>();

  for (const linha of eventos) {
    let item = mapa.get(linha.conversa_id);
    if (!item) {
      item = {
        conversation: { conversationId: linha.conversa_id, eventos: [] },
        queueId: null,
        agentId: null,
        slaEstourado: false,
        criada: false,
        encerrada: false,
      };
      mapa.set(linha.conversa_id, item);
    }

    const evento: EventAttendance = {
      conversationId: linha.conversa_id,
      tipo: linha.tipo,
      em: linha.em instanceof Date ? linha.em : new Date(linha.em),
      userId: linha.usuario_id,
      queueId: linha.fila_id,
      encerradaBy: linha.dados?.encerrada_por ?? null,
    };
    (item.conversation.eventos as EventAttendance[]).push(evento);

    if (linha.fila_id) item.queueId = linha.fila_id;
    if (linha.usuario_id) item.agentId = linha.usuario_id;
    if (linha.tipo === 'sla_estourado') item.slaEstourado = true;
    if (linha.tipo === 'criada') item.criada = true;
    if (linha.tipo === 'encerrada') item.encerrada = true;
  }

  return [...mapa.values()];
}

interface LinhaMetrica {
  dimensaoTipo: 'fila' | 'atendente';
  dimensaoId: string;
  conversationsCreated: number;
  conversationsCloseds: number;
  conversationsPerdidas: number;
  conversationsAbandonadas: number;
  messagesInbound: number;
  messagesOutput: number;
  waitQueueSeg: number;
  waitQueueN: number;
  firstResponseSeg: number;
  firstResponseN: number;
  attendanceSeg: number;
  attendanceN: number;
  slaCumpridos: number;
  slaEstourados: number;
}

function montarLinhas(
  conversations: readonly ConversationOfDay[],
  messages: readonly {
    fila_id: string | null;
    atendente_id: string | null;
    direcao: string;
    total: string;
  }[],
): LinhaMetrica[] {
  const linhas: LinhaMetrica[] = [];

  for (const dimensaoTipo of ['fila', 'atendente'] as const) {
    const key = (item: ConversationOfDay) =>
      dimensaoTipo === 'fila' ? item.queueId : item.agentId;

    const groups = new Map<string | null, ConversationOfDay[]>();
    for (const item of conversations) {
      const k = key(item);
      const atual = groups.get(k);
      if (atual) atual.push(item);
      else groups.set(k, [item]);
    }

    for (const [dimensaoId, grupo] of groups) {
      // Without a dimension there is no row: `metrica_diaria_uk` includes `dimensao_id`, and
      // Postgres treats two NULLs as distinct in a unique index; a row without a queue would
      // inserida de novo a cada reprocessamento em vez de ser sobrescrita.
      if (dimensaoId === null) continue;
      const eventos = grupo.map((g) => g.conversation);
      const closures = contarClosures(eventos);
      const queue = timeInQueue(eventos);
      const first = timeAteFirstResposta(eventos);
      const attendance = attendanceTime(eventos);
      const estourados = grupo.filter((g) => g.slaEstourado).length;

      const count = (direction: string) =>
        messages
          .filter(
            (m) =>
              (dimensaoTipo === 'fila' ? m.fila_id : m.atendente_id) === dimensaoId &&
              m.direcao === direction,
          )
          .reduce((soma, m) => soma + Number(m.total), 0);

      linhas.push({
        dimensaoTipo,
        dimensaoId,
        conversationsCreated: grupo.filter((g) => g.criada).length,
        conversationsCloseds: closures.fechada,
        conversationsPerdidas: closures.perdida,
        conversationsAbandonadas: closures.abandonada,
        messagesInbound: count('entrada'),
        messagesOutput: count('saida'),
        // Keep the sum and denominator together; calculate the average when displaying it,
        // because averaging daily averages is misleading (metrics spec §5).
        waitQueueSeg: Math.round(queue.soma),
        waitQueueN: queue.population,
        firstResponseSeg: Math.round(first.soma),
        firstResponseN: first.population,
        attendanceSeg: Math.round(attendance.soma),
        attendanceN: attendance.population,
        slaCumpridos: Math.max(0, closures.fechada - estourados),
        slaEstourados: estourados,
      });
    }
  }

  return linhas;
}
