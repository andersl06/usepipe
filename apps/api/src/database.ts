import { sql } from 'drizzle-orm';
import { createDatabase, comTenant, keyringOfEnvironment, decifrarConfig } from '@pipe/db';
import type { DatabasePipe, Keyring, TransactionPipe } from '@pipe/db';

/**
 * Two pools and roles, as in the Desk and workers. Business data goes through `noTenant`, with `pipe.tenant_id` set and RLS active. The owner role handles only two lookups that must happen before a tenant exists and therefore cannot use that policy: resolving a Meta webhook channel's tenant from URL `:canalId`, and finding an API key by prefix to identify the `Bearer` token's tenant. Both return only `tenant_id` and the minimum data needed to authorize. No other query uses the owner role; migration `0001_rls` records this gap.
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
 * Run work with `pipe.tenant_id` set. Execute queries inside the callback serially. `Promise.all` here breaks the transaction's `set_config` and a query may then run without a tenant; see the README.
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
 * Load and cache the keyring from the environment once. Reading it for every Meta event would repeat work; a key change at runtime requires a process restart, not a reload.
 */
let keyringSaved: Keyring | null = null;

export function keyring(): Keyring {
  keyringSaved ??= keyringOfEnvironment();
  return keyringSaved;
}

/**
 * Resolve the webhook channel from an in-memory cache because every Meta event reads it and it rarely changes. `esquecerCanal` invalidates the cache when configuration changes.
 */
export async function resolveChannel(canalId: string): Promise<ChannelResolved | null> {
  const guardado = cacheOfChannel.get(canalId);
  if (guardado) return guardado;

  const { rows } = await databaseOwner().execute<{
    id: string;
    tenant_id: string;
    tipo: string;
    ativo: boolean;
    config: Record<string, unknown> | null;
  }>(sql`select id, tenant_id, tipo, ativo, config from canal where id = ${canalId} limit 1`);

  const linha = rows[0];
  if (!linha) return null;
  const channel: ChannelResolved = {
    id: linha.id,
    tenantId: linha.tenant_id,
    type: linha.tipo,
    active: linha.ativo,
    // Decrypt only once here; the rest of the code still reads
    // `config.tokenAcesso` como sempre leu. O segredo vive cifrado no banco e em
    // the plaintext only in the memory of code that needs it; see `packages/db/src/segredo.ts`.
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
  cacheOfChannel.set(canalId, channel);
  return channel;
}

/**
 * Resolve the channel from the payload for the umbrella route. Meta template and account events all arrive at one address because they do not support a customer-specific URL. Resolve the tenant by `phone_number_id` first; if it does not identify a channel, use the WABA. A number identifies one channel, while a WABA may have several. Return `null` when neither identifies a channel, and let the caller discard the event. An unowned event may belong to another app or a removed channel; guessing could expose one customer's data to another.
 */
export async function resolveChannelByIdentifier(
  numeroId: string | undefined,
  wabaId: string | undefined,
): Promise<ChannelResolved | null> {
  if (!numeroId && !wabaId) return null;

  const { rows } = await databaseOwner().execute<{
    id: string;
    tenant_id: string;
    tipo: string;
    ativo: boolean;
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
    type: linha.tipo,
    active: linha.ativo,
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
}

export function forgetChannel(channelId?: string): void {
  if (channelId) cacheOfChannel.delete(channelId);
  else cacheOfChannel.clear();
}

export async function fecharBancos(): Promise<void> {
  if (app) await app.$client.end();
  if (dono) await dono.$client.end();
  app = null;
  dono = null;
  forgetChannel();
}
