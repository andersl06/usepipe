import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateDrizzle } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { closeDatabase, createDatabase } from '../src/cliente.js';
import { ensurePartitions } from '../src/partitions.js';
import { URL_DONO } from './ajuda.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(AQUI, '..', 'drizzle');
const MIGRATION_TAG = '0051_flow_short_name_unique';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Copies every migration file up to (not including) `0051_flow_short_name_unique.sql` into a
 * throwaway folder with its own trimmed journal, so `migrate()` can apply the schema exactly as
 * it stood right before this migration. Only `meta/_journal.json` and the `.sql` files matter to
 * drizzle's runtime migrator (`drizzle-orm/migrator.js`); the `meta/*_snapshot.json` files are a
 * `drizzle-kit generate` concern, not read here.
 */
async function migrationsFolderBefore0051(): Promise<string> {
  const journalPath = path.join(DRIZZLE_DIR, 'meta', '_journal.json');
  const journal = JSON.parse(await fsp.readFile(journalPath, 'utf8')) as {
    version: string;
    dialect: string;
    entries: JournalEntry[];
  };
  const before = journal.entries.filter((entry) => entry.tag !== MIGRATION_TAG);

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pipe-db-before-0051-'));
  await fsp.mkdir(path.join(tempDir, 'meta'));
  await fsp.writeFile(
    path.join(tempDir, 'meta', '_journal.json'),
    JSON.stringify({ version: journal.version, dialect: journal.dialect, entries: before }),
  );
  await Promise.all(
    before.map((entry) =>
      fsp.copyFile(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), path.join(tempDir, `${entry.tag}.sql`)),
    ),
  );
  return tempDir;
}

/** Splits `0051_flow_short_name_unique.sql` the same way drizzle's own migrator does. */
function statementsOf0051(): string[] {
  const content = fs.readFileSync(path.join(DRIZZLE_DIR, `${MIGRATION_TAG}.sql`), 'utf8');
  return content.split('--> statement-breakpoint');
}

export interface ScratchDatabaseBefore0051 {
  /** Owner-role client, connected to the throwaway database. */
  client: pg.Client;
  /** Applies `0051_flow_short_name_unique.sql` by hand, statement by statement. */
  applyMigration0051: () => Promise<void>;
  /** Closes the client and drops the throwaway database. */
  drop: () => Promise<void>;
}

/**
 * Creates a throwaway database, migrated up to (not including) 0051, so a test can insert
 * pre-0051 fixtures (null `short_name`, duplicate live short names) and observe exactly what
 * 0051 does to them. The shared dev database cannot offer this once 0051 has already run there:
 * every row already has a non-null, unique `short_name`, so there is nothing left to migrate.
 */
export async function scratchDatabaseBefore0051(): Promise<ScratchDatabaseBefore0051> {
  const database = `pipe_test_0051_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Client({ connectionString: withDatabase(URL_DONO, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  const url = withDatabase(URL_DONO, database);
  const migrationsFolder = await migrationsFolderBefore0051();
  try {
    /*
     * `../src/migrate.ts` always points at the real `drizzle/` folder (which now includes
     * 0051), so it cannot be reused here: this scratch database needs the schema as it stood
     * right BEFORE 0051. Applying migrations by hand against the trimmed folder mirrors what
     * that module does, minus the hardcoded path.
     */
    const migrationDb = createDatabase({ url, maxConnections: 1 });
    try {
      await migrateDrizzle(migrationDb, { migrationsFolder });
      await ensurePartitions(migrationDb);
    } finally {
      await closeDatabase(migrationDb);
    }
  } finally {
    await fsp.rm(migrationsFolder, { recursive: true, force: true });
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  return {
    client,
    applyMigration0051: async () => {
      for (const statement of statementsOf0051()) {
        await client.query(statement);
      }
    },
    drop: async () => {
      await client.end();
      const closer = new pg.Client({ connectionString: withDatabase(URL_DONO, 'postgres') });
      await closer.connect();
      try {
        await closer.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      } finally {
        await closer.end();
      }
    },
  };
}
