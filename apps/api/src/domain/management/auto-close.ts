import { sql } from 'drizzle-orm';
import { databaseOwner, noTenant } from '../../database.js';
import { closeInTransaction } from '../conversation.js';
import type { LineConversation } from '../conversation.js';
import { sendMessage } from '../envio.js';
import { alertConversation, conversationsForAlert, INACTIVITY_REF } from './auto-close-alerta.js';
import { drenarEmSegundoPlano } from '../../webhooks-saida.js';
import { evento, publicar } from '../../realtime.js';
import { autoCloseChecked, toMinutes } from './queue-auto-close.js';
import type { AutoCloseConfig } from './queue-auto-close.js';

/**
 * Encerramento automático por inatividade. A varredura descobre candidatas entre os tenants com o banco dono (como `conversationsForCheckSla`) e cada encerramento roda sozinho, numa transação do tenant, pela mesma função de domínio que os atendentes usam (`closeInTransaction`).
 *
 * Conversa em Modo de Espera não é candidata (a espera pausa o encerramento) e a contagem recomeça na retomada (`INACTIVITY_REF`). A inatividade conta a partir da última mensagem da conversa (`ultima_mensagem_em`, de qualquer autor): mensagem do atendente também reinicia a contagem, como na Blip, e como o cliente fala por último ou antes da resposta, a última mensagem do cliente nunca é mais recente que ela. O alerta de inatividade é uma mensagem automática que não toca em `ultima_mensagem_*` (ver `auto-close-alerta.ts`), então nunca reinicia a contagem. O worker roda sempre e só age em filas com `encerramento_automatico.ativo = true`.
 */

export const AUTO_CLOSE_REASON = 'encerramento_automatico';
export const AUTO_CLOSE_BATCH = 100;

export interface CandidateOfAutoClose {
  tenantId: string;
  conversationId: string;
}

export interface AutoCloseTarget {
  state: string;
  lastMessageAt: Date | null;
  lastMessageOf: string | null;
  firstResponseAt: Date | null;
}

/** Regra pura: a conversa já passou do tempo configurado e respeita as duas opções. */
export function isDueForAutoClose(config: AutoCloseConfig, conversa: AutoCloseTarget, agora: Date): boolean {
  if (!config.ativo || conversa.state === 'encerrada' || conversa.state === 'em_espera' || !conversa.lastMessageAt) return false;
  if (config.soSePrimeiroAtendimento && !conversa.firstResponseAt) return false;
  if (config.naoSeAguardandoAtendente && conversa.lastMessageOf === 'contato') return false;
  const limiteMs = toMinutes(config.tempo, config.unidade) * 60_000;
  return agora.getTime() - conversa.lastMessageAt.getTime() >= limiteMs;
}

/**
 * Candidatas (lote limitado, mais antigas primeiro) de filas com o encerramento ligado. O filtro por tempo e opções acontece no SQL para a fila de espera não ser ocupada por conversas que ainda não venceram; `isDueForAutoClose` confere de novo, sob trava, antes de encerrar.
 */
export async function conversationsForAutoClose(
  agora: Date,
  limite = AUTO_CLOSE_BATCH,
  tenants?: readonly string[],
): Promise<CandidateOfAutoClose[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select c.tenant_id, c.id
      from conversa c
      join fila f on f.id = c.fila_id and f.tenant_id = c.tenant_id
     where c.estado not in ('encerrada', 'em_espera')
       and (${tenants === undefined} or c.tenant_id = any(${`{${(tenants ?? []).join(',')}}`}::uuid[]))
       and jsonb_typeof(f.encerramento_automatico) = 'object'
       and f.encerramento_automatico->>'ativo' = 'true'
       and (f.encerramento_automatico->>'soSePrimeiroAtendimento' is distinct from 'true'
            or c.primeira_resposta_em is not null)
       and (f.encerramento_automatico->>'naoSeAguardandoAtendente' is distinct from 'true'
            or c.ultima_mensagem_de is distinct from 'contato')
       and ${INACTIVITY_REF} <= ${agora}::timestamptz - (
             case when jsonb_typeof(f.encerramento_automatico->'tempo') = 'number'
                  then (f.encerramento_automatico->>'tempo')::numeric
                       * (case f.encerramento_automatico->>'unidade' when 'horas' then 60 else 1 end)
                  end
           ) * interval '1 minute'
     order by ${INACTIVITY_REF}, c.id
     limit ${limite}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, conversationId: l.id }));
}

export interface AutoCloseEffects {
  /** Depois do commit: webhooks de saída e tempo real. */
  afterCommit: (tenantId: string, conversationId: string) => Promise<void>;
  /** Envia o alerta de inatividade como mensagem automática do sistema, pelo outbox de mensagens. */
  sendAlert: (tenantId: string, conversationId: string, texto: string) => Promise<void>;
}

export const realEffects: AutoCloseEffects = {
  sendAlert: async (tenantId, conversationId, texto) => {
    await sendMessage({ tenantId, conversationId, texto, automatica: 'alerta_inatividade' });
  },
  afterCommit: async (tenantId, conversationId) => {
    drenarEmSegundoPlano(tenantId);
    await publicar(tenantId, evento('conversation', conversationId));
    await publicar(tenantId, evento('queue'));
  },
};

type LinhaTrava = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  em_espera_desde: Date | string | null;
  lastMessageAt: Date | string | null;
  criadaEm: Date | string;
  lastMessageOf: string | null;
  firstResponseAt: Date | string | null;
  config: unknown;
};

const data = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

/**
 * Encerra UMA conversa se ainda estiver vencida. Idempotente: a linha é travada e relida, então uma segunda execução (ou outro processo) encontra a conversa encerrada e não faz nada.
 */
export async function autoCloseConversation(
  c: CandidateOfAutoClose,
  agora: Date,
  efeitos: AutoCloseEffects = realEffects,
): Promise<boolean> {
  const encerrou = await noTenant(c.tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaTrava>(sql`
      select c.id, c.estado as state, c.fila_id as "queueId", c.atendente_id as "agentId",
             c.em_espera_desde, ${INACTIVITY_REF} as "lastMessageAt", c.criada_em as "criadaEm",
             c.ultima_mensagem_de as "lastMessageOf", c.primeira_resposta_em as "firstResponseAt",
             f.encerramento_automatico as config
        from conversa c
        join fila f on f.id = c.fila_id
       where c.id = ${c.conversationId}::uuid
         for update of c
    `);
    const linha = rows[0];
    if (!linha) return false;

    let config: AutoCloseConfig;
    try {
      config = autoCloseChecked(linha.config);
    } catch {
      return false;
    }
    const alvo: AutoCloseTarget = {
      state: linha.state,
      lastMessageAt: data(linha.lastMessageAt ?? linha.criadaEm),
      lastMessageOf: linha.lastMessageOf,
      firstResponseAt: data(linha.firstResponseAt),
    };
    if (!isDueForAutoClose(config, alvo, agora)) return false;

    const etiquetas =
      config.tags.ativo && config.tags.tags.length > 0
        ? (
            await tx.execute<{ id: string; name: string }>(sql`
              select id, nome as name from etiqueta
               where lower(nome) in (${sql.join(config.tags.tags.map((t) => sql`${t.toLowerCase()}`), sql`, `)})
                 and escopo in ('conversa', 'ambos')
            `)
          ).rows
        : [];

    const conversa: LineConversation = {
      id: linha.id,
      state: linha.state,
      queueId: linha.queueId,
      agentId: linha.agentId,
      em_espera_desde: linha.em_espera_desde,
    };
    const found = new Set(etiquetas.map((e) => e.name.toLowerCase()));
    const notFound = config.tags.ativo ? config.tags.tags.filter((t) => !found.has(t.toLowerCase())) : [];
    const reason = await closeInTransaction(
      tx, c.tenantId, conversa, null, etiquetas, agora, 'inatividade',
      notFound.length > 0 ? { tags_nao_encontradas: notFound } : {},
    );
    // The generic reason only stands in when no tag set one.
    if (!reason) {
      await tx.execute(sql`
        update conversa set motivo_encerramento = ${AUTO_CLOSE_REASON} where id = ${linha.id}::uuid
      `);
    }
    return true;
  });
  if (encerrou) await efeitos.afterCommit(c.tenantId, c.conversationId);
  return encerrou;
}

/** Um tick: no máximo `limite` conversas (`tenants` restringe a varredura; sem ele, todos os tenants), cada uma isolada; falha de uma não impede as outras. */
export async function runAutoClose(
  agora: Date = new Date(),
  efeitos: AutoCloseEffects = realEffects,
  limite = AUTO_CLOSE_BATCH,
  tenants?: readonly string[],
): Promise<{ candidates: number; closed: number; alerted: number }> {
  const candidatas = await conversationsForAutoClose(agora, limite, tenants);
  let closed = 0;
  let alerted = 0;
  for (const candidata of candidatas) {
    try {
      if (await autoCloseConversation(candidata, agora, efeitos)) closed += 1;
    } catch (erro) {
      console.error(`[encerramento-automatico] falhou ${candidata.conversationId}: ${(erro as Error).message}`);
    }
  }
  // Depois de encerrar: o que acabou de vencer não recebe alerta tardio.
  for (const candidata of await conversationsForAlert(agora, limite, tenants)) {
    try {
      if (await alertConversation(candidata, agora, efeitos.sendAlert)) alerted += 1;
    } catch (erro) {
      console.error(`[encerramento-automatico] alerta falhou ${candidata.conversationId}: ${(erro as Error).message}`);
    }
  }
  return { candidates: candidatas.length, closed, alerted };
}
