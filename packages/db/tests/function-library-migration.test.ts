import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateDrizzle } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, createDatabase } from '../src/cliente.js';
import { ensurePartitions } from '../src/partitions.js';
import { URL_DONO } from './ajuda.js';

/**
 * Migration 0054 (P10, D-57): per-flow functions become tenant functions. This test migrates a
 * throwaway database up to (not including) 0054, inserts per-flow and tenant functions with
 * clashing names, applies 0054 by hand and checks that every row survives with its id, that the
 * clashes are renamed deterministically (tenant row first, then oldest) with a note, and that the
 * name is unique per tenant afterwards.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(AQUI, '..', 'drizzle');
const MIGRATION_TAG = '0054_funcao_da_conta';

interface JournalEntry { idx: number; version: string; when: number; tag: string; breakpoints: boolean }

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function migrationsFolderBefore0054(): Promise<string> {
  const journal = JSON.parse(await fsp.readFile(path.join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8')) as {
    version: string; dialect: string; entries: JournalEntry[];
  };
  const target = journal.entries.find((entry) => entry.tag === MIGRATION_TAG)!;
  const before = journal.entries.filter((entry) => entry.when < target.when);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pipe-db-before-0054-'));
  await fsp.mkdir(path.join(tempDir, 'meta'));
  await fsp.writeFile(
    path.join(tempDir, 'meta', '_journal.json'),
    JSON.stringify({ version: journal.version, dialect: journal.dialect, entries: before }),
  );
  await Promise.all(before.map((entry) =>
    fsp.copyFile(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), path.join(tempDir, `${entry.tag}.sql`))));
  return tempDir;
}

describe('migration 0054: function library moves to the tenant', () => {
  const database = `pipe_test_0054_${randomUUID().replace(/-/g, '')}`;
  let client: pg.Client;
  let tenantA: string;
  let tenantB: string;
  const ids: Record<string, string> = {};

  async function insertFlow(tenantId: string, nome: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into fluxo (tenant_id, nome, tipo, estado, short_name) values ($1, $2, 'fluxo', 'rascunho', $3) returning id`,
      [tenantId, nome, `f-${randomUUID().slice(0, 8)}`],
    );
    return rows[0]!.id;
  }

  async function insertFunction(key: string, tenantId: string, flowId: string | null, nome: string, createdAt: string, descricao: string | null = null): Promise<void> {
    const { rows } = await client.query<{ id: string }>(
      `insert into funcao_do_fluxo (tenant_id, fluxo_id, nome, descricao, parametros, codigo, escopo, criado_em)
       values ($1, $2, $3, $4, '["a"]'::jsonb, $5, $6, $7) returning id`,
      [tenantId, flowId, nome, descricao, `function ${nome}(a) { return '${key}'; }`, flowId ? 'flow' : 'tenant', createdAt],
    );
    ids[key] = rows[0]!.id;
  }

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: withDatabase(URL_DONO, 'postgres') });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
    const url = withDatabase(URL_DONO, database);
    const folder = await migrationsFolderBefore0054();
    try {
      const migrationDb = createDatabase({ url, maxConnections: 1 });
      try {
        await migrateDrizzle(migrationDb, { migrationsFolder: folder });
        await ensurePartitions(migrationDb);
      } finally {
        await closeDatabase(migrationDb);
      }
    } finally {
      await fsp.rm(folder, { recursive: true, force: true });
    }
    client = new pg.Client({ connectionString: url });
    await client.connect();

    const tenants = await client.query<{ id: string }>(
      `insert into tenant (nome, slug) values ($1, $2), ($3, $4) returning id`,
      ['Conta A', `conta-a-${randomUUID()}`, 'Conta B', `conta-b-${randomUUID()}`],
    );
    tenantA = tenants.rows[0]!.id;
    tenantB = tenants.rows[1]!.id;
    const vendas = await insertFlow(tenantA, 'Vendas');
    const suporte = await insertFlow(tenantA, 'Suporte');
    const cobranca = await insertFlow(tenantA, 'Cobrança');
    const outroTenant = await insertFlow(tenantB, 'Vendas B');

    // "formatar": tenant-wide row exists, so both flow rows are renamed (older first → _2).
    await insertFunction('formatarConta', tenantA, null, 'formatar', '2026-03-01T00:00:00Z');
    await insertFunction('formatarVendas', tenantA, vendas, 'formatar', '2026-01-01T00:00:00Z', 'Formata CPF');
    await insertFunction('formatarSuporte', tenantA, suporte, 'formatar', '2026-02-01T00:00:00Z');
    // "saudar": only flow rows; the oldest keeps the name, the next one skips the taken "saudar_2".
    await insertFunction('saudarSuporte', tenantA, suporte, 'saudar', '2026-01-05T00:00:00Z');
    await insertFunction('saudarVendas', tenantA, vendas, 'saudar', '2026-01-10T00:00:00Z');
    await insertFunction('saudar2Cobranca', tenantA, cobranca, 'saudar_2', '2026-01-01T00:00:00Z');
    // No clash: a lone flow function and the same name in another tenant.
    await insertFunction('unica', tenantA, cobranca, 'calcularTotal', '2026-01-01T00:00:00Z');
    await insertFunction('outroTenant', tenantB, outroTenant, 'formatar', '2026-01-01T00:00:00Z');

    const statements = fs.readFileSync(path.join(DRIZZLE_DIR, `${MIGRATION_TAG}.sql`), 'utf8').split('--> statement-breakpoint');
    for (const statement of statements) await client.query(statement);
  }, 180_000);

  afterAll(async () => {
    await client?.end();
    const closer = new pg.Client({ connectionString: withDatabase(URL_DONO, 'postgres') });
    await closer.connect();
    try {
      await closer.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await closer.end();
    }
  });

  async function row(key: string): Promise<{ tenant_id: string; nome: string; descricao: string | null; codigo: string }> {
    const { rows } = await client.query(`select tenant_id, nome, descricao, codigo from funcao_do_fluxo where id = $1`, [ids[key]]);
    expect(rows).toHaveLength(1);
    return rows[0] as { tenant_id: string; nome: string; descricao: string | null; codigo: string };
  }

  it('keeps every row with its id and code', async () => {
    const { rows } = await client.query<{ total: string }>(`select count(*)::text as total from funcao_do_fluxo`);
    expect(Number(rows[0]!.total)).toBe(Object.keys(ids).length);
    for (const key of Object.keys(ids)) expect((await row(key)).codigo).toContain(`'${key}'`);
  });

  it('drops the flow scope columns', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'funcao_do_fluxo'`,
    );
    const columns = rows.map((r) => r.column_name);
    expect(columns).not.toContain('fluxo_id');
    expect(columns).not.toContain('escopo');
  });

  it('renames clashes deterministically and notes the origin', async () => {
    expect((await row('formatarConta')).nome).toBe('formatar');
    expect((await row('formatarVendas')).nome).toBe('formatar_2');
    expect((await row('formatarVendas')).descricao).toBe('Formata CPF (Renomeada de "formatar" ao passar para a biblioteca da conta; vinha do fluxo "Vendas".)');
    expect((await row('formatarSuporte')).nome).toBe('formatar_3');
    expect((await row('saudarSuporte')).nome).toBe('saudar');
    expect((await row('saudarSuporte')).descricao).toBeNull();
    expect((await row('saudar2Cobranca')).nome).toBe('saudar_2');
    expect((await row('saudarVendas')).nome).toBe('saudar_3');
    expect((await row('saudarVendas')).descricao).toContain('vinha do fluxo "Vendas"');
  });

  it('leaves unclashed names and other tenants alone', async () => {
    expect((await row('unica')).nome).toBe('calcularTotal');
    expect((await row('outroTenant')).nome).toBe('formatar');
    expect((await row('outroTenant')).tenant_id).toBe(tenantB);
  });

  it('makes the name unique per tenant', async () => {
    await expect(client.query(
      `insert into funcao_do_fluxo (tenant_id, nome, codigo) values ($1, 'calcularTotal', 'function calcularTotal() {}')`,
      [tenantA],
    )).rejects.toMatchObject({ code: '23505' });
  });
});
