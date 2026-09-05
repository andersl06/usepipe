import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { criarBanco, fecharBanco, migrar } from '@pipe/db';
import type { BancoPipe } from '@pipe/db';

export const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

export const APP_SECRET = 'segredo-do-app-da-meta';
export const VERIFY_TOKEN = 'token-de-inscricao';
export const PHONE_NUMBER_ID = '555000111';

export interface Cenario {
  dono: BancoPipe;
  tenantId: string;
  canalId: string;
  inboxId: string;
  filaId: string;
  atendenteId: string;
  token: string;
  tokenSemEscopo: string;
  encerrar: () => Promise<void>;
}

/**
 * Um tenant completo, com canal de WhatsApp configurado, uma fila, um atendente
 * online habilitado nela e duas chaves de API — uma com todos os escopos e outra
 * sem nenhum, para provar que o escopo é conferido de verdade.
 *
 * Montado com o papel dono: é semente, não caminho de produção.
 */
export async function montarCenario(sufixo: string): Promise<Cenario> {
  await migrar(URL_DONO);
  const dono = criarBanco({ url: URL_DONO, maxConexoes: 3 });

  const um = async <T extends Record<string, unknown>>(consulta: ReturnType<typeof sql>) => {
    const { rows } = await dono.execute<T>(consulta);
    const linha = rows[0];
    if (!linha) throw new Error('a semente não devolveu linha');
    return linha;
  };

  const tenant = await um<{ id: string }>(
    sql`insert into tenant (nome, slug) values (${`e2e ${sufixo}`}, ${`e2e-${sufixo}`}) returning id`,
  );

  const canal = await um<{ id: string }>(sql`
    insert into canal (tenant_id, tipo, nome, config)
    values (${tenant.id}, 'whatsapp_cloud', 'WhatsApp de teste', ${JSON.stringify({
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      tokenAcesso: 'token-falso-do-usuario-de-sistema',
    })}::jsonb)
    returning id
  `);

  const fila = await um<{ id: string }>(
    sql`insert into fila (tenant_id, nome) values (${tenant.id}, ${`Suporte ${sufixo}`}) returning id`,
  );

  const inbox = await um<{ id: string }>(sql`
    insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
    values (${tenant.id}, ${canal.id}, 'Entrada', ${fila.id})
    returning id
  `);

  const atendente = await um<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenant.id}, 'Ana Ribeiro', ${`ana-${sufixo}@e2e.pipe.app`})
    returning id
  `);

  await dono.execute(sql`
    insert into fila_atendente (tenant_id, fila_id, usuario_id)
    values (${tenant.id}, ${fila.id}, ${atendente.id})
  `);
  await dono.execute(sql`
    insert into status_atendente (usuario_id, tenant_id, estado, desde)
    values (${atendente.id}, ${tenant.id}, 'online', now())
  `);

  const token = await criarChave(dono, tenant.id, ['*']);
  const tokenSemEscopo = await criarChave(dono, tenant.id, ['filas:ler']);

  return {
    dono,
    tenantId: tenant.id,
    canalId: canal.id,
    inboxId: inbox.id,
    filaId: fila.id,
    atendenteId: atendente.id,
    token,
    tokenSemEscopo,
    encerrar: async () => {
      await dono.execute(sql`delete from tenant where id = ${tenant.id}::uuid`);
      await fecharBanco(dono);
    },
  };
}

async function criarChave(
  dono: BancoPipe,
  tenantId: string,
  escopos: string[],
): Promise<string> {
  const prefixo = randomBytes(6).toString('hex');
  const segredo = randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(segredo).digest('hex');
  await dono.execute(sql`
    insert into chave_api (tenant_id, nome, prefixo, hash, escopos)
    values (${tenantId}, 'e2e', ${prefixo}, ${hash}, ${`{${escopos.join(',')}}`}::text[])
  `);
  return `pipe_${prefixo}_${segredo}`;
}

export function assinar(corpo: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`;
}

/** Um payload de mensagem recebida, no formato que a Meta manda. */
export function payloadDeMensagem(
  de: string,
  texto: string,
  opcoes: { id?: string; nome?: string; em?: Date } = {},
): unknown {
  const em = opcoes.em ?? new Date();
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
              contacts: [{ profile: { name: opcoes.nome ?? 'Cliente Teste' }, wa_id: de }],
              messages: [
                {
                  from: de,
                  id: opcoes.id ?? `wamid.ENTRADA.${randomUUID()}`,
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
