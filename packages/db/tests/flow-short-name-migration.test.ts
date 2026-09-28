import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scratchDatabaseBefore0051 } from './flow-short-name-migration-helpers.js';
import type { ScratchDatabaseBefore0051 } from './flow-short-name-migration-helpers.js';

/**
 * Migration 0051 (D-52): every flow gets a non-null `short_name`, and among LIVE flows
 * (`estado <> 'arquivado'`) it becomes unique per tenant. This test applies every earlier
 * migration to a throwaway database, inserts pre-0051 fixtures by hand (null short names,
 * duplicate live short names, an archived flow holding a name a live flow also wants), applies
 * 0051, and checks the backfill, the dedup suffixes, the NOT NULL column and the unique index —
 * the four cases in the plan's `<behavior>`.
 */
describe('migration 0051: flow short_name backfill, dedup and uniqueness', () => {
  let db: ScratchDatabaseBefore0051;
  let tenantA: string;
  let tenantB: string;
  let idMeuBot: string;
  let idMeuBotLowercase: string;
  let idOutro: string;
  let idArchivedMeuBot: string;
  let idTenantBMeuBot: string;

  async function insertFlow(options: {
    tenantId: string;
    nome: string;
    shortName?: string | null;
    estado?: string;
    createdAt: string;
  }): Promise<string> {
    const { rows } = await db.client.query<{ id: string }>(
      `insert into fluxo (tenant_id, nome, tipo, estado, short_name, criado_em)
       values ($1, $2, 'fluxo', $3, $4, $5)
       returning id`,
      [
        options.tenantId,
        options.nome,
        options.estado ?? 'rascunho',
        options.shortName ?? null,
        options.createdAt,
      ],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    db = await scratchDatabaseBefore0051();

    const tenants = await db.client.query<{ id: string }>(
      `insert into tenant (nome, slug) values ($1, $2), ($3, $4) returning id`,
      [`Tenant A ${randomUUID()}`, `tenant-a-${randomUUID()}`, `Tenant B ${randomUUID()}`, `tenant-b-${randomUUID()}`],
    );
    tenantA = tenants.rows[0]!.id;
    tenantB = tenants.rows[1]!.id;

    /*
     * Archived first (oldest `criado_em`) and holding the short name a live flow will also
     * resolve to: if the dedup step wrongly counted archived rows, "Meu Bot" (the next oldest)
     * would be treated as the duplicate instead of staying clean.
     */
    idArchivedMeuBot = await insertFlow({
      tenantId: tenantA,
      nome: 'Meu Bot Antigo',
      shortName: 'meu-bot',
      estado: 'arquivado',
      createdAt: '2026-01-01T00:00:00Z',
    });
    idMeuBot = await insertFlow({
      tenantId: tenantA,
      nome: 'Meu Bot',
      shortName: null,
      createdAt: '2026-01-02T00:00:00Z',
    });
    idMeuBotLowercase = await insertFlow({
      tenantId: tenantA,
      nome: 'meu-bot',
      shortName: null,
      createdAt: '2026-01-03T00:00:00Z',
    });
    idOutro = await insertFlow({
      tenantId: tenantA,
      nome: 'Outro',
      shortName: null,
      createdAt: '2026-01-04T00:00:00Z',
    });
    idTenantBMeuBot = await insertFlow({
      tenantId: tenantB,
      nome: 'Meu Bot',
      shortName: null,
      createdAt: '2026-01-02T00:00:00Z',
    });

    await db.applyMigration0051();
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('backfills null short names with nomeCurto(nome) and breaks ties among live flows, oldest first', async () => {
    const { rows } = await db.client.query<{ id: string; short_name: string }>(
      `select id, short_name from fluxo where tenant_id = $1 and estado <> 'arquivado' order by criado_em`,
      [tenantA],
    );
    expect(rows).toEqual([
      { id: idMeuBot, short_name: 'meu-bot' },
      { id: idMeuBotLowercase, short_name: 'meu-bot-2' },
      { id: idOutro, short_name: 'outro' },
    ]);
  });

  it('does not let an archived flow count toward dedup, and leaves its short_name untouched', async () => {
    const { rows } = await db.client.query<{ short_name: string; estado: string }>(
      `select short_name, estado from fluxo where id = $1`,
      [idArchivedMeuBot],
    );
    expect(rows[0]).toEqual({ short_name: 'meu-bot', estado: 'arquivado' });
  });

  it('keeps short names independent per tenant', async () => {
    const { rows } = await db.client.query<{ short_name: string }>(
      `select short_name from fluxo where id = $1`,
      [idTenantBMeuBot],
    );
    expect(rows[0]?.short_name).toBe('meu-bot');
  });

  it('sets short_name NOT NULL', async () => {
    await expect(
      db.client.query(
        `insert into fluxo (tenant_id, nome, tipo, estado) values ($1, 'Sem Nome Curto', 'fluxo', 'rascunho')`,
        [tenantA],
      ),
    ).rejects.toThrow(/null value in column "short_name"/);
  });

  it('rejects a second live flow with a short_name already used in the same tenant, but allows it in another tenant', async () => {
    await expect(
      db.client.query(
        `insert into fluxo (tenant_id, nome, tipo, estado, short_name) values ($1, 'Colide', 'fluxo', 'rascunho', 'outro')`,
        [tenantA],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint "fluxo_short_name_vivo_uk"/);

    const outroTenant = await db.client.query<{ id: string }>(
      `insert into fluxo (tenant_id, nome, tipo, estado, short_name) values ($1, 'Outro', 'fluxo', 'rascunho', 'outro') returning id`,
      [tenantB],
    );
    expect(outroTenant.rows[0]?.id).toBeDefined();
  });

  it('frees a short_name for reuse once its flow is archived', async () => {
    const efemero = await insertFlow({
      tenantId: tenantA,
      nome: 'Efêmero',
      shortName: 'efemero',
      createdAt: '2026-01-05T00:00:00Z',
    });
    await db.client.query(`update fluxo set estado = 'arquivado' where id = $1`, [efemero]);

    const reused = await db.client.query<{ id: string }>(
      `insert into fluxo (tenant_id, nome, tipo, estado, short_name) values ($1, 'Novo Efêmero', 'fluxo', 'rascunho', 'efemero') returning id`,
      [tenantA],
    );
    expect(reused.rows[0]?.id).toBeDefined();
  });
});
