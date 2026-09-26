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

  const queue = await um<{ id: string }>(
    sql`insert into fila (tenant_id, nome) values (${tenant.id}, ${`Suporte ${sufixo}`}) returning id`,
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
    insert into status_atendente (usuario_id, tenant_id, estado, desde)
    values (${agent.id}, ${tenant.id}, 'online', now())
  `);

  const token = await createKey(dono, tenant.id, ['*']);
  const tokenWithoutScope = await createKey(dono, tenant.id, ['filas:ler']);

  return {
    dono,
    tenantId: tenant.id,
    channelId: channel.id,
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
  const em = options.em ?? new Date();
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
              contacts: [{ profile: { name: options.nome ?? 'Cliente Teste' }, wa_id: de }],
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
