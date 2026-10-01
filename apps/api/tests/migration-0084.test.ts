import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
type Cenario = Awaited<ReturnType<typeof montarCenario>>;
let c: Cenario;
// The retired state, spelled out only to seed legacy rows.
const LEGADO = ['com', 'bot'].join('_');

beforeAll(async () => {
  c = await montarCenario(`mig84-${randomUUID().slice(0, 8)}`);
}, 180_000);
afterAll(async () => { await c?.encerrar(); });

const um = async <T>(q: ReturnType<typeof sql>) => (await c.dono.execute<T & Record<string, unknown>>(q)).rows[0] as T;

describe('migration 0084: conversas legadas do bot', () => {
  it('moves the talk of a bot-only conversation to its execution and keeps real tickets', async () => {
    const arquivo = new URL('../../../packages/db/drizzle/0084_conversa_estado_sem_com_bot.sql', import.meta.url);
    const passos = readFileSync(arquivo, 'utf8').split('--> statement-breakpoint');
    const t = c.tenantId;
    const versao = await um<{ id: string }>(sql`insert into fluxo_versao (tenant_id, fluxo_id, versao, estado) values (${t}, ${c.flowId}, 9, 'publicada') returning id`);
    const contato = async (n: string) => (await um<{ id: string }>(sql`insert into contato (tenant_id, nome) values (${t}, ${n}) returning id`)).id;
    const soBot = await contato('so-bot');
    const ticket = await contato('ticket');

    // The old check allowed the retired bot state; recreate it so legacy rows can exist.
    await c.dono.execute(sql`alter table conversa drop constraint conversa_estado_ck`);
    await c.dono.execute(sql.raw(`alter table conversa add constraint conversa_estado_ck check (estado in ('${LEGADO}','na_fila','atribuida','em_atendimento','em_espera','encerrada'))`));

    const botConv = (await um<{ id: string }>(sql`insert into conversa (tenant_id, inbox_id, contato_id, estado) values (${t}, ${c.inboxId}, ${soBot}, ${LEGADO}) returning id`)).id;
    const exec = (await um<{ id: string }>(sql`insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado) values (${t}, ${versao.id}, ${botConv}, ${soBot}, 'aguardando') returning id`)).id;
    const msg = (await um<{ id: string }>(sql`insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo) values (${t}, ${botConv}, 'entrada', 'contato', 'texto', 'oi') returning id`)).id;
    const real = (await um<{ id: string }>(sql`insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado) values (${t}, ${c.inboxId}, ${ticket}, ${c.queueId}, 'na_fila') returning id`)).id;
    await c.dono.execute(sql`insert into evento_atendimento (tenant_id, conversa_id, tipo) values (${t}, ${real}, 'criada')`);

    for (const passo of passos) if (passo.trim()) await c.dono.execute(sql.raw(passo));

    expect((await c.dono.execute(sql`select 1 from conversa where id = ${botConv}`)).rows).toHaveLength(0);
    const e = await um<{ conversa_id: string | null; inbox_id: string }>(sql`select conversa_id, inbox_id from execucao_fluxo where id = ${exec}`);
    expect(e).toEqual({ conversa_id: null, inbox_id: c.inboxId });
    const m = await um<{ conversa_id: string | null; execucao_id: string }>(sql`select conversa_id, execucao_id from mensagem where id = ${msg}`);
    expect(m).toEqual({ conversa_id: null, execucao_id: exec });
    expect((await c.dono.execute(sql`select 1 from conversa where id = ${real}`)).rows).toHaveLength(1);
    await expect(c.dono.execute(sql`update conversa set estado = ${LEGADO} where id = ${real}`)).rejects.toThrow();
  });
});
