import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, expect, it } from 'vitest';
import { montarDoisFluxos } from './ajuda.js';

let encerrar: (() => Promise<void>) | undefined;

afterEach(async () => {
  await encerrar?.();
});

it('montarDoisFluxos cria dois fluxos com filas próprias e um atendente nas duas', async () => {
  const f = await montarDoisFluxos(`dois-${randomUUID().slice(0, 8)}`);
  encerrar = f.cenario.encerrar;
  const { rows } = await f.cenario.dono.execute<{ fluxo_id: string }>(
    sql`select fluxo_id from fila where id in (${f.queueA}, ${f.queueB}) order by nome`,
  );
  expect(rows.map((r) => r.fluxo_id).sort()).toEqual([f.flowA, f.flowB].sort());
  const { rows: vinculos } = await f.cenario.dono.execute(
    sql`select 1 from fila_atendente where usuario_id = ${f.userShared}`,
  );
  expect(vinculos).toHaveLength(2);
});
