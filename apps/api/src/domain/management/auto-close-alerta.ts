import { isClosedState, SQL_STATES_ACTIVE } from '@pipe/core';
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

/**
 * Referência da inatividade: a última mensagem, ou a saída do Modo de Espera se for mais recente. Enquanto a conversa está em espera o encerramento automático fica pausado (a Blip diz: "o encerramento automático por inatividade será pausado"), e a contagem recomeça quando o atendente retoma. Assume o alias `c` da conversa.
 */
export const INACTIVITY_REF = sql`greatest(
  coalesce(c.ultima_mensagem_em, c.criada_em),
  coalesce(
    (select max(e.em) from evento_atendimento e
      where e.tenant_id = c.tenant_id and e.conversa_id = c.id and e.tipo = 'espera_encerrada'),
    '-infinity'::timestamptz
  )
)`;

/**
 * Configuração efetiva de encerramento: a da fila vence; sem configuração na fila (coluna nula) vale a global do tenant. Assume os aliases `f` (fila, `left join`) e `tn` (tenant).
 */
export const CONFIG_EFETIVA = sql`coalesce(
  case when jsonb_typeof(f.encerramento_automatico) = 'object' then f.encerramento_automatico end,
  tn.configuracao_atendimento->'encerramentoAutomatico'
)`;

/** Conversa em espera só fica de fora do encerramento enquanto o Modo de Espera estiver ligado (padrão). Assume `c` e `tn`. */
export const FORA_DA_ESPERA = sql`(c.em_espera_desde is null or tn.configuracao_atendimento->'modoEspera'->>'ativo' = 'false')`;

export interface AlertTarget {
  state: string;
  /** Em Modo de Espera (`em_espera_desde` preenchido). */
  emEspera?: boolean;
  lastMessageAt: Date | null;
  lastMessageOf: string | null;
  firstResponseAt: Date | null;
  alertAt: Date | null;
}

/** Regra pura: respeita as opções do encerramento, falta no máximo a antecedência, ainda não venceu e o ciclo atual não foi alertado. */
export function isDueForAlert(
  config: AutoCloseConfig,
  conversa: AlertTarget,
  agora: Date,
  pausarEmEspera = true,
): boolean {
  if (!config.ativo || !config.alerta.ativo || !config.alerta.mensagem) return false;
  if (isClosedState(conversa.state) || (pausarEmEspera && conversa.emEspera === true) || !conversa.lastMessageAt) return false;
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
      join tenant tn on tn.id = c.tenant_id
      left join fila f on f.id = c.fila_id and f.tenant_id = c.tenant_id
      cross join lateral (select ${CONFIG_EFETIVA} as v) cfg
      cross join lateral (select
        case when jsonb_typeof(cfg.v->'tempo') = 'number'
             then (cfg.v->>'tempo')::numeric
                  * (case cfg.v->>'unidade' when 'horas' then 60 else 1 end) end as tempo_min,
        case when jsonb_typeof(cfg.v->'alerta'->'antecedencia') = 'number'
             then (cfg.v->'alerta'->>'antecedencia')::numeric
                  * (case cfg.v->'alerta'->>'unidade' when 'horas' then 60 else 1 end) end as ant_min
      ) t
     where c.estado in ${sql.raw(SQL_STATES_ACTIVE)} and ${FORA_DA_ESPERA}
       and (${tenants === undefined} or c.tenant_id = any(${`{${(tenants ?? []).join(',')}}`}::uuid[]))
       and jsonb_typeof(cfg.v) = 'object'
       and cfg.v->>'ativo' = 'true'
       and cfg.v->'alerta'->>'ativo' = 'true'
       and t.tempo_min is not null and t.ant_min is not null and t.ant_min < t.tempo_min
       and (cfg.v->>'soSePrimeiroAtendimento' is distinct from 'true'
            or c.primeira_resposta_em is not null)
       and (cfg.v->>'naoSeAguardandoAtendente' is distinct from 'true'
            or c.ultima_mensagem_de is distinct from 'contato')
       and ${INACTIVITY_REF}
             <= ${agora}::timestamptz - (t.tempo_min - t.ant_min) * interval '1 minute'
       and ${INACTIVITY_REF}
             > ${agora}::timestamptz - t.tempo_min * interval '1 minute'
       and (c.alerta_inatividade_em is null
            or coalesce(c.ultima_mensagem_em, c.criada_em) > c.alerta_inatividade_em)
     order by ${INACTIVITY_REF}, c.id
     limit ${limite}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, conversationId: l.id }));
}

type LinhaAlerta = {
  emEspera: boolean;
  id: string;
  state: string;
  lastMessageAt: Date | string | null;
  criadaEm: Date | string;
  lastMessageOf: string | null;
  firstResponseAt: Date | string | null;
  alertAt: Date | string | null;
  config: unknown;
  modoEspera: string | null;
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
      select c.id, c.estado as state, (c.em_espera_desde is not null) as "emEspera", ${INACTIVITY_REF} as "lastMessageAt", c.criada_em as "criadaEm",
             c.ultima_mensagem_de as "lastMessageOf", c.primeira_resposta_em as "firstResponseAt",
             c.alerta_inatividade_em as "alertAt", ${CONFIG_EFETIVA} as config,
             tn.configuracao_atendimento->'modoEspera'->>'ativo' as "modoEspera"
        from conversa c
        join tenant tn on tn.id = c.tenant_id
        left join fila f on f.id = c.fila_id
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
      emEspera: linha.emEspera,
      lastMessageAt: data(linha.lastMessageAt ?? linha.criadaEm),
      lastMessageOf: linha.lastMessageOf,
      firstResponseAt: data(linha.firstResponseAt),
      alertAt: data(linha.alertAt),
    };
    if (!isDueForAlert(config, alvo, agora, linha.modoEspera !== 'false')) return null;
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
