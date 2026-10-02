import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCenario } from './ajuda.js';
import type { Cenario } from './ajuda.js';

describe('Modelo de mensagem: fluxo de retorno e ativo', () => {
  let cenario: Cenario;
  beforeAll(async () => {
    cenario = await montarCenario(`mfr${Date.now()}`);
  });
  afterAll(async () => {
    await cenario?.encerrar();
  });

  async function modelo() {
    const canal = await cenario.dono.execute<{ id: string }>(
      sql`insert into canal (tenant_id, tipo, nome) values (${cenario.tenantA}::uuid, 'whatsapp_cloud', 'WA') returning id`,
    );
    const m = await cenario.dono.execute<{ id: string; ativo: boolean; fluxo_retorno_bloco_id: string | null }>(
      sql`insert into template_mensagem (tenant_id, canal_id, nome, categoria, corpo)
          values (${cenario.tenantA}::uuid, ${canal.rows[0]!.id}::uuid, 'm1', 'utilidade', 'oi') returning id, ativo, fluxo_retorno_bloco_id`,
    );
    return m.rows[0]!;
  }

  it('nasce ativo e sem bloco de retorno', async () => {
    const m = await modelo();
    expect(m.ativo).toBe(true);
    expect(m.fluxo_retorno_bloco_id).toBeNull();
  });

  it('remover o bloco do Builder zera o vínculo sem apagar o modelo', async () => {
    const m = await modelo();
    const v = await cenario.dono.execute<{ id: string }>(
      sql`insert into fluxo_versao (tenant_id, fluxo_id, versao) values (${cenario.tenantA}::uuid, ${cenario.flowA}::uuid, 1) returning id`,
    );
    const b = await cenario.dono.execute<{ id: string }>(
      sql`insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${cenario.tenantA}::uuid, ${v.rows[0]!.id}::uuid, 'b1', 'B1', 'mensagem') returning id`,
    );
    await cenario.dono.execute(
      sql`update template_mensagem set fluxo_retorno_bloco_id = ${b.rows[0]!.id}::uuid where id = ${m.id}::uuid`,
    );
    await cenario.dono.execute(sql`delete from bloco where id = ${b.rows[0]!.id}::uuid`);
    const depois = await cenario.dono.execute<{ fluxo_retorno_bloco_id: string | null }>(
      sql`select fluxo_retorno_bloco_id from template_mensagem where id = ${m.id}::uuid`,
    );
    expect(depois.rows[0]!.fluxo_retorno_bloco_id).toBeNull();
  });

  it('recusa bloco inexistente', async () => {
    const m = await modelo();
    await expect(
      cenario.dono.execute(
        sql`update template_mensagem set fluxo_retorno_bloco_id = gen_random_uuid() where id = ${m.id}::uuid`,
      ),
    ).rejects.toThrow();
  });
});
