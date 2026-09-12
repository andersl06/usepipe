import { criarBanco, comTenant, fecharBanco as fecharPool } from '@pipe/db';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';

/**
 * Conexão da ponte, com o papel do app — igual à da `apps/api`.
 *
 * A ponte responde a uma tela que não tem login (a cópia da Blip só finge estar
 * conectada). Por isso ela NUNCA usa o papel dono: toda consulta roda com
 * `pipe.tenant_id` fixado e a RLS valendo. Se a chave de laboratório apontar para o
 * tenant errado, o pior que acontece é a tela abrir vazia — não vazar dado de outro
 * cliente.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

let app: BancoPipe | null = null;

export function bancoApp(): BancoPipe {
  app ??= criarBanco({ url: URL_APP, maxConexoes: 5 });
  return app;
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
  app = null;
}
