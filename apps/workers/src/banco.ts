import { criarBanco, comTenant } from '@pipe/db';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';

/**
 * Dois pools, dois papéis.
 *
 * O papel da aplicação (`DATABASE_URL_APP`) é o único que toca dado de negócio, e
 * sempre dentro de `comTenant`. O papel dono (`DATABASE_URL`) serve para **uma** coisa
 * no worker: descobrir de qual tenant é cada linha de fila. `outbox_mensagem` e
 * `entrega_webhook` são varridos por todos os tenants ao mesmo tempo, e a política de
 * RLS — que é escrita sobre `pipe.tenant_id` — não tem como devolver linha antes de
 * haver tenant em vigor. É a mesma lacuna já registrada na migration `0001_rls`.
 *
 * A regra que sustenta o isolamento continua valendo: nada além do `select` de
 * reivindicação roda com o papel dono.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

let app: BancoPipe | null = null;
let dono: BancoPipe | null = null;

export function bancoApp(): BancoPipe {
  app ??= criarBanco({ url: URL_APP, maxConexoes: 8 });
  return app;
}

export function bancoDono(): BancoPipe {
  dono ??= criarBanco({ url: URL_DONO, maxConexoes: 2 });
  return dono;
}

/**
 * Roda o trabalho com `pipe.tenant_id` fixado.
 *
 * Dentro do callback as consultas vão **em série**. `Promise.all` aqui derruba o
 * `set_config` da transação e a consulta passa a rodar sem tenant — ver o README.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(bancoApp(), tenantId, fn);
}

export async function fecharBancos(): Promise<void> {
  if (app) await app.$client.end();
  if (dono) await dono.$client.end();
  app = null;
  dono = null;
}
