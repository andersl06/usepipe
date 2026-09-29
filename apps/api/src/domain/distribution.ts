import { sql } from 'drizzle-orm';
import { chooseAgent } from '@pipe/core';
import type { AgentAvailable, ChoiceDistribution, StateAgent } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { emitir } from '../webhooks-saida.js';
import { registrarEvento } from './eventos.js';

/**
 * Distribute by actual load (spec §4.3, metrics spec §7). `@pipe/core` owns the decision; this file collects agent state for `escolherAtendente` rather than reimplementing weighted-load tie breaking in `api`. The core rule has table-driven tests.
 */

type LineAgent = {
  id: string;
  state: StateAgent;
  limit: number;
  ativas: string;
  waitingAgent: string;
  withoutFirstResponse: string;
  lastAssignmentAt: Date | string | null;
};

export async function candidatesOfQueue(
  tx: TransactionPipe,
  filaId: string,
): Promise<AgentAvailable[]> {
  const { rows } = await tx.execute<LineAgent>(sql`
    select u.id,
           coalesce(s.estado, 'offline') as state,
           coalesce(fa.capacidade_override, f.capacidade_padrao) as "limit",
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and (c.ultima_mensagem_de is distinct from 'atendente'))::text
             as "waitingAgent",
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and c.primeira_resposta_em is null)::text as "withoutFirstResponse",
           (select max(c.atribuida_em) from conversa c
             where c.atendente_id = u.id) as "lastAssignmentAt"
      from fila_atendente fa
      join usuario u on u.id = fa.usuario_id and u.ativo
      join fila f on f.id = fa.fila_id
      left join status_atendente s on s.usuario_id = u.id
     where fa.fila_id = ${filaId}
  `);

  return rows.map((linha) => ({
    id: linha.id,
    state: linha.state,
    queues: [filaId],
    limiteSimultaneo: Number(linha.limit),
    ativas: Number(linha.ativas),
    waitingAgent: Number(linha.waitingAgent),
    withoutFirstResponse: Number(linha.withoutFirstResponse),
    lastAssignmentIn:
      linha.lastAssignmentAt === null
        ? null
        : linha.lastAssignmentAt instanceof Date
          ? linha.lastAssignmentAt
          : new Date(linha.lastAssignmentAt),
  }));
}

/**
 * Invert the same lookup as `candidatosDaFila`: one agent across ALL their queues, one row per queue. Manual claim (`atender` in `desk/acoes.ts`) passes this to `@pipe/core` `motivoInelegivel`, so capacity follows the same calculation as automatic distribution; previously manual claims ignored the limit (Desk audit item 8). `ativas` is the agent's total, not per queue: capacity counts all simultaneous conversations, while the queue chooses which limit applies.
 */
export async function queuesOfAgent(
  tx: TransactionPipe,
  agentId: string,
): Promise<AgentAvailable[]> {
  const { rows } = await tx.execute<LineAgent & { queueId: string }>(sql`
    select u.id, fa.fila_id as "queueId",
           coalesce(s.estado, 'offline') as state,
           coalesce(fa.capacidade_override, f.capacidade_padrao) as "limit",
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and (c.ultima_mensagem_de is distinct from 'atendente'))::text
             as "waitingAgent",
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and c.primeira_resposta_em is null)::text as "withoutFirstResponse",
           (select max(c.atribuida_em) from conversa c
             where c.atendente_id = u.id) as "lastAssignmentAt"
      from fila_atendente fa
      join usuario u on u.id = fa.usuario_id and u.ativo
      join fila f on f.id = fa.fila_id
      left join status_atendente s on s.usuario_id = u.id
     where fa.usuario_id = ${agentId}::uuid
  `);

  return rows.map((linha) => ({
    id: linha.id,
    state: linha.state,
    queues: [linha.queueId],
    limiteSimultaneo: Number(linha.limit),
    ativas: Number(linha.ativas),
    waitingAgent: Number(linha.waitingAgent),
    withoutFirstResponse: Number(linha.withoutFirstResponse),
    lastAssignmentIn:
      linha.lastAssignmentAt === null
        ? null
        : linha.lastAssignmentAt instanceof Date
          ? linha.lastAssignmentAt
          : new Date(linha.lastAssignmentAt),
  }));
}

/** Teto de conversas sem 1ª resposta, por tenant. Ausente desliga o segundo teto. */
export function ceilingWithoutFirstResponse(): number | null {
  const bruto = process.env['PIPE_TETO_SEM_PRIMEIRA_RESPOSTA'];
  return bruto ? Number(bruto) : null;
}

export async function chooseForQueue(
  tx: TransactionPipe,
  queueId: string,
): Promise<ChoiceDistribution> {
  const candidatos = await candidatesOfQueue(tx, queueId);
  return chooseAgent(candidatos, {
    queueId,
    ceilingWithoutFirstResponse: ceilingWithoutFirstResponse(),
  });
}

/**
 * Remove a conversation from its queue and assign it to the agent selected by the rule, if any. This moved from `entrada.ts` because both inbound handling and the bot now call it on transfer.
 */
export async function distributeConversation(
  tx: TransactionPipe,
  tenantId: string,
  conversationId: string,
  filaId: string,
  em: Date,
): Promise<string | null> {
  const escolha = await chooseForQueue(tx, filaId);
  if (!escolha.escolhido) return null;

  const agentId = escolha.escolhido.id;
  await tx.execute(sql`
    update conversa
       set atendente_id = ${agentId}, estado = 'atribuida', atribuida_em = ${em},
           atualizado_em = now()
     where id = ${conversationId} and estado = 'na_fila'
  `);
  await tx.execute(sql`
    insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, em)
    values (${tenantId}, ${conversationId}, ${agentId}, ${filaId}, 'distribuicao_por_carga', ${em})
  `);
  await registrarEvento(tx, {
    tenantId,
    conversationId,
    type: 'atribuida',
    at: em,
    userId: agentId,
    queueId: filaId,
  });
  await emitir(tx, tenantId, 'conversa.atribuida', {
    conversa_id: conversationId,
    atendente_id: agentId,
    fila_id: filaId,
  });
  return agentId;
}
