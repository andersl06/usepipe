import { createDatabase, comTenant, closeDatabase as fecharPool } from '@pipe/db';
import type { DatabasePipe, TransactionPipe } from '@pipe/db';

/**
 * Two connections and roles, as in `apps/api`. All business data goes through `noTenant`, with `pipe.tenant_id` fixed and RLS active. The owner role has one purpose: resolving the cookie session before a tenant is established. No other query uses it.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

let app: DatabasePipe | null = null;
let dono: DatabasePipe | null = null;

export function databaseApp(): DatabasePipe {
  app ??= createDatabase({ url: URL_APP, maxConnections: 5 });
  return app;
}

export function databaseDono(): DatabasePipe {
  dono ??= createDatabase({ url: URL_DONO, maxConnections: 2 });
  return dono;
}

/**
 * Run work with the tenant fixed. Queries inside the callback must run in series: `Promise.all` disrupts the transaction's `set_config`, allowing a query to run without a tenant. This is the same trap documented in `apps/api`.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> {
  return comTenant(databaseApp(), tenantId, fn);
}

export async function fecharDatabase(): Promise<void> {
  if (app) await fecharPool(app);
  if (dono) await fecharPool(dono);
  app = null;
  dono = null;
}
