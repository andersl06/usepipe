import { criarBanco, comTenant, fecharBanco as fecharPool } from '@pipe/db';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';

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

let app: BancoPipe | null = null;
let dono: BancoPipe | null = null;

export function bancoApp(): BancoPipe {
  app ??= criarBanco({ url: URL_APP, maxConexoes: 5 });
  return app;
}

export function bancoDono(): BancoPipe {
  dono ??= criarBanco({ url: URL_DONO, maxConexoes: 2 });
  return dono;
}

/**
 * Roda o trabalho com o tenant fixado. Dentro do callback as consultas vão **em
 * série**: `Promise.all` aqui derruba o `set_config` da transação e a consulta passa
 * a rodar sem tenant. É a mesma armadilha registrada na `apps/api`.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(bancoApp(), tenantId, fn);
}

export async function fecharBanco(): Promise<void> {
  if (app) await fecharPool(app);
  if (dono) await fecharPool(dono);
  app = null;
  dono = null;
}
