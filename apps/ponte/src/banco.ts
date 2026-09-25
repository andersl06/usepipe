import { createDatabase, comTenant, closeDatabase as fecharPool } from '@pipe/db';
import type { DatabasePipe, TransactionPipe } from '@pipe/db';

/**
 * Duas conexões, dois papéis — a mesma divisão da `apps/api`.
 *
 * Tudo que é dado de negócio passa por `noTenant`, com `pipe.tenant_id` fixado e a
 * RLS valendo. O papel dono existe para UMA coisa: resolver a sessão do cookie, que
 * é justamente o que precisa acontecer **antes** de haver tenant em vigor. Nenhuma
 * outra consulta usa o papel dono.
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
 * Roda o trabalho com o tenant fixado. Dentro do callback as consultas vão **em
 * série**: `Promise.all` aqui derruba o `set_config` da transação e a consulta passa
 * a rodar sem tenant. É a mesma armadilha registrada na `apps/api`.
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
