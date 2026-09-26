import { createDatabase, comTenant } from '@pipe/db';
import type { DatabasePipe, TransactionPipe } from '@pipe/db';

/**
 * Two pools and roles. Only the app role (`DATABASE_URL_APP`) accesses business data, always inside `comTenant`. The owner role (`DATABASE_URL`) has one worker use: identify the tenant of each queued row. `outbox_mensagem` and `entrega_webhook` span all tenants, and RLS on `pipe.tenant_id` cannot return rows before a tenant is set. Migration `0001_rls` records this exception. Isolation still requires that no query except the claim `select` uses the owner role.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

let app: DatabasePipe | null = null;
let dono: DatabasePipe | null = null;

export function databaseApp(): DatabasePipe {
  app ??= createDatabase({ url: URL_APP, maxConnections: 8 });
  return app;
}

export function databaseOwner(): DatabasePipe {
  dono ??= createDatabase({ url: URL_DONO, maxConnections: 2 });
  return dono;
}

/**
 * Run work with `pipe.tenant_id` set. Queries in the callback must run in series. `Promise.all` disrupts the transaction's `set_config` and can leave a query running without a tenant; see README.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> {
  return comTenant(databaseApp(), tenantId, fn);
}

export async function fecharBancos(): Promise<void> {
  if (app) await app.$client.end();
  if (dono) await dono.$client.end();
  app = null;
  dono = null;
}
