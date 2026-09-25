import { sql } from 'drizzle-orm';
import { escolherAgent } from '@pipe/core';
import type { AgentDisponivel, EscolhaDistribution, StateAgent } from '@pipe/core';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import { emitir } from '../webhooks-saida.js';
import { registrarEvento } from './eventos.js';

/**
 * Distribuição por carga real (§4.3 da spec, §7 da spec de métricas).
 *
 * A decisão vive em `@pipe/core` e **não** é reimplementada aqui: este arquivo só
 * levanta o estado dos atendentes da fila e entrega para `escolherAtendente`. Assim
 * o desempate por carga ponderada continua tendo uma implementação só, testada com
 * tabela de casos, e a `api` não vira um segundo lugar onde a regra mora.
 */

type LineAgent = {
  id: string;
  state: StateAgent;
  limit: number;
  ativas: string;
  aguardandoAgent: string;
  withoutFirstResponse: string;
  lastAssignmentAt: Date | string | null;
};

export async function candidatosOfQueue(
  tx: TransactionPipe,
  filaId: string,
): Promise<AgentDisponivel[]> {
  const { rows } = await tx.execute<LineAgent>(sql`
    select u.id,
           coalesce(s.estado, 'offline') as estado,
           coalesce(fa.capacidade_override, f.capacidade_padrao) as limite,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and (c.ultima_mensagem_de is distinct from 'atendente'))::text
             as aguardando_atendente,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and c.primeira_resposta_em is null)::text as sem_primeira_resposta,
           (select max(c.atribuida_em) from conversa c
             where c.atendente_id = u.id) as ultima_atribuicao_em
      from fila_atendente fa
      join usuario u on u.id = fa.usuario_id and u.ativo
      join fila f on f.id = fa.fila_id
      left join status_atendente s on s.usuario_id = u.id
     where fa.fila_id = ${filaId}
  `);

  return rows.map((linha) => ({
    id: linha.id,
    estado: linha.state,
    filas: [filaId],
    limiteSimultaneo: Number(linha.limit),
    ativas: Number(linha.ativas),
    aguardandoAtendente: Number(linha.aguardandoAgent),
    semPrimeiraResposta: Number(linha.withoutFirstResponse),
    ultimaAtribuicaoEm:
      linha.lastAssignmentAt === null
        ? null
        : linha.lastAssignmentAt instanceof Date
          ? linha.lastAssignmentAt
          : new Date(linha.lastAssignmentAt),
  }));
}

/**
 * O MESMO levantamento de `candidatosDaFila`, virado ao contrário: UM atendente em
 * TODAS as filas dele, uma linha por fila. É o que a puxada manual (`atender`, em
 * `desk/acoes.ts`) passa para `motivoInelegivel` de `@pipe/core`, para que "tem
 * vaga?" seja respondido pela mesma conta nos dois caminhos — a distribuição
 * automática já respeitava o limite e a puxada manual não (auditoria do Desk, item 8).
 *
 * `ativas` é o total do atendente, e não por fila: o limite é de quantas conversas
 * a pessoa segura ao mesmo tempo, e a fila só decide qual limite vale.
 */
export async function queuesOfAgent(
  tx: TransactionPipe,
  agentId: string,
): Promise<AgentDisponivel[]> {
  const { rows } = await tx.execute<LineAgent & { queueId: string }>(sql`
    select u.id, fa.fila_id,
           coalesce(s.estado, 'offline') as estado,
           coalesce(fa.capacidade_override, f.capacidade_padrao) as limite,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and (c.ultima_mensagem_de is distinct from 'atendente'))::text
             as aguardando_atendente,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and c.primeira_resposta_em is null)::text as sem_primeira_resposta,
           (select max(c.atribuida_em) from conversa c
             where c.atendente_id = u.id) as ultima_atribuicao_em
      from fila_atendente fa
      join usuario u on u.id = fa.usuario_id and u.ativo
      join fila f on f.id = fa.fila_id
      left join status_atendente s on s.usuario_id = u.id
     where fa.usuario_id = ${agentId}::uuid
  `);

  return rows.map((linha) => ({
    id: linha.id,
    estado: linha.state,
    filas: [linha.queueId],
    limiteSimultaneo: Number(linha.limit),
    ativas: Number(linha.ativas),
    aguardandoAtendente: Number(linha.aguardandoAgent),
    semPrimeiraResposta: Number(linha.withoutFirstResponse),
    ultimaAtribuicaoEm:
      linha.lastAssignmentAt === null
        ? null
        : linha.lastAssignmentAt instanceof Date
          ? linha.lastAssignmentAt
          : new Date(linha.lastAssignmentAt),
  }));
}

/** Teto de conversas sem 1ª resposta, por tenant. Ausente desliga o segundo teto. */
export function tetoWithoutFirstResponse(): number | null {
  const bruto = process.env['PIPE_TETO_SEM_PRIMEIRA_RESPOSTA'];
  return bruto ? Number(bruto) : null;
}

export async function escolherForQueue(
  tx: TransactionPipe,
  queueId: string,
): Promise<EscolhaDistribution> {
  const candidatos = await candidatosOfQueue(tx, queueId);
  return escolherAgent(candidatos, {
    queueId,
    tetoWithoutFirstResposta: tetoWithoutFirstResponse(),
  });
}

/**
 * Tira da fila e atribui ao atendente que a regra escolher, se houver um.
 *
 * Morava em `entrada.ts`; mudou para cá porque agora são dois a chamar — a entrada e o
 * bot, quando transfere.
 */
export async function distribuirConversation(
  tx: TransactionPipe,
  tenantId: string,
  conversationId: string,
  filaId: string,
  em: Date,
): Promise<void> {
  const escolha = await escolherForQueue(tx, filaId);
  if (!escolha.escolhido) return;

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
}
