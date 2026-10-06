import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { noTenant } = await import('../src/database.js');
type Cenario = Awaited<ReturnType<typeof montarCenario>>;
let c: Cenario;

const ROLLBACK = new Error('rollback-da-migration-0092');

beforeAll(async () => {
  c = await montarCenario(`mig92-${randomUUID().slice(0, 8)}`);
}, 180_000);
afterAll(async () => { await c?.encerrar(); });

describe('migration 0092: código do bloco e histórico de status', () => {
  it('refaz as colunas de código a partir do bloco existente e é idempotente (transação revertida)', async () => {
    const arquivo = new URL('../../../packages/db/drizzle/0092_codigo_do_bloco_e_historico_de_status.sql', import.meta.url);
    const passos = readFileSync(arquivo, 'utf8').split('--> statement-breakpoint');
    const t = c.tenantId;

    await expect(
      c.dono.transaction(async (tx) => {
        const um = async <T>(q: ReturnType<typeof sql>) => (await tx.execute<T & Record<string, unknown>>(q)).rows[0] as T;

        const versao = (await um<{ id: string }>(sql`
          insert into fluxo_versao (tenant_id, fluxo_id, versao) values (${t}, ${c.flowId}, 1) returning id`)).id;
        const bloco = (await um<{ id: string }>(sql`
          insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${t}, ${versao}, 'desk:comercial', 'Comercial', 'mensagem') returning id`)).id;
        const anterior = (await um<{ id: string }>(sql`
          insert into bloco (tenant_id, versao_id, codigo, nome, tipo) values (${t}, ${versao}, 'menu', 'Menu', 'mensagem') returning id`)).id;
        const contato = (await um<{ id: string }>(sql`insert into contato (tenant_id, nome) values (${t}, 'm92') returning id`)).id;
        const execucao = (await um<{ id: string }>(sql`
          insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, bloco_anterior_id)
          values (${t}, ${versao}, ${contato}, ${c.inboxId}, ${anterior}) returning id`)).id;
        const msg = (await um<{ id: string }>(sql`
          insert into mensagem (tenant_id, execucao_id, direcao, autor_tipo, tipo, conteudo, bloco_atual_id, bloco_atual_nome, bloco_anterior_id, bloco_anterior_nome)
          values (${t}, ${execucao}, 'saida', 'bot', 'texto', 'oi', ${bloco}, 'Comercial', ${anterior}, 'Menu') returning id`)).id;
        // Mensagem de subfluxo: sem id de bloco, o código fica como veio (nulo no legado).
        const semBloco = (await um<{ id: string }>(sql`
          insert into mensagem (tenant_id, execucao_id, direcao, autor_tipo, tipo, conteudo, bloco_atual_nome)
          values (${t}, ${execucao}, 'saida', 'bot', 'texto', 'sub', 'onboarding') returning id`)).id;

        // O banco já migrou: derruba o que a 0092 cria para exercitar a migration inteira.
        await tx.execute(sql`alter table mensagem drop column bloco_atual_codigo, drop column bloco_anterior_codigo`);
        await tx.execute(sql`alter table execucao_fluxo drop column bloco_anterior_codigo`);
        await tx.execute(sql`drop table status_atendente_historico`);

        for (const passo of passos) if (passo.trim()) await tx.execute(sql.raw(passo));

        const m = await um<{ atual: string | null; anterior: string | null }>(
          sql`select bloco_atual_codigo as atual, bloco_anterior_codigo as anterior from mensagem where id = ${msg}`);
        expect(m).toEqual({ atual: 'desk:comercial', anterior: 'menu' });
        const s = await um<{ atual: string | null; anterior: string | null }>(
          sql`select bloco_atual_codigo as atual, bloco_anterior_codigo as anterior from mensagem where id = ${semBloco}`);
        expect(s).toEqual({ atual: null, anterior: null });
        expect((await um<{ anterior: string | null }>(sql`select bloco_anterior_codigo as anterior from execucao_fluxo where id = ${execucao}`)).anterior).toBe('menu');

        // Reaplicar não falha nem muda nada (idempotente).
        for (const passo of passos) if (passo.trim()) await tx.execute(sql.raw(passo));
        expect((await um<{ atual: string | null }>(sql`select bloco_atual_codigo as atual from mensagem where id = ${msg}`)).atual).toBe('desk:comercial');

        // CHECK de estado do histórico.
        await expect(tx.transaction((n) => n.execute(sql`
          insert into status_atendente_historico (tenant_id, usuario_id, de, para) values (${t}, ${c.agentId}, 'Online', 'sonolento')`))).rejects.toThrow();

        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    // Fora da transação a tabela segue de pé.
    const { rows } = await c.dono.execute<{ n: string }>(sql`select count(*)::text as n from status_atendente_historico`);
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(0);
  });

  it('histórico de status é isolado por tenant (RLS) e aceita só o próprio tenant', async () => {
    const outro = (await c.dono.execute<{ id: string }>(sql`
      insert into tenant (nome, slug) values ('mig92 outro', ${`mig92-outro-${randomUUID().slice(0, 8)}`}) returning id`)).rows[0]!.id;
    try {
      await noTenant(c.tenantId, (tx) => tx.execute(sql`
        insert into status_atendente_historico (tenant_id, usuario_id, de, para, motivo)
        values (${c.tenantId}, ${c.agentId}, 'Online', 'Pause', 'Almoço')`));

      const proprio = await noTenant(c.tenantId, (tx) => tx.execute<{ n: string }>(
        sql`select count(*)::text as n from status_atendente_historico where usuario_id = ${c.agentId}::uuid`));
      expect(Number(proprio.rows[0]?.n)).toBe(1);

      const alheio = await noTenant(outro, (tx) => tx.execute<{ n: string }>(
        sql`select count(*)::text as n from status_atendente_historico where usuario_id = ${c.agentId}::uuid`));
      expect(Number(alheio.rows[0]?.n)).toBe(0);

      await expect(
        noTenant(outro, (tx) => tx.execute(sql`
          insert into status_atendente_historico (tenant_id, usuario_id, de, para) values (${c.tenantId}, ${c.agentId}, 'Online', 'Offline')`)),
      ).rejects.toThrow();
    } finally {
      await c.dono.execute(sql`delete from tenant where id = ${outro}::uuid`);
    }
  });
});
