import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabase, closeDatabase } from './cliente.js';
import { garantirPartitions } from './partitions.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** A pasta `drizzle` fica na raiz do pacote, tanto rodando de `src` quanto de `dist`. */
export const PASTA_MIGRATIONS = path.resolve(AQUI, '..', 'drizzle');

export async function migrate(url?: string): Promise<void> {
  const db = createDatabase({ url: url ?? process.env['DATABASE_URL'], maxConnections: 1 });
  try {
    await migrate(db, { migrationsFolder: PASTA_MIGRATIONS });
    await garantirPartitions(db);
  } finally {
    await closeDatabase(db);
  }
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  migrate()
    .then(() => {
      process.stdout.write('migrations aplicadas e partições garantidas\n');
    })
    .catch((error: unknown) => {
      process.stderr.write(`falha ao migrar: ${String(error)}\n`);
      process.exitCode = 1;
    });
}
