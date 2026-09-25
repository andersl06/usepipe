import { sql } from 'drizzle-orm';
import { createDatabase, comTenant, keyringOfAmbiente, decifrarConfig } from '@pipe/db';
import type { DatabasePipe, Keyring, TransactionPipe } from '@pipe/db';

/**
 * Dois pools, dois papéis — a mesma divisão do Desk e dos workers.
 *
 * Tudo que é dado de negócio passa por `noTenant`, com `pipe.tenant_id` fixado e a
 * RLS valendo. O papel dono existe para duas resoluções que acontecem **antes** de
 * haver tenant em vigor e por isso não têm como passar pela política:
 *
 * - achar o tenant do canal a partir do `:canalId` da URL do webhook da Meta;
 * - achar a chave de API pelo prefixo, para descobrir de quem é o `Bearer`.
 *
 * As duas devolvem só o `tenant_id` e o mínimo para autorizar. Nenhuma outra
 * consulta roda com o papel dono; a lacuna está registrada na migration `0001_rls`.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

let app: DatabasePipe | null = null;
let dono: DatabasePipe | null = null;

export function databaseApp(): DatabasePipe {
  app ??= createDatabase({ url: URL_APP, maxConnections: 10 });
  return app;
}

export function databaseOwner(): DatabasePipe {
  dono ??= createDatabase({ url: URL_DONO, maxConnections: 2 });
  return dono;
}

/**
 * Roda o trabalho com `pipe.tenant_id` fixado.
 *
 * Dentro do callback as consultas vão **em série**. `Promise.all` aqui derruba o
 * `set_config` da transação e a consulta passa a rodar sem tenant — ver o README.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> {
  return comTenant(databaseApp(), tenantId, fn);
}

export interface ChannelResolved {
  id: string;
  tenantId: string;
  type: string;
  active: boolean;
  config: Record<string, unknown>;
}

const cacheOfChannel = new Map<string, ChannelResolved>();

/**
 * O chaveiro é lido do ambiente uma vez e guardado. Ler a cada evento da Meta
 * seria trabalho repetido, e uma chave que muda em tempo de execução é reinício
 * de processo, não recarga.
 */
let keyringSaved: Keyring | null = null;

export function keyring(): Keyring {
  keyringSaved ??= keyringOfAmbiente();
  return keyringSaved;
}

/**
 * Resolve o canal do webhook. Guardado em memória porque é lido a cada evento da
 * Meta e muda quase nunca; `esquecerCanal` invalida quando a configuração mudar.
 */
export async function resolveChannel(canalId: string): Promise<ChannelResolved | null> {
  const guardado = cacheOfChannel.get(canalId);
  if (guardado) return guardado;

  const { rows } = await databaseOwner().execute<{
    id: string;
    tenant_id: string;
    type: string;
    active: boolean;
    config: Record<string, unknown> | null;
  }>(sql`select id, tenant_id, tipo, ativo, config from canal where id = ${canalId} limit 1`);

  const linha = rows[0];
  if (!linha) return null;
  const channel: ChannelResolved = {
    id: linha.id,
    tenantId: linha.tenant_id,
    tipo: linha.tipo,
    ativo: linha.ativo,
    // Decifrado UMA vez, aqui, e o resto do código continua lendo
    // `config.tokenAcesso` como sempre leu. O segredo vive cifrado no banco e em
    // texto só na memória de quem precisa dele — ver `packages/db/src/segredo.ts`.
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
  cacheOfChannel.set(canalId, channel);
  return channel;
}

/**
 * Resolve o canal a partir do PAYLOAD, para a rota guarda-chuva.
 *
 * Os eventos de template e de conta da Meta não aceitam URL por cliente e chegam
 * todos no mesmo endereço. Aqui o tenant não pode vir do caminho, então vem do
 * `phone_number_id` ou, na falta dele, do WABA — nessa ordem, porque o número é
 * único e o WABA pode ter vários.
 *
 * Devolve `null` quando não casa, e quem chama DESCARTA. Evento sem dono é de
 * outro aplicativo ou de canal removido; processar no melhor palpite é como se
 * entrega o dado de um cliente a outro.
 */
export async function resolveChannelByIdentifier(
  numeroId: string | undefined,
  wabaId: string | undefined,
): Promise<ChannelResolved | null> {
  if (!numeroId && !wabaId) return null;

  const { rows } = await databaseOwner().execute<{
    id: string;
    tenant_id: string;
    type: string;
    active: boolean;
    config: Record<string, unknown> | null;
  }>(sql`
    select id, tenant_id, tipo, ativo, config
      from canal
     where ${numeroId ? sql`numero_id = ${numeroId}` : sql`false`}
        or ${wabaId ? sql`waba_id = ${wabaId}` : sql`false`}
     -- O número ganha do WABA: ele identifica um canal, o WABA identifica vários.
     order by (numero_id is not null and numero_id = ${numeroId ?? null}) desc
     limit 1
  `);

  const linha = rows[0];
  if (!linha) return null;
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    tipo: linha.tipo,
    ativo: linha.ativo,
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
}

export function esquecerChannel(channelId?: string): void {
  if (channelId) cacheOfChannel.delete(channelId);
  else cacheOfChannel.clear();
}

export async function fecharBancos(): Promise<void> {
  if (app) await app.$client.end();
  if (dono) await dono.$client.end();
  app = null;
  dono = null;
  esquecerChannel();
}
