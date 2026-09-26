import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { createDatabase, comTenant, type Ator, type DatabasePipe, type TransactionPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';
import type { Eu } from '@pipe/contracts';
import { COOKIE_SESSION, buscarEu } from './session';

/**
 * Pipe CRM's single connection. Same layer as Gestão, on purpose: all three
 * screens talk to the database the same way, and whoever learned one already
 * knows the other.
 *
 * The app uses the `pipe_app` role, which has no `bypassrls`: every query goes
 * through `comTenant`, which pins `pipe.tenant_id` for the transaction. Without
 * this, RLS returns zero rows — and that's how it has to be.
 *
 * The pool lives in a global because `next dev` reloads the module on every
 * file change, and a new pool per reload exhausts Postgres's connections.
 *
 * **Never use `Promise.all` inside `fn`.** Parallel queries on the same
 * connection fall into the `pg` driver's deprecated path and
 * `set_config('pipe.tenant_id')` disappears. The result isn't an error: it's a
 * query running with no tenant. Everything here runs sequentially.
 */
const globalComPool = globalThis as unknown as {
  pipeCrmDatabase?: DatabasePipe;
};

export function database(): DatabasePipe {
  if (!globalComPool.pipeCrmDatabase) {
    const url = process.env['DATABASE_URL_APP'] ?? process.env['DATABASE_URL'];
    globalComPool.pipeCrmDatabase = createDatabase({ url, maxConnections: 10 });
  }
  return globalComPool.pipeCrmDatabase;
}

/**
 * Who's logged in, from the cookie.
 *
 * React's `cache` because within the same render the sidebar, the page, and
 * every query ask the same question — and `GET /v1/eu` is a network round trip.
 * The cache lasts one request, never across requests.
 */
const carregarEu = cache(async (): Promise<Eu | null> => {
  const cookie = (await cookies()).get(COOKIE_SESSION);
  if (!cookie) return null;
  return buscarEu(`${COOKIE_SESSION}=${cookie.value}`);
});

/** Who's logged in, or `null`. For whoever knows how to handle the absence. */
export async function euAtual(): Promise<Eu | null> {
  return carregarEu();
}

/**
 * Who's logged in, or the sign-in screen.
 *
 * Covers the expired and the forged cookie, which the middleware doesn't catch:
 * it only checks whether the cookie EXISTS, and it's the `api` that says whether
 * it's valid.
 */
export async function exigirEu(): Promise<Eu> {
  const eu = await carregarEu();
  if (!eu) redirect('/login');
  return eu;
}

/**
 * Which tenant this request serves: the one for whoever is logged in, and no
 * other.
 */
export async function tenantId(): Promise<string> {
  return (await exigirEu()).tenant.id;
}

/** Sugar: opens the transaction already with this instance's tenant pinned. */
export async function consultar<T>(fn: (tx: TransactionPipe) => Promise<T>): Promise<T> {
  return comTenant(database(), await tenantId(), fn);
}

/**
 * The tenant's timezone, so the indicators' "month" isn't the server's timezone.
 *
 * The process-level cache LEFT along with the fixed tenant: stored in a global,
 * it used to be whichever client opened the screen first, serving everyone
 * after. React's `cache` sets the right boundary — one query per request, and
 * nothing crossing between requests.
 */
export const fusoDoTenant = cache(async (): Promise<string> => {
  return consultar(async (tx) => {
    const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
    return linha?.fuso ?? 'America/Sao_Paulo';
  });
});

/**
 * Who signs what the CRM writes, in the audit log.
 *
 * It used to be `sistema` because there was no session — logging a person you
 * couldn't identify would be a lie. Now there's a session, and the log says
 * who — which is the only reason anyone opens the audit log afterward. Same
 * decision, same reason, that Gestão made in `atorDaGestao`.
 */
export async function atorDoCrm(): Promise<Ator> {
  const eu = await exigirEu();
  return { type: 'usuario', id: eu.user.id };
}

export interface Window {
  inicio: Date;
  fim: Date;
}

/**
 * The tenant's current month, in its timezone. The calculation is Postgres's
 * because it's the one that knows the timezone database — reimplementing
 * daylight saving in JavaScript costs a whole day.
 */
export async function monthWindow(fuso: string, mesesAtras = 0): Promise<Window> {
  return consultar(async (tx) => {
    const base = sql`date_trunc('month', now() at time zone ${fuso}) - make_interval(months => ${mesesAtras})`;
    const r = await tx.execute<{ inicio: unknown; fim: unknown }>(
      sql`select (${base}) at time zone ${fuso} as inicio,
                 ((${base}) + interval '1 month') at time zone ${fuso} as fim`,
    );
    const linha = r.rows[0];
    if (!linha) throw new Error('não consegui calcular o mês corrente');
    return { inicio: new Date(String(linha.inicio)), fim: new Date(String(linha.fim)) };
  });
}

/**
 * `timestamptz` volta como **texto** dentro do bundle do Next (armadilha do README).
 * Toda data que sai de consulta passa por aqui antes de virar `Date` na tela.
 */
export function paraData(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `numeric` also comes back as text, and money should never accidentally turn
 * into a float.
 */
export function paraNumero(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}
