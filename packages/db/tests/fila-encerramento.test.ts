import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comTenant } from '../src/tenant.js';
import { montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

describe('Colunas de tags e encerramento automático da fila', () => {
  let cenario: Cenario;
  beforeAll(async () => {
    cenario = await montarCenario(`enc${Date.now()}`);
  });
  afterAll(async () => {
    await cenario?.encerrar();
  });

  it('nasce com etiquetas vazias e encerramento nulo', async () => {
    const r = await comTenant(cenario.app, cenario.tenantA, async (tx) =>
      tx.execute<{ etiquetas: unknown; encerramento_automatico: unknown }>(
        sql`select etiquetas, encerramento_automatico from fila where id = ${cenario.queueA}::uuid`,
      ),
    );
    expect(r.rows[0]).toEqual({ etiquetas: [], encerramento_automatico: null });
  });

  it('recusa etiquetas que não sejam array e encerramento que não seja objeto', async () => {
    await expect(
      cenario.dono.execute(sql`update fila set etiquetas = '{}'::jsonb where id = ${cenario.queueA}::uuid`),
    ).rejects.toThrow();
    await expect(
      cenario.dono.execute(sql`update fila set encerramento_automatico = '[]'::jsonb where id = ${cenario.queueA}::uuid`),
    ).rejects.toThrow();
  });

  it('o tenant B não altera a configuração da fila do tenant A', async () => {
    const r = await comTenant(cenario.app, cenario.tenantB, async (tx) =>
      tx.execute(sql`update fila set etiquetas = '["x"]'::jsonb where id = ${cenario.queueA}::uuid returning id`),
    );
    expect(r.rows).toHaveLength(0);
  });
});
