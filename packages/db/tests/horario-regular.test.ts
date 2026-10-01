import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comTenant } from '../src/tenant.js';
import { montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

describe('Horário regular e períodos com data e hora', () => {
  let cenario: Cenario;
  beforeAll(async () => {
    cenario = await montarCenario(`hrg${Date.now()}`);
  });
  afterAll(async () => {
    await cenario?.encerrar();
  });

  const novo = (tenant: string, nome: string, regular: boolean) =>
    cenario.dono.execute<{ id: string }>(
      sql`insert into horario_atendimento (tenant_id, nome, regular) values (${tenant}::uuid, ${nome}, ${regular}) returning id`,
    );

  it('nasce não regular e sem descrição; recusa descrição acima de 300', async () => {
    const r = await novo(cenario.tenantA, 'H1', false);
    const linha = await cenario.dono.execute<{ regular: boolean; descricao: string | null }>(
      sql`select regular, descricao from horario_atendimento where id = ${r.rows[0]!.id}::uuid`,
    );
    expect(linha.rows[0]).toEqual({ regular: false, descricao: null });
    await expect(
      cenario.dono.execute(sql`update horario_atendimento set descricao = ${'x'.repeat(301)} where id = ${r.rows[0]!.id}::uuid`),
    ).rejects.toThrow();
  });

  it('só um horário regular por tenant; outro tenant pode ter o seu', async () => {
    await novo(cenario.tenantA, 'R1', true);
    await expect(novo(cenario.tenantA, 'R2', true)).rejects.toThrow();
    await novo(cenario.tenantA, 'R3', false);
    await expect(novo(cenario.tenantB, 'R1', true)).resolves.toBeDefined();
  });

  it('período exige início e fim juntos e fim depois do início; vários períodos no mesmo dia', async () => {
    const h = (await novo(cenario.tenantA, 'P1', false)).rows[0]!.id;
    const ins = (inicio: string | null, fim: string | null) =>
      cenario.dono.execute(sql`insert into horario_excecao (tenant_id, horario_id, data, fechado, inicio_em, fim_em, dia_completo)
        values (${cenario.tenantA}::uuid, ${h}::uuid, '2026-12-24', true, ${inicio}::timestamptz, ${fim}::timestamptz, false)`);
    await expect(ins('2026-12-24T10:00:00Z', null)).rejects.toThrow();
    await expect(ins('2026-12-24T12:00:00Z', '2026-12-24T10:00:00Z')).rejects.toThrow();
    await ins('2026-12-24T10:00:00Z', '2026-12-24T12:00:00Z');
    await ins('2026-12-24T14:00:00Z', '2026-12-24T16:00:00Z');
  });

  it('a exceção de um dia continua única por data', async () => {
    const h = (await novo(cenario.tenantA, 'D1', false)).rows[0]!.id;
    const ins = () =>
      cenario.dono.execute(sql`insert into horario_excecao (tenant_id, horario_id, data, fechado) values (${cenario.tenantA}::uuid, ${h}::uuid, '2026-05-01', true)`);
    await ins();
    await expect(ins()).rejects.toThrow();
  });

  it('o tenant B não enxerga nem altera horário do tenant A', async () => {
    const r = await comTenant(cenario.app, cenario.tenantB, async (tx) =>
      tx.execute(sql`update horario_atendimento set regular = false, descricao = 'x' where tenant_id = ${cenario.tenantA}::uuid returning id`),
    );
    expect(r.rows).toHaveLength(0);
  });

  it('a migração leva a exceção fechada antiga para o dia inteiro no fuso do horário (idempotente)', async () => {
    const h = (await cenario.dono.execute<{ id: string }>(
      sql`insert into horario_atendimento (tenant_id, nome, fuso) values (${cenario.tenantA}::uuid, 'Antigo', 'America/Sao_Paulo') returning id`,
    )).rows[0]!.id;
    await cenario.dono.execute(
      sql`insert into horario_excecao (tenant_id, horario_id, data, fechado) values (${cenario.tenantA}::uuid, ${h}::uuid, '2026-09-07', true)`,
    );
    // mesma instrução da migração 0088
    const preencher = sql`UPDATE horario_excecao e SET inicio_em = (e.data::timestamp) AT TIME ZONE h.fuso, fim_em = ((e.data + 1)::timestamp) AT TIME ZONE h.fuso, dia_completo = true FROM horario_atendimento h WHERE h.id = e.horario_id AND e.fechado AND e.inicio_em IS NULL AND e.horario_id = ${h}::uuid`;
    await cenario.dono.execute(preencher);
    await cenario.dono.execute(preencher);
    const r = await cenario.dono.execute<{ i: string; f: string }>(
      sql`select to_char(inicio_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI') i, to_char(fim_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI') f from horario_excecao where horario_id = ${h}::uuid`,
    );
    expect(r.rows).toEqual([{ i: '2026-09-07T03:00', f: '2026-09-08T03:00' }]);
  });
});
