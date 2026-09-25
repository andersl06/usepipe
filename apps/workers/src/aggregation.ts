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
 * Fila de agregação: fecha `metrica_diaria` do dia anterior.
 *
 * Toda métrica sai de `evento_atendimento`, nunca de campo mutável da conversa —
 * é o que permite recalcular o passado quando a definição de uma métrica muda
 * (modelo de dados §4). Por isso a rotina é **idempotente**: rodar de novo para o
 * mesmo dia sobrescreve a linha em vez de somar em cima.
 *
 * A matemática vive em `@pipe/core` e não é reescrita aqui. Este arquivo só traduz
 * linha de banco em `ConversaEventos` e resultado de métrica em coluna.
 */

/** Fuso do tenant decide onde o dia começa. Relatório em UTC mente para o cliente. */
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
  conversationId: string;
  type: TipoEvento;
  at: Date | string;
  userId: string | null;
  queueId: string | null;
  data: { closedBy?: ClosedBy } | null;
};

/**
 * Agrega o dia para todos os tenants ativos. Roda de madrugada, uma vez por dia.
 * O `select` de tenants usa o papel dono; toda leitura de negócio, o da aplicação.
 */
export async function agregarDiaAnterior(agora: Date = new Date()): Promise<SummaryAggregation[]> {
  const { rows: tenants } = await databaseOwner().execute<{ id: string; fuso: string }>(
    sql`select id, fuso from tenant where ativo`,
  );

  const resumos: SummaryAggregation[] = [];
  // Em série: cada tenant abre a própria transação.
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
      queueId: string | null;
      agentId: string | null;
      direction: string;
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

    // Em série (nunca `Promise.all` dentro da transação — ver README).
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
    let item = mapa.get(linha.conversationId);
    if (!item) {
      item = {
        conversation: { conversationId: linha.conversationId, eventos: [] },
        queueId: null,
        agentId: null,
        slaEstourado: false,
        criada: false,
        encerrada: false,
      };
      mapa.set(linha.conversationId, item);
    }

    const evento: EventAttendance = {
      conversationId: linha.conversationId,
      tipo: linha.tipo,
      em: linha.em instanceof Date ? linha.em : new Date(linha.em),
      userId: linha.userId,
      queueId: linha.fila_id,
      encerradaBy: linha.data?.closedBy ?? null,
    };
    (item.conversation.eventos as EventAttendance[]).push(evento);

    if (linha.fila_id) item.queueId = linha.fila_id;
    if (linha.userId) item.agentId = linha.userId;
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
    queueId: string | null;
    agentId: string | null;
    direction: string;
    total: string;
  }[],
): LinhaMetrica[] {
  const linhas: LinhaMetrica[] = [];

  for (const dimensaoTipo of ['fila', 'atendente'] as const) {
    const key = (item: ConversationOfDay) =>
      dimensaoTipo === 'queue' ? item.queueId : item.agentId;

    const groups = new Map<string | null, ConversationOfDay[]>();
    for (const item of conversations) {
      const k = key(item);
      const atual = groups.get(k);
      if (atual) atual.push(item);
      else groups.set(k, [item]);
    }

    for (const [dimensaoId, grupo] of groups) {
      // Sem dimensão não há linha: `metrica_diaria_uk` inclui `dimensao_id`, e no
      // Postgres dois NULL são distintos num índice único — a linha "sem fila" seria
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
              (dimensaoTipo === 'queue' ? m.fila_id : m.atendente_id) === dimensaoId &&
              m.direction === direction,
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
        // Soma e denominador viajam juntos: a média é feita na hora de exibir,
        // porque média de médias entre dias mente (spec de métricas §5).
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
