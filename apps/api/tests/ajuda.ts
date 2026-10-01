import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDatabase, closeDatabase, migrate } from '@pipe/db';
import type { DatabasePipe } from '@pipe/db';

export const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

export const APP_SECRET = 'segredo-do-app-da-meta';
export const VERIFY_TOKEN = 'token-de-inscricao';
export const PHONE_NUMBER_ID = '555000111';

export interface Cenario {
  dono: DatabasePipe;
  tenantId: string;
  channelId: string;
  flowId: string;
  inboxId: string;
  queueId: string;
  agentId: string;
  token: string;
  tokenWithoutScope: string;
  encerrar: () => Promise<void>;
}

/**
 * A complete tenant, with a WhatsApp channel configured, a queue, an agent online and enabled in it, and two API keys — one with every scope and another with none, to prove the scope is actually checked.
 *
 * Built with the owner role: it's a seed, not a production path.
 */
export async function montarCenario(sufixo: string): Promise<Cenario> {
  await migrate(URL_DONO);
  const dono = createDatabase({ url: URL_DONO, maxConnections: 3 });

  const um = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => {
    const { rows } = await dono.execute<T>(query);
    const linha = rows[0];
    if (!linha) throw new Error('a semente não devolveu linha');
    return linha;
  };

  const tenant = await um<{ id: string }>(
    sql`insert into tenant (nome, slug) values (${`e2e ${sufixo}`}, ${`e2e-${sufixo}`}) returning id`,
  );

  const channel = await um<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, config)
    values (${tenant.id}, 'whatsapp_cloud', 'WhatsApp de teste', ${JSON.stringify({
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      tokenAcesso: 'token-falso-do-usuario-de-sistema',
    })}::jsonb)
    returning id
  `);

  const flow = await um<{ id: string }>(sql`
    insert into fluxo (tenant_id, nome, short_name, canal_id)
    values (${tenant.id}, ${`Fluxo ${sufixo}`}, ${`fluxo${sufixo.replace(/-/g, '')}`}, ${channel.id})
    returning id
  `);

  const queue = await um<{ id: string }>(
    sql`insert into fila (tenant_id, fluxo_id, nome) values (${tenant.id}, ${flow.id}, ${`Suporte ${sufixo}`}) returning id`,
  );

  const inbox = await um<{ id: string }>(sql`
    insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
    values (${tenant.id}, ${channel.id}, 'Entrada', ${queue.id})
    returning id
  `);

  const agent = await um<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenant.id}, 'Ana Ribeiro', ${`ana-${sufixo}@e2e.pipe.app`})
    returning id
  `);

  await dono.execute(sql`
    insert into fila_atendente (tenant_id, fila_id, usuario_id)
    values (${tenant.id}, ${queue.id}, ${agent.id})
  `);
  await dono.execute(sql`
    insert into status_atendente (usuario_id, tenant_id, estado, desde, conectado_em)
    values (${agent.id}, ${tenant.id}, 'online', now(), now())
  `);

  const token = await createKey(dono, tenant.id, ['*']);
  const tokenWithoutScope = await createKey(dono, tenant.id, ['filas:ler']);

  return {
    dono,
    tenantId: tenant.id,
    channelId: channel.id,
    flowId: flow.id,
    inboxId: inbox.id,
    queueId: queue.id,
    agentId: agent.id,
    token,
    tokenWithoutScope,
    encerrar: async () => {
      await dono.execute(sql`delete from tenant where id = ${tenant.id}::uuid`);
      await closeDatabase(dono);
    },
  };
}

/**
 * Two flows in the same tenant, each with its own queue and a conflicting "Boleto" rule, sharing one agent linked to both queues.
 */
export async function montarDoisFluxos(sufixo: string) {
  const cenario = await montarCenario(sufixo);
  const { dono, tenantId } = cenario;
  const um = async (query: ReturnType<typeof sql>) => {
    const { rows } = await dono.execute<{ id: string }>(query);
    return rows[0]!.id;
  };

  const flowA = cenario.flowId;
  const flowB = await um(sql`
    insert into fluxo (tenant_id, nome, short_name)
    values (${tenantId}, ${`Servico ${sufixo}`}, ${`servico${sufixo.replace(/-/g, '')}`})
    returning id
  `);
  const queueA = cenario.queueId;
  // plano 18: mesmo nome após trocar fila_tenant_nome_uk
  const queueB = await um(sql`
    insert into fila (tenant_id, fluxo_id, nome) values (${tenantId}, ${flowB}, ${`Suporte B ${sufixo}`}) returning id
  `);
  await dono.execute(sql`
    insert into fila_atendente (tenant_id, fila_id, usuario_id) values (${tenantId}, ${queueB}, ${cenario.agentId})
  `);

  for (const fila of [queueA, queueB]) {
    const regra = await um(sql`
      insert into regra_fila (tenant_id, nome, ordem, combinador, fila_destino_id, ativa)
      values (${tenantId}, 'Boleto', 0, 'e', ${fila}, true) returning id
    `);
    await dono.execute(sql`
      insert into regra_fila_condicao (tenant_id, regra_id, campo, operador, valor)
      values (${tenantId}, ${regra}, 'mensagem', 'contem', 'boleto')
    `);
  }

  return { cenario, flowA, flowB, queueA, queueB, userShared: cenario.agentId };
}

async function createKey(
  dono: DatabasePipe,
  tenantId: string,
  scopes: string[],
): Promise<string> {
  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(secret).digest('hex');
  await dono.execute(sql`
    insert into chave_api (tenant_id, nome, prefixo, hash, escopos)
    values (${tenantId}, 'e2e', ${prefix}, ${hash}, ${`{${scopes.join(',')}}`}::text[])
  `);
  return `pipe_${prefix}_${secret}`;
}

export function assinar(corpo: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`;
}

/** An inbound message payload, in the format Meta sends. */
export function payloadOfMessage(
  de: string,
  texto: string,
  options: { id?: string; name?: string; at?: Date } = {},
): unknown {
  const em = options.at ?? new Date();
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-e2e',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: options.name ?? 'Cliente Teste' }, wa_id: de }],
              messages: [
                {
                  from: de,
                  id: options.id ?? `wamid.ENTRADA.${randomUUID()}`,
                  timestamp: String(Math.floor(em.getTime() / 1000)),
                  type: 'text',
                  text: { body: texto },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** The flow a test publishes via `importFlowOfBlip` is a new one: queues of the scenario move into it so its handoff can use them. */
export async function adotarFilas(cenario: Pick<Cenario, 'dono' | 'tenantId'>, flowId: string): Promise<void> {
  await cenario.dono.execute(sql`update fila set fluxo_id = ${flowId}::uuid where tenant_id = ${cenario.tenantId}::uuid`);
}

/** The bot session of a contact: the latest execution, which holds the talk until a handoff creates the ticket. */
export async function sessaoDoBot(
  cenario: Pick<Cenario, 'dono' | 'tenantId'>,
  telefone: string,
): Promise<{ id: string; estado: string; conversa_id: string | null }> {
  const { rows } = await cenario.dono.execute<{ id: string; estado: string; conversa_id: string | null }>(sql`
    select e.id, e.estado, e.conversa_id
      from execucao_fluxo e join contato ct on ct.id = e.contato_id
     where e.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by e.iniciada_em desc limit 1
  `);
  if (!rows[0]) throw new Error(`sem sessão do bot para ${telefone}`);
  return rows[0];
}

/** What the bot said in a session, whether or not a ticket adopted the messages. */
export async function respostasDoBot(cenario: Pick<Cenario, 'dono'>, execucaoId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem where execucao_id = ${execucaoId}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}
