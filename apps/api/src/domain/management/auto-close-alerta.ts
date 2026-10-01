import { sql } from 'drizzle-orm';
import { databaseOwner, noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { autoCloseChecked, toMinutes } from './queue-auto-close.js';
import type { AutoCloseConfig } from './queue-auto-close.js';

/**
 * Alerta de inatividade: avisa o cliente uma única vez, `alerta.antecedencia` antes do encerramento automático. A marca `conversa.alerta_inatividade_em` vale para o ciclo atual; qualquer mensagem mais nova que ela (do cliente ou do atendente) abre um novo ciclo. A mensagem do alerta é automática e nunca reinicia a contagem (ver `autor` em `sendMessage`).
 */

export const ALERT_BATCH = 100;

export interface AlertCandidate {
  tenantId: string;
  conversationId: string;
}

export interface AlertTarget {
  state: string;
  lastMessageAt: Date | null;
  lastMessageOf: string | null;
  firstResponseAt: Date | null;
  alertAt: Date | null;
}

/** Regra pura: respeita as opções do encerramento, falta no máximo a antecedência, ainda não venceu e o ciclo atual não foi alertado. */
export function isDueForAlert(config: AutoCloseConfig, conversa: AlertTarget, agora: Date): boolean {
  if (!config.ativo || !config.alerta.ativo || !config.alerta.mensagem) return false;
  if (conversa.state === 'encerrada' || !conversa.lastMessageAt) return false;
  if (config.soSePrimeiroAtendimento && !conversa.firstResponseAt) return false;
  if (config.naoSeAguardandoAtendente && conversa.lastMessageOf === 'contato') return false;
  const limite = toMinutes(config.tempo, config.unidade);
  const antecedencia = toMinutes(config.alerta.antecedencia, config.alerta.unidade);
  const inativoMin = (agora.getTime() - conversa.lastMessageAt.getTime()) / 60_000;
  if (!(antecedencia < limite && inativoMin >= limite - antecedencia && inativoMin < limite)) return false;
  return conversa.alertAt === null || conversa.lastMessageAt > conversa.alertAt;
}

/** Candidatas (lote limitado, mais antigas primeiro): mesmas opções do encerramento, dentro da janela da antecedência e sem alerta no ciclo atual. */
export async function conversationsForAlert(
  agora: Date,
  limite = ALERT_BATCH,
  tenants?: readonly string[],
): Promise<AlertCandidate[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select c.tenant_id, c.id
      from conversa c
      join fila f on f.id = c.fila_id and f.tenant_id = c.tenant_id
      cross join lateral (select
        case when jsonb_typeof(f.encerramento_automatico->'tempo') = 'number'
             then (f.encerramento_automatico->>'tempo')::numeric
                  * (case f.encerramento_automatico->>'unidade' when 'horas' then 60 else 1 end) end as tempo_min,
        case when jsonb_typeof(f.encerramento_automatico->'alerta'->'antecedencia') = 'number'
             then (f.encerramento_automatico->'alerta'->>'antecedencia')::numeric
                  * (case f.encerramento_automatico->'alerta'->>'unidade' when 'horas' then 60 else 1 end) end as ant_min
      ) t
     where c.estado <> 'encerrada'
       and (${tenants === undefined} or c.tenant_id = any(${`{${(tenants ?? []).join(',')}}`}::uuid[]))
       and jsonb_typeof(f.encerramento_automatico) = 'object'
       and f.encerramento_automatico->>'ativo' = 'true'
       and f.encerramento_automatico->'alerta'->>'ativo' = 'true'
       and t.tempo_min is not null and t.ant_min is not null and t.ant_min < t.tempo_min
       and (f.encerramento_automatico->>'soSePrimeiroAtendimento' is distinct from 'true'
            or c.primeira_resposta_em is not null)
       and (f.encerramento_automatico->>'naoSeAguardandoAtendente' is distinct from 'true'
            or c.ultima_mensagem_de is distinct from 'contato')
       and coalesce(c.ultima_mensagem_em, c.criada_em)
             <= ${agora}::timestamptz - (t.tempo_min - t.ant_min) * interval '1 minute'
       and coalesce(c.ultima_mensagem_em, c.criada_em)
             > ${agora}::timestamptz - t.tempo_min * interval '1 minute'
       and (c.alerta_inatividade_em is null
            or coalesce(c.ultima_mensagem_em, c.criada_em) > c.alerta_inatividade_em)
     order by coalesce(c.ultima_mensagem_em, c.criada_em), c.id
     limit ${limite}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, conversationId: l.id }));
}

type LinhaAlerta = {
  id: string;
  state: string;
  lastMessageAt: Date | string | null;
  criadaEm: Date | string;
  lastMessageOf: string | null;
  firstResponseAt: Date | string | null;
  alertAt: Date | string | null;
  config: unknown;
};

const data = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

/**
 * Alerta UMA conversa. A marca é reivindicada sob trava antes de enviar (um alerta por ciclo, mesmo com dois processos). Se o envio falha por erro do sistema, a marca é devolvida e o próximo tick tenta de novo; se o canal recusa por regra (por exemplo janela de 24 horas fechada), a marca fica, para não repetir a tentativa a cada tick.
 */
export async function alertConversation(
  c: AlertCandidate,
  agora: Date,
  enviar: (tenantId: string, conversationId: string, texto: string) => Promise<void>,
): Promise<boolean> {
  const texto = await noTenant(c.tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaAlerta>(sql`
      select c.id, c.estado as state, c.ultima_mensagem_em as "lastMessageAt", c.criada_em as "criadaEm",
             c.ultima_mensagem_de as "lastMessageOf", c.primeira_resposta_em as "firstResponseAt",
             c.alerta_inatividade_em as "alertAt", f.encerramento_automatico as config
        from conversa c
        join fila f on f.id = c.fila_id
       where c.id = ${c.conversationId}::uuid
         for update of c
    `);
    const linha = rows[0];
    if (!linha) return null;
    let config: AutoCloseConfig;
    try {
      config = autoCloseChecked(linha.config);
    } catch {
      return null;
    }
    const alvo: AlertTarget = {
      state: linha.state,
      lastMessageAt: data(linha.lastMessageAt ?? linha.criadaEm),
      lastMessageOf: linha.lastMessageOf,
      firstResponseAt: data(linha.firstResponseAt),
      alertAt: data(linha.alertAt),
    };
    if (!isDueForAlert(config, alvo, agora)) return null;
    await tx.execute(sql`update conversa set alerta_inatividade_em = ${agora} where id = ${linha.id}::uuid`);
    return config.alerta.mensagem;
  });
  if (texto === null) return false;
  try {
    await enviar(c.tenantId, c.conversationId, texto);
    return true;
  } catch (erro) {
    if (!(erro instanceof PipeError && erro.status < 500)) {
      await noTenant(c.tenantId, async (tx) => {
        await tx.execute(sql`
          update conversa set alerta_inatividade_em = null
           where id = ${c.conversationId}::uuid and alerta_inatividade_em = ${agora}
        `);
      });
    }
    throw erro;
  }
}
