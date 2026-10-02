import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

describe('tenant.configuracao_atendimento', () => {
  let cenario: Cenario;
  beforeAll(async () => {
    cenario = await montarCenario(`tca${Date.now()}`);
  });
  afterAll(async () => {
    await cenario?.encerrar();
  });

  it('nasce como objeto vazio', async () => {
    const r = await cenario.dono.execute<{ c: unknown }>(
      sql`select configuracao_atendimento as c from tenant where id = ${cenario.tenantA}::uuid`,
    );
    expect(r.rows[0]!.c).toEqual({});
  });

  it('aceita objeto e recusa array, texto e nulo', async () => {
    await cenario.dono.execute(
      sql`update tenant set configuracao_atendimento = '{"a":1}'::jsonb where id = ${cenario.tenantA}::uuid`,
    );
    for (const ruim of ["'[]'::jsonb", "'\"x\"'::jsonb", 'null']) {
      await expect(
        cenario.dono.execute(
          sql.raw(`update tenant set configuracao_atendimento = ${ruim} where id = '${cenario.tenantA}'`),
        ),
      ).rejects.toThrow();
    }
  });
});
